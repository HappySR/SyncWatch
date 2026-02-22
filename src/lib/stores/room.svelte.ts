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

	// Ban overlay state — shown immediately when current user is banned, cleared on unban
	isBanned = $state(false);

	private roomChannel: any = null;
	private memberBroadcastChannel: any = null; // ← dedicated channel for member updates
	private presenceChannel: any = null;
	private heartbeatInterval: any = null;
	private joinTimeout: any = null;
	private reconnectTimeout: any = null;
	private banPollInterval: any = null;

	// Tracks when the last member-update broadcast was received.
	// Used by the postgres_changes fallback to avoid overriding fresh broadcast state.
	private lastMemberBroadcastAt = 0;

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

			console.log('2️⃣ Room exists, checking membership...');

			const { data: existingMember } = await supabase
				.from('room_members')
				.select('id, is_banned')
				.eq('room_id', roomId)
				.eq('user_id', authStore.user.id)
				.maybeSingle();

			if (existingMember?.is_banned) {
				throw new Error('BANNED: You have been banned from this room and cannot rejoin until the host unbans you.');
			}

			if (existingMember) {
				console.log('3️⃣ Already a member, loading room...');
				await this.loadRoom(roomId);
				this.subscribeToRoom(roomId);
				this.subscribeMemberBroadcast(roomId); // ← NEW
				this.startPresenceTracking(roomId);

				clearTimeout(this.joinTimeout);
				this.loading = false;
				console.log('✅ Successfully rejoined existing room');
				return;
			}

			console.log('4️⃣ Not a member, checking ban history...');

			// Check the persistent ban table — catches users whose room_members row
			// was cleaned up but who are still banned
			const { data: banRecord } = await supabase
				.from('room_bans')
				.select('room_id')
				.eq('room_id', roomId)
				.eq('user_id', authStore.user.id)
				.maybeSingle();

			if (banRecord) {
				throw new Error('BANNED: You have been banned from this room and cannot rejoin until the host unbans you.');
			}

			console.log('5️⃣ Not banned, inserting new membership...');

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
			this.subscribeMemberBroadcast(roomId); // ← NEW
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

			// The ban poll has ONE job: detect ban/unban events that the broadcast missed.
			// It never touches has_controls or fires controls-related toasts — those are
			// handled exclusively by the broadcast channel + postgres_changes fallback.
			const { data } = await supabase
				.from('room_members')
				.select('is_banned')
				.eq('room_id', roomId)
				.eq('user_id', authStore.user.id)
				.maybeSingle();

			if (!data) return;

			if (data.is_banned && !this.isBanned) {
				// Ban was missed by broadcast — catch it now
				console.log('🚫 Ban poll caught missed ban event');
				this.handleBanDetected();
				return;
			}
		}, 5000);
	}

	private bannedAt = 0;

	private handleBanDetected() {
		this.isBanned = true;
		this.bannedAt = Date.now();
		import('./player.svelte').then(({ playerStore }) => {
			playerStore.isPlaying = false;
			playerStore.videoUrl = null;
			playerStore.videoType = null;
		});
		console.log('🚫 Ban detected — showing ban overlay');
	}

	private handleUnbanDetected() {
		if (this.isBanned) {
			this.isBanned = false;
			this.bannedAt = 0;
			toastStore.show('You have been unbanned from this room.', 'unban');
			console.log('✅ Unban detected — hiding ban overlay');
			// Small delay to let the ban overlay unmount before syncing, then force fresh sync
			setTimeout(() => {
				import('./player.svelte').then(({ playerStore }) => {
					playerStore.resetSyncState();
					playerStore['lastSyncAt'] = 0;
					playerStore['lastPlayPauseEventAt'] = 0;
					playerStore.syncWithRoom();
				});
			}, 200);
		}
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

	/**
	 * NEW: Subscribe to a dedicated broadcast channel for member state changes.
	 * This is the reliable, instant path for controls/ban changes visible to ALL clients.
	 * The host broadcasts member updates after every toggleControls / ban / unban action.
	 * Postgres realtime is kept as a fallback but is not the primary delivery mechanism.
	 */
	subscribeMemberBroadcast(roomId: string) {
		if (this.memberBroadcastChannel) {
			try { supabase.removeChannel(this.memberBroadcastChannel); } catch {}
			this.memberBroadcastChannel = null;
		}

		this.memberBroadcastChannel = supabase
			.channel(`members:${roomId}`, { config: { broadcast: { ack: false } } })
			.on('broadcast', { event: 'member-update' }, (payload) => {
				this.handleMemberBroadcast(payload.payload);
			})
			.subscribe((status) => {
				console.log('👥 Member broadcast channel:', status);
			});
	}

	private handleMemberBroadcast(data: any) {
		if (!data?.user_id) return;
		console.log('📥 Member broadcast received:', data);

		// Stamp so the postgres_changes fallback knows a broadcast was just applied
		this.lastMemberBroadcastAt = Date.now();

		const me = authStore.user?.id;

		// Handle ban
		if (data.is_banned === true) {
			// Update member list for everyone (host sees the banned tab update)
			this.applyMemberUpdate({ user_id: data.user_id, is_banned: true, has_controls: false });

			// If this is us: show ban overlay
			if (data.user_id === me) {
				this.handleBanDetected();
			}
			return;
		}

		// Handle unban
		if (data.is_banned === false) {
			this.applyMemberUpdate({ user_id: data.user_id, is_banned: false });

			if (data.user_id === me) {
				this.handleUnbanDetected();
			}
			return;
		}

		// Handle controls toggle
		if (data.has_controls !== undefined) {
			const member = this.members.find((m) => m.user_id === data.user_id);
			const prevControls = member?.has_controls;

			this.applyMemberUpdate({ user_id: data.user_id, has_controls: data.has_controls });

			// Toast only for the affected user, and only if state actually changed
			if (data.user_id === me && prevControls !== data.has_controls) {
				if (!data.has_controls) {
					toastStore.show('Your room controls have been revoked.', 'revoke');
				} else {
					toastStore.show('You have been granted room controls!', 'grant');
				}
			}
		}
	}

	/**
	 * Broadcast a member state update to all clients in the room.
	 * Called by the host after every toggleControls / ban / unban.
	 */
	private async broadcastMemberUpdate(roomId: string, payload: Record<string, any>) {
		if (!this.memberBroadcastChannel) return;
		await this.memberBroadcastChannel.send({
			type: 'broadcast',
			event: 'member-update',
			payload
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
					// FALLBACK: postgres_changes fires when broadcast is missed (e.g. network drop).
					// It silently corrects member state without firing any toasts.
					// Toasts are exclusively the broadcast channel's responsibility.
					const msSinceLastBroadcast = Date.now() - this.lastMemberBroadcastAt;
					if (msSinceLastBroadcast < 10_000) {
						console.log('⏭️ [Fallback] postgres_changes skipped — recent broadcast is authoritative');
						return;
					}

					console.log('🔄 [Fallback] Member updated via postgres_changes:', payload.new);
					const updatedMember = payload.new as RoomMember;

					// Silently detect ban via postgres_changes fallback.
					// Never clear isBanned here — only the unban broadcast or poll (after grace period) may do that.
					if (updatedMember.user_id === authStore.user?.id) {
						if (updatedMember.is_banned === true && !this.isBanned) {
							console.log('🚫 [Fallback] Ban detected via postgres_changes');
							this.handleBanDetected();
						}
					}

					// Silently update the member in the list for all clients
					const idx = this.members.findIndex((m) => m.user_id === updatedMember.user_id);
					if (idx !== -1) {
						const updated = [...this.members];
						updated[idx] = {
							...updated[idx],
							has_controls: updatedMember.has_controls,
							is_banned: updatedMember.is_banned,
							id: updatedMember.id,
							room_id: updatedMember.room_id,
							joined_at: updatedMember.joined_at,
						};
						this.members = updated;
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
		const member = this.members.find((m) => m.id === memberId);
		if (!member || !this.currentRoom) return;

		// Optimistic update immediately
		this.applyMemberUpdate({ ...member, has_controls: hasControls });

		const { error } = await supabase
			.from('room_members')
			.update({ has_controls: hasControls })
			.eq('id', memberId);

		if (error) {
			// Rollback
			this.applyMemberUpdate({ ...member, has_controls: !hasControls });
			console.error('Failed to update member controls:', error);
			throw error;
		}

		// Broadcast instantly to all clients so every screen updates without waiting for postgres_changes
		await this.broadcastMemberUpdate(this.currentRoom.id, {
			user_id: member.user_id,
			has_controls: hasControls
		});
	}

	async banMember(memberId: string) {
		const member = this.members.find((m) => m.id === memberId);
		if (!member || !this.currentRoom) return;

		// Optimistic update immediately
		this.applyMemberUpdate({ ...member, is_banned: true, has_controls: false });

		const { error } = await supabase
			.from('room_members')
			.update({ is_banned: true, has_controls: false })
			.eq('id', memberId);

		if (error) {
			// Rollback
			this.applyMemberUpdate({ ...member, is_banned: false, has_controls: member.has_controls });
			console.error('Failed to ban member:', error);
			throw error;
		}

		// Persist to room_bans so the ban survives even if room_members row is cleaned up
		await supabase
			.from('room_bans')
			.upsert({ room_id: this.currentRoom.id, user_id: member.user_id }, { onConflict: 'room_id,user_id' });

		// Broadcast ban to all clients — including the banned user themselves
		await this.broadcastMemberUpdate(this.currentRoom.id, {
			user_id: member.user_id,
			is_banned: true,
			has_controls: false
		});
	}

	async unbanMember(memberId: string) {
		const member = this.members.find((m) => m.id === memberId);
		if (!member || !this.currentRoom) return;

		// Optimistic update
		this.applyMemberUpdate({ ...member, is_banned: false });

		const { error } = await supabase
			.from('room_members')
			.update({ is_banned: false })
			.eq('id', memberId);

		if (error) {
			this.applyMemberUpdate({ ...member, is_banned: true });
			console.error('Failed to unban member:', error);
			throw error;
		}

		// Remove from persistent ban table so they can rejoin
		await supabase
			.from('room_bans')
			.delete()
			.eq('room_id', this.currentRoom.id)
			.eq('user_id', member.user_id);

		// Broadcast unban so the banned user's overlay disappears instantly
		await this.broadcastMemberUpdate(this.currentRoom.id, {
			user_id: member.user_id,
			is_banned: false
		});
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

		// Broadcast each affected member's new state
		for (const m of this.members) {
			if (m.user_id !== hostId && !m.is_banned) {
				await this.broadcastMemberUpdate(this.currentRoom.id, {
					user_id: m.user_id,
					has_controls: true
				});
			}
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

		// Broadcast each affected member's new state
		for (const m of this.members) {
			if (m.user_id !== hostId) {
				await this.broadcastMemberUpdate(this.currentRoom.id, {
					user_id: m.user_id,
					has_controls: false
				});
			}
		}
	}

	unsubscribe() {
		if (this.roomChannel) {
			supabase.removeChannel(this.roomChannel);
			this.roomChannel = null;
		}

		if (this.memberBroadcastChannel) {
			supabase.removeChannel(this.memberBroadcastChannel);
			this.memberBroadcastChannel = null;
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
		this.isBanned = false;
	}

	cleanup() {
		this.unsubscribe();
	}
}

export const roomStore = new RoomStore();
