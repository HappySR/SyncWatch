import { supabase } from '$lib/supabase';
import type { Room, RoomMember } from '$lib/types';
import { authStore } from './auth.svelte';

// Global toast notification store — used by Navbar and any component
class ToastStore {
	toasts = $state<{ id: number; message: string; type: 'ban' | 'unban' | 'revoke' | 'grant' | 'info' }[]>([]);
	private counter = 0;

	show(message: string, type: 'ban' | 'unban' | 'revoke' | 'grant' | 'info' = 'info', duration = 5000) {
		const id = ++this.counter;
		this.toasts = [...this.toasts, { id, message, type }];
		setTimeout(() => {
			this.toasts = this.toasts.filter((t) => t.id !== id);
		}, duration);
	}

	dismiss(id: number) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}
}

export const toastStore = new ToastStore();

class RoomStore {
	currentRoom = $state<Room | null>(null);
	members = $state<RoomMember[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);

	private roomChannel: any = null;
	private presenceChannel: any = null;
	private heartbeatInterval: any = null;
	private joinTimeout: any = null;
	private reconnectTimeout: any = null;
	private banPollInterval: any = null;

	private applyMemberUpdate(updated: Partial<RoomMember> & { user_id: string }) {
		const index = this.members.findIndex((m) => m.user_id === updated.user_id);
		if (index !== -1) {
			const next = [...this.members];
			next[index] = {
				...next[index],
				...updated,
				profiles: next[index].profiles,   // never overwrite — not in DB payload
				is_online: next[index].is_online   // never overwrite — presence-only field
			};
			this.members = next;
		}
	}

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

			// Check if user is banned — hard gate
			const { data: banCheck } = await supabase
				.from('room_members')
				.select('is_banned')
				.eq('room_id', roomId)
				.eq('user_id', authStore.user.id)
				.maybeSingle();

			if (banCheck?.is_banned) {
				throw new Error('🚫 You have been banned from this room.');
			}

			console.log('2️⃣ Room exists, checking membership...');

			const { data: existingMember } = await supabase
				.from('room_members')
				.select('id, is_banned')
				.eq('room_id', roomId)
				.eq('user_id', authStore.user.id)
				.maybeSingle();

