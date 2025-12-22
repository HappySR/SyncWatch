import { supabase } from '$lib/supabase';
import type { Room, RoomMember } from '$lib/types';
import { authStore } from './auth.svelte';

class RoomStore {
	currentRoom = $state<Room | null>(null);
	members = $state<RoomMember[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);

	private roomChannel: any = null;
	private presenceChannel: any = null;
	private heartbeatInterval: any = null;
	private joinTimeout: any = null;

	async createRoom(name: string) {
		if (!authStore.user) throw new Error('Not authenticated');

		this.loading = true;
		this.error = null;

		try {
			const { data: room, error: roomError } = await supabase
				.from('rooms')
				.insert({
					name,
					host_id: authStore.user.id,
					is_public: true,
					current_video_url: null,
					current_video_type: null,
					video_time: 0,
					is_playing: false
				})
				.select()
				.single();

			if (roomError) throw roomError;

			const { error: memberError } = await supabase.from('room_members').insert({
				room_id: room.id,
				user_id: authStore.user.id,
				has_controls: true
			});

			if (memberError) throw memberError;

			return room.id;
		} catch (err: any) {
			this.error = err.message;
			throw err;
		} finally {
			this.loading = false;
		}
	}

	async joinRoom(roomId: string) {
		if (!authStore.user) throw new Error('Not authenticated');

		// Clear any existing state first
		if (this.joinTimeout) {
			clearTimeout(this.joinTimeout);
			this.joinTimeout = null;
		}

		this.loading = true;
		this.error = null;

		console.log('🚀 Starting join room process for:', roomId);

		this.joinTimeout = setTimeout(() => {
			if (this.loading) {
				console.error('⏱️ Join room timeout reached');
				this.error = 'Join room timeout. Please try again.';
				this.loading = false;
			}
		}, 15000);

		try {
			console.log('1️⃣ Checking if room exists...');

			const { data: roomExists, error: roomCheckError } = await supabase
				.from('rooms')
				.select('id, name, is_public')
				.eq('id', roomId)
				.single();

			if (roomCheckError || !roomExists) {
				throw new Error('Room not found');
			}

			if (!roomExists.is_public) {
				throw new Error('This room is private');
			}

			console.log('2️⃣ Room exists, checking membership...');

			const { data: existingMember } = await supabase
				.from('room_members')
				.select('id')
				.eq('room_id', roomId)
				.eq('user_id', authStore.user.id)
				.maybeSingle();

			if (existingMember) {
				console.log('3️⃣ Already a member, loading room...');
				await this.loadRoom(roomId);
				this.subscribeToRoom(roomId);
				this.startPresenceTracking(roomId);
				
				clearTimeout(this.joinTimeout);
				this.loading = false;
				console.log('✅ Successfully rejoined existing room');
				return;
			}

			console.log('4️⃣ Not a member, inserting new membership...');

			const { data, error } = await supabase
				.from('room_members')
				.insert({
					room_id: roomId,
					user_id: authStore.user.id,
					has_controls: true,
					joined_at: new Date().toISOString()
				})
				.select()
				.single();

			if (error) {
				console.error('❌ Insert error:', error);
				if (error.message?.includes('row-level security')) {
					throw new Error('Permission denied. You may not have access to this room.');
				}
				throw error;
			}

			console.log('5️⃣ Membership created, loading room data...');

			await this.loadRoom(roomId);
			
			console.log('6️⃣ Setting up subscriptions...');
			this.subscribeToRoom(roomId);
			this.startPresenceTracking(roomId);

			clearTimeout(this.joinTimeout);
			this.loading = false;
			console.log('✅ Successfully joined new room');
		} catch (err: any) {
			console.error('❌ Join room failed:', err);
			this.error = err.message;
			clearTimeout(this.joinTimeout);
			this.loading = false;
			throw err;
		}
	}

	async loadRoom(roomId: string) {
		try {
			const { data: room, error } = await supabase
				.from('rooms')
				.select('*')
				.eq('id', roomId)
				.single();

			if (error) throw error;
			this.currentRoom = room;

			await this.loadMembers(roomId);
		} catch (err: any) {
			throw new Error('Failed to load room data');
		}
	}

	async loadMembers(roomId: string) {
		try {
			const { data, error } = await supabase
				.from('room_members')
				.select(
					`
					*,
					profiles (*)
				`
				)
				.eq('room_id', roomId)
				.order('joined_at', { ascending: true });

			if (error) throw error;

			const allMembers = data || [];

			// Create a map of current members and their online status
			const existingMembersMap = new Map(
				this.members.map((m) => [m.user_id, m])
			);

			// Merge new data with existing online status
			this.members = allMembers.map((member) => {
				const existingMember = existingMembersMap.get(member.user_id);
				return {
					...member,
					// Preserve online status if member already existed, otherwise false
					is_online: existingMember?.is_online ?? false
				};
			});

			console.log('✅ Loaded room members:', {
				total: allMembers.length,
				online: this.members.filter(m => m.is_online).length
			});
		} catch (err: any) {
			console.error('Failed to load members:', err);
		}
	}

