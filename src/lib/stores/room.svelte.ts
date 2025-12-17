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

			// Add creator as member with controls
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

		this.loading = true;
		this.error = null;

		// Set timeout to prevent infinite loading
		this.joinTimeout = setTimeout(() => {
			if (this.loading) {
				this.error = 'Join room timeout. Please try again.';
				this.loading = false;
				throw new Error('Join room timeout');
			}
		}, 15000); // 15 second timeout

		try {
			console.log('Attempting to join room:', roomId);

			// First verify the room exists
			const { data: roomExists, error: roomCheckError } = await supabase
				.from('rooms')
				.select('id, name, is_public')
				.eq('id', roomId)
				.single();

			if (roomCheckError || !roomExists) {
				console.error('Room not found:', roomCheckError);
				throw new Error('Room not found');
			}

			// Check if room is public
			if (!roomExists.is_public) {
				throw new Error('This room is private');
			}

			console.log('Room exists:', roomExists);

			// Check if already a member
			const { data: existingMember } = await supabase
				.from('room_members')
				.select('id')
				.eq('room_id', roomId)
				.eq('user_id', authStore.user.id)
				.maybeSingle();

			if (existingMember) {
				console.log('Already a member, loading room...');
				await this.loadRoom(roomId);
				this.subscribeToRoom(roomId);
				this.startPresenceTracking(roomId);
				return;
			}

			// Insert new membership
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
				console.error('Failed to join room:', error);
				
				// Better error messages
				if (error.message?.includes('row-level security')) {
					throw new Error('Permission denied. You may not have access to this room.');
				}
				throw error;
			}

			console.log('Successfully joined room:', data);

			await this.loadRoom(roomId);
			this.subscribeToRoom(roomId);
			this.startPresenceTracking(roomId);

			console.log('Successfully joined room');
		} catch (err: any) {
			console.error('Join room error:', err);
			this.error = err.message;
			throw err;
		} finally {
			clearTimeout(this.joinTimeout);
			this.loading = false;
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
			console.error('Failed to load room:', err);
			throw new Error('Failed to load room data');
		}
	}

	async loadMembers(roomId: string) {
		try {
			const { data, error } = await supabase
				.from('room_members')
				.select(`
					*,
					profiles (*)
				`)
				.eq('room_id', roomId);

			if (error) throw error;

			// Store all members initially
			const allMembers = data || [];
			this.members = allMembers;

			console.log('Loaded all room members:', allMembers.length);
		} catch (err: any) {
			console.error('Failed to load members:', err);
			// Don't throw - members can be loaded later
		}
	}

	startPresenceTracking(roomId: string) {
		if (this.presenceChannel) {
			supabase.removeChannel(this.presenceChannel);
		}

		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
		}

		console.log('Starting presence tracking for room:', roomId);

		// Create presence channel
		this.presenceChannel = supabase.channel(`presence:${roomId}`, {
			config: {
				presence: {
					key: authStore.user?.id || ''
				}
			}
		});

		// Track presence state
		this.presenceChannel
			.on('presence', { event: 'sync' }, () => {
				const state = this.presenceChannel.presenceState();
				console.log('Presence sync:', state);
				this.updateMembersFromPresence(state);
			})
			.on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
				console.log('User joined:', key, newPresences);
			})
			.on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
				console.log('User left:', key, leftPresences);
			})
			.subscribe(async (status: any) => {
				console.log('Presence channel status:', status);
				if (status === 'SUBSCRIBED') {
					// Track this user's presence
					await this.presenceChannel.track({
						user_id: authStore.user?.id,
						online_at: new Date().toISOString()
					});
				}
			});

		// Send heartbeat every 30 seconds
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

		// Only update online status, don't reload from database
		this.members = this.members.map((member) => ({
			...member,
			is_online: onlineUserIds.has(member.user_id)
		}));

		console.log('📊 Members online status updated:', {
			total: this.members.length,
			online: this.members.filter((m) => m.is_online).length
		});
	}

	subscribeToRoom(roomId: string) {
		if (this.roomChannel) {
			supabase.removeChannel(this.roomChannel);
		}

		console.log('🔌 Subscribing to room updates:', roomId);

		// Use postgres_changes for instant updates
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
					event: '*',
					schema: 'public',
					table: 'room_members',
					filter: `room_id=eq.${roomId}`
				},
				(payload) => {
					console.log('👥 Members changed:', payload.eventType);
					// Immediately reload members when someone joins/leaves
					this.loadMembers(roomId);
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