			if (existingMember) {
				if ((existingMember as any).is_banned) {
					throw new Error('🚫 You have been banned from this room.');
				}
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
					has_controls: false,
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
				.select(`*, profiles (*)`)
				.eq('room_id', roomId)
				.order('joined_at', { ascending: true });

			if (error) throw error;

			const allMembers = data || [];
			const existingMembersMap = new Map(this.members.map((m) => [m.user_id, m]));

			this.members = allMembers.map((member) => {
				const existingMember = existingMembersMap.get(member.user_id);
				return {
					...member,
					is_online: existingMember?.is_online ?? false
				};
			});

			console.log('✅ Loaded room members:', {
				total: allMembers.length,
				online: this.members.filter((m) => m.is_online).length
			});
		} catch (err: any) {
			console.error('Failed to load members:', err);
		}
	}

	startPresenceTracking(roomId: string) {
		if (typeof window !== 'undefined') {
			window.addEventListener('beforeunload', () => {
				if (this.presenceChannel) {
					this.presenceChannel.untrack();
				}
			});
		}

		if (this.presenceChannel) {
			console.log('🧹 Cleaning up old presence channel');
			try {
				this.presenceChannel.untrack();
				supabase.removeChannel(this.presenceChannel);
			} catch (err) {
				console.warn('⚠️ Error removing old presence channel:', err);
			}
			this.presenceChannel = null;
		}

		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}

		console.log('💥 Starting presence tracking for room:', roomId);

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
			.on('presence', { event: 'join' }, ({ key }: any) => {
				console.log('✅ User joined presence:', key);
				const state = this.presenceChannel.presenceState();
				this.updateMembersFromPresence(state);
			})
			.on('presence', { event: 'leave' }, ({ key }: any) => {
				console.log('👋 User left presence:', key);
				const state = this.presenceChannel.presenceState();
				this.updateMembersFromPresence(state);
			})
			.subscribe(async (status: any) => {
				console.log('Presence channel status:', status);
				if (status === 'SUBSCRIBED') {
					await this.presenceChannel.track({
						user_id: authStore.user?.id,
						online_at: new Date().toISOString()
					});

					// Start ban poll — catches ban even if realtime event is missed
					this.startBanPoll(roomId);

					if (typeof document !== 'undefined') {
						const handleVisibility = async () => {
							if (document.hidden) {
								if (this.presenceChannel) {
									await this.presenceChannel.untrack();
									console.log('👁️ Tab hidden — untracked presence');
								}
							} else {
								if (this.presenceChannel) {
									await this.presenceChannel.track({
										user_id: authStore.user?.id,
										online_at: new Date().toISOString()
									});
									console.log('✅ Tab visible — retracked presence');
									import('./player.svelte').then(({ playerStore }) => {
										playerStore.syncWithRoom();
									});
								}
							}
						};
						document.removeEventListener('visibilitychange', handleVisibility);
						document.addEventListener('visibilitychange', handleVisibility);
					}
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					console.error('❌ Presence channel error:', status);
					if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
					this.reconnectTimeout = setTimeout(() => {
						if (this.currentRoom) {
							console.log('🔄 Attempting to reconnect presence...');
							this.startPresenceTracking(this.currentRoom.id);
						}
					}, 5000);
				}
			});

		this.heartbeatInterval = setInterval(async () => {
			if (this.presenceChannel && authStore.user) {
				await this.presenceChannel.track({
					user_id: authStore.user.id,
					online_at: new Date().toISOString()
				});
			}
		}, 30000);
	}

	private startBanPoll(roomId: string) {
		if (this.banPollInterval) {
			clearInterval(this.banPollInterval);
			this.banPollInterval = null;
		}

		this.banPollInterval = setInterval(async () => {
			if (!authStore.user || !this.currentRoom) return;

			const { data } = await supabase
				.from('room_members')
				.select('is_banned, has_controls')
				.eq('room_id', roomId)
				.eq('user_id', authStore.user.id)
				.maybeSingle();

			if (!data) return;

			if (data.is_banned) {
				clearInterval(this.banPollInterval);
				this.banPollInterval = null;
				this.handleBanDetected();
				return;
			}

			// Sync has_controls if realtime missed it
			const me = this.members.find((m) => m.user_id === authStore.user?.id);
			if (me && me.has_controls !== data.has_controls) {
				const wasRevoked = me.has_controls && !data.has_controls;
				const wasGranted = !me.has_controls && data.has_controls;
				this.applyMemberUpdate({ ...me, has_controls: data.has_controls });
				if (wasRevoked) toastStore.show('Your room controls have been revoked.', 'revoke');
				if (wasGranted) toastStore.show('You have been granted room controls!', 'grant');
			}
		}, 5000);
	}

	private handleBanDetected() {
		const roomName = this.currentRoom?.name || 'the room';
		// Fire toast first, then leave after a short delay so the toast registers
		// before the component tree unmounts
		toastStore.show(`You have been banned from "${roomName}".`, 'ban', 8000);
		setTimeout(() => {
			this.leaveRoom();
			import('$app/navigation').then(({ goto }) => goto('/dashboard'));
		}, 100);
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
			console.log('🧹 Cleaning up old room channel');
			try {
				supabase.removeChannel(this.roomChannel);
			} catch (err) {
				console.warn('⚠️ Error removing old room channel:', err);
			}
			this.roomChannel = null;
		}

		console.log('📌 Subscribing to room updates:', roomId);

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

					const existingIndex = this.members.findIndex((m) => m.user_id === newMember.user_id);

					if (existingIndex >= 0) {
						console.log('👤 Member rejoining, keeping in list');
					} else {
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
								is_online: false
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
					const updatedMember = payload.new as RoomMember;

					// Banned — handle for the affected user
					if (
						updatedMember.user_id === authStore.user?.id &&
						updatedMember.is_banned === true
					) {
						console.log('🚫 Current user was banned');
						this.handleBanDetected();
						return;
					}

					// Controls changed for current user — show toast
					if (updatedMember.user_id === authStore.user?.id) {
						const me = this.members.find((m) => m.user_id === authStore.user?.id);
						if (me && me.has_controls !== updatedMember.has_controls) {
							if (!updatedMember.has_controls) {
								toastStore.show('Your room controls have been revoked.', 'revoke');
							} else {
								toastStore.show('You have been granted room controls!', 'grant');
							}
						}
					}

					// Update the member in the list, preserving profiles and is_online
					// Use full array replacement to guarantee Svelte 5 reactivity triggers
					const idx = this.members.findIndex((m) => m.user_id === updatedMember.user_id);
					if (idx !== -1) {
						const updated = [...this.members];
						updated[idx] = {
							...updated[idx],                          // keep profiles, is_online, etc.
							has_controls: updatedMember.has_controls,
							is_banned: updatedMember.is_banned,
							id: updatedMember.id,
							room_id: updatedMember.room_id,
							joined_at: updatedMember.joined_at,
						};
						this.members = updated;                       // triggers reactive update for ALL watchers
					}
				}
			)
			.subscribe((status) => {
				console.log('✅ Room channel:', status);

				if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					console.error('❌ Room channel error:', status);
					if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
					this.reconnectTimeout = setTimeout(() => {
						if (this.currentRoom) {
							console.log('🔄 Attempting to reconnect room channel...');
							this.subscribeToRoom(this.currentRoom.id);
						}
					}, 5000);
				}
			});
	}

	async toggleMemberControls(memberId: string, hasControls: boolean) {
		// Optimistic update immediately
		const member = this.members.find((m) => m.id === memberId);
		if (member) this.applyMemberUpdate({ ...member, has_controls: hasControls });

		const { error } = await supabase
			.from('room_members')
			.update({ has_controls: hasControls })
			.eq('id', memberId);

		if (error) {
			// Rollback
			if (member) this.applyMemberUpdate({ ...member, has_controls: !hasControls });
			console.error('Failed to update member controls:', error);
			throw error;
		}
	}

	async banMember(memberId: string) {
		// Optimistic update immediately
		const member = this.members.find((m) => m.id === memberId);
		if (member) this.applyMemberUpdate({ ...member, is_banned: true, has_controls: false });

		const { error } = await supabase
			.from('room_members')
			.update({ is_banned: true, has_controls: false })
			.eq('id', memberId);

		if (error) {
			// Rollback
			if (member) this.applyMemberUpdate({ ...member, is_banned: false, has_controls: member.has_controls });
			console.error('Failed to ban member:', error);
			throw error;
		}
	}

	async unbanMember(memberId: string) {
		const member = this.members.find((m) => m.id === memberId);
		if (member) this.applyMemberUpdate({ ...member, is_banned: false });

		const { error } = await supabase
			.from('room_members')
			.update({ is_banned: false })
			.eq('id', memberId);

		if (error) {
			if (member) this.applyMemberUpdate({ ...member, is_banned: true });
			console.error('Failed to unban member:', error);
			throw error;
		}
	}

	async grantControlsToAll() {
		if (!this.currentRoom) return;

		const hostId = this.currentRoom.host_id;
		// Optimistic update
		this.members = this.members.map((m) =>
			m.user_id !== hostId && !m.is_banned ? { ...m, has_controls: true } : m
		);

		const { error } = await supabase
			.from('room_members')
			.update({ has_controls: true })
			.eq('room_id', this.currentRoom.id)
			.eq('is_banned', false)
			.neq('user_id', hostId);

		if (error) {
			await this.loadMembers(this.currentRoom.id);
			console.error('Failed to grant controls to all:', error);
			throw error;
		}
	}

	async revokeControlsFromAll() {
		if (!this.currentRoom) return;

		const hostId = this.currentRoom.host_id;
		// Optimistic update
		this.members = this.members.map((m) =>
			m.user_id !== hostId ? { ...m, has_controls: false } : m
		);

		const { error } = await supabase
			.from('room_members')
			.update({ has_controls: false })
			.eq('room_id', this.currentRoom.id)
			.neq('user_id', hostId);

		if (error) {
			await this.loadMembers(this.currentRoom.id);
			console.error('Failed to revoke controls from all:', error);
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

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		if (this.banPollInterval) {
			clearInterval(this.banPollInterval);
			this.banPollInterval = null;
		}
	}

	leaveRoom() {
		this.unsubscribe();
		this.currentRoom = null;
		this.members = [];
		this.error = null;
	}

	cleanup() {
		this.unsubscribe();
	}
}

export const roomStore = new RoomStore();