	startPresenceTracking(roomId: string) {
		if (this.presenceChannel) {
			supabase.removeChannel(this.presenceChannel);
		}

		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
		}

		console.log('👥 Starting presence tracking for room:', roomId);

		this.presenceChannel = supabase.channel(`presence:${roomId}`, {
			config: {
				presence: {
					key: authStore.user?.id || ''
				}
			}
		});

		this.presenceChannel
			.on('presence', { event: 'sync' }, () => {
				const state = this.presenceChannel.presenceState();
				this.updateMembersFromPresence(state);
			})
			.on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
				console.log('✅ User joined presence:', key);
			})
			.on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
				console.log('👋 User left presence:', key);
			})
			.subscribe(async (status: any) => {
				console.log('Presence channel status:', status);
				if (status === 'SUBSCRIBED') {
					await this.presenceChannel.track({
						user_id: authStore.user?.id,
						online_at: new Date().toISOString()
					});
				}
			});

		this.heartbeatInterval = setInterval(async () => {
			if (this.presenceChannel) {
				await this.presenceChannel.track({
					user_id: authStore.user?.id,
					online_at: new Date().toISOString()
				});
			}
		}, 30000);
	}

	async updateMembersFromPresence(presenceState: any) {
		const onlineUserIds = new Set<string>();

		Object.keys(presenceState).forEach((key) => {
			const presences = presenceState[key];
			presences.forEach((presence: any) => {
				if (presence.user_id) {
					onlineUserIds.add(presence.user_id);
				}
			});
		});

		this.members = this.members.map((member) => ({
			...member,
			is_online: onlineUserIds.has(member.user_id)
		}));

		console.log('📊 Online status updated:', {
			total: this.members.length,
			online: this.members.filter((m) => m.is_online).length
		});
	}

	subscribeToRoom(roomId: string) {
		if (this.roomChannel) {
			supabase.removeChannel(this.roomChannel);
		}

		console.log('🔌 Subscribing to room updates:', roomId);

		this.roomChannel = supabase
			.channel(`room:${roomId}`, {
				config: {
					broadcast: { ack: false },
					presence: { key: '' }
				}
			})
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${roomId}`
				},
				(payload) => {
					console.log('🔄 Room updated:', payload.new);
					this.currentRoom = payload.new as Room;
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'room_members',
					filter: `room_id=eq.${roomId}`
				},
				async (payload) => {
					const newMember = payload.new as RoomMember;
					console.log('✅ New member joined:', newMember.user_id);
					
					// Check if member already exists (rejoin case)
					const existingIndex = this.members.findIndex(m => m.user_id === newMember.user_id);
					
					if (existingIndex >= 0) {
						// Member rejoining - keep them in the list, will be marked online by presence
						console.log('👤 Member rejoining, keeping in list');
					} else {
						// Truly new member - fetch their profile and add
						const { data: profile } = await supabase
							.from('profiles')
							.select('*')
							.eq('id', newMember.user_id)
							.single();
						
						this.members = [
							...this.members,
							{
								...newMember,
								profiles: profile,
								is_online: false // Will be updated by presence
							}
						];
						console.log('👤 New member added to list');
					}
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'DELETE',
					schema: 'public',
					table: 'room_members',
					filter: `room_id=eq.${roomId}`
				},
				async (payload) => {
					console.log('👋 Member left:', payload.old);
					// Reload members immediately when someone leaves
					await this.loadMembers(roomId);
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'room_members',
					filter: `room_id=eq.${roomId}`
				},
				async (payload) => {
					console.log('🔄 Member updated:', payload.new);
					// Update specific member without full reload
					const updatedMember = payload.new as RoomMember;
					const index = this.members.findIndex((m) => m.id === updatedMember.id);
					if (index !== -1) {
						this.members[index] = { ...this.members[index], ...updatedMember };
						this.members = [...this.members]; // Trigger reactivity
					}
				}
			)
			.subscribe((status) => {
				console.log('✅ Room channel:', status);
			});
	}

	async toggleMemberControls(memberId: string, hasControls: boolean) {
		const { error } = await supabase
			.from('room_members')
			.update({ has_controls: hasControls })
			.eq('id', memberId);

		if (error) {
			console.error('Failed to update member controls:', error);
			throw error;
		}
	}

	unsubscribe() {
		if (this.roomChannel) {
			supabase.removeChannel(this.roomChannel);
			this.roomChannel = null;
		}

		if (this.presenceChannel) {
			this.presenceChannel.untrack();
			supabase.removeChannel(this.presenceChannel);
			this.presenceChannel = null;
		}

		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}

		if (this.joinTimeout) {
			clearTimeout(this.joinTimeout);
			this.joinTimeout = null;
		}
	}

	leaveRoom() {
		this.unsubscribe();
		this.currentRoom = null;
		this.members = [];
		this.error = null;
	}
}

export const roomStore = new RoomStore();
