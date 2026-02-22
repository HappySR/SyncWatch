import { supabase } from '$lib/supabase';
import { roomStore } from './room.svelte';
import { authStore } from './auth.svelte';
import type { RealtimeChannel } from '@supabase/supabase-js';

class PlayerStore {
	isPlaying = $state(false);
	currentTime = $state(0);
	duration = $state(0);
	volume = $state(1);
	videoUrl = $state<string | null>(null);
	videoType = $state<'youtube' | 'direct' | null>(null);

	isSyncing = $state(false);
	private channel: RealtimeChannel | null = null;
	private isProcessingEvent = false;
	private currentRoomId: string | null = null;

	subscribeToRoom(roomId: string) {
		if (this.currentRoomId === roomId && this.channel) {
			console.log('Already subscribed to room:', roomId);
			return;
		}

		this.unsubscribeFromRoom();
		console.log('🔌 Subscribing to room:', roomId);
		this.currentRoomId = roomId;

		this.channel = supabase
			.channel(`player:${roomId}`, {
				config: {
					broadcast: { ack: false }
				}
			})
			.on('broadcast', { event: 'player-action' }, (payload) => {
				this.handleRealtimeEvent(payload.payload);
			})
			.subscribe((status) => {
				console.log('✅ Player channel status:', status);
			});
	}

	unsubscribeFromRoom() {
		if (this.channel) {
			supabase.removeChannel(this.channel);
			this.channel = null;
			this.currentRoomId = null;
		}
	}

	resetSyncState() {
		this.syncInProgress = false;
		this.lastSyncAt = 0;
		this.lastPlayPauseEventAt = 0;
	}

	handleRealtimeEvent(event: any) {
		// --- AUTHORIZATION CHECK (applies to ALL event types, including change_video) ---
		// Reject events from the current user (we already applied our own action locally)
		// EXCEPTION: we still process our own change_video if we need to, but since
		// changeVideo() already updates local state before broadcasting, we can skip it.
		if (event.userId === authStore.user?.id) {
			return;
		}

		// Reject events from users who are banned OR have no controls.
		// This check applies to ALL event types including change_video.
		const sender = roomStore.members.find((m) => m.user_id === event.userId);
		if (sender && (!sender.has_controls || sender.is_banned)) {
			console.warn('🚫 Ignoring event from unauthorized user:', event.userId, event.type);
			return;
		}

		// If sender is not in our member list yet (edge case on first join), be cautious:
		// allow play/pause/seek from unknown senders but block change_video to be safe.
		if (!sender && event.type === 'change_video') {
			console.warn('🚫 Ignoring change_video from unknown sender:', event.userId);
			return;
		}

		// Allow play/pause to always get through — they must be authoritative
		const isAuthoritative =
			event.type === 'play' || event.type === 'pause' || event.type === 'change_video';
		if (this.isProcessingEvent && !isAuthoritative) {
			return;
		}

		console.log('📥 Received real-time event:', event.type);

		this.isProcessingEvent = true;
		this.isSyncing = true;

		switch (event.type) {
			case 'play': {
				this.isPlaying = true;
				this.lastPlayPauseEventAt = Date.now();
				if (event.time !== undefined) {
					const transitMs = event.sentAt ? Date.now() - event.sentAt : 0;
					const compensated = event.time + transitMs / 1000;
					this.currentTime = compensated;
				}
				break;
			}

			case 'pause':
				this.isPlaying = false;
				this.lastPlayPauseEventAt = Date.now();
				if (event.time !== undefined) {
					this.currentTime = event.time;
				}
				break;

			case 'seek':
				if (event.time !== undefined) {
					const transitMs = event.sentAt ? Date.now() - event.sentAt : 0;
					this.currentTime = this.isPlaying ? event.time + transitMs / 1000 : event.time;
				}
				break;

			case 'change_video':
				console.log('📺 Video change received:', event.url);
				if (event.url) {
					this.videoUrl = event.url;
					this.videoType = event.videoType || this.detectVideoType(event.url);
					this.currentTime = 0;
					this.isPlaying = false;
				}
				break;
		}

		const lockDuration =
			event.type === 'change_video'
				? 1500
				: event.type === 'play' || event.type === 'pause'
					? 800
					: 300;

		setTimeout(() => {
			this.isSyncing = false;
			this.isProcessingEvent = false;
		}, lockDuration);
	}

	detectVideoType(url: string): 'youtube' | 'direct' {
		return url.includes('youtube.com') || url.includes('youtu.be') ? 'youtube' : 'direct';
	}

	async broadcastEvent(type: string, data: any = {}) {
		if (!this.channel || !authStore.user) return;

		const payload = {
			type,
			userId: authStore.user.id,
			sentAt: Date.now(),
			...data
		};

		console.log('📤 Broadcasting:', type);

		this.channel.send({
			type: 'broadcast',
			event: 'player-action',
			payload
		});

		this.updateRoomStateInBackground(type, data);
	}

	private seekDbDebounce: any = null;

	updateRoomStateInBackground(type: string, data: any) {
		if (!roomStore.currentRoom) return;

		if (type === 'seek') {
			if (this.seekDbDebounce) clearTimeout(this.seekDbDebounce);
			this.seekDbDebounce = setTimeout(() => {
				this.writeRoomState({ video_time: data.time ?? this.currentTime });
			}, 1000);
			return;
		}

		const updates: any = {};

		switch (type) {
			case 'play':
				updates.is_playing = true;
				updates.video_time = data.time ?? this.currentTime;
				break;
			case 'pause':
				updates.is_playing = false;
				updates.video_time = data.time ?? this.currentTime;
				break;
			case 'change_video':
				return; // Already written to DB in changeVideo() before broadcast
		}

		this.writeRoomState(updates);
	}

	private async writeNewVideoToRoom(url: string, videoType: string) {
		if (!roomStore.currentRoom) return;

		const { error } = await supabase
			.from('rooms')
			.update({
				current_video_url: url,
				current_video_type: videoType,
				video_time: 0,
				is_playing: false,
				last_updated: new Date().toISOString()
			})
			.eq('id', roomStore.currentRoom.id);

		if (error) {
			console.error('❌ Failed to save new video to DB:', error);
		} else {
			console.log('✅ New video saved to DB:', url);
		}
	}

	private writeRoomState(updates: any) {
		if (!roomStore.currentRoom) return;
		supabase
			.from('rooms')
			.update({ ...updates, last_updated: new Date().toISOString() })
			.eq('id', roomStore.currentRoom.id)
			.then(({ error }) => {
				if (error) console.error('❌ Background DB update failed:', error);
			});
	}

	async play() {
		if (!this.canControl) return;
		this.isPlaying = true;
		this.lastPlayPauseEventAt = Date.now();
		await this.broadcastEvent('play', { time: this.currentTime });
	}

	async pause() {
		if (!this.canControl) return;
		this.isPlaying = false;
		this.lastPlayPauseEventAt = Date.now();
		await this.broadcastEvent('pause', { time: this.currentTime });
	}

	private lastSeekBroadcastAt = 0;
	private pendingSeekTime: number | null = null;
	private seekBroadcastTimer: any = null;

	async seek(time: number) {
		if (!this.canControl) return;
		this.currentTime = time;

		const now = Date.now();

		if (now - this.lastSeekBroadcastAt < 150) {
			this.pendingSeekTime = time;
			if (!this.seekBroadcastTimer) {
				this.seekBroadcastTimer = setTimeout(() => {
					this.seekBroadcastTimer = null;
					if (this.pendingSeekTime !== null) {
						const t = this.pendingSeekTime;
						this.pendingSeekTime = null;
						this.lastSeekBroadcastAt = Date.now();
						this.broadcastEvent('seek', { time: t });
					}
				}, 150);
			}
			return;
		}

		this.lastSeekBroadcastAt = now;
		this.pendingSeekTime = null;
		this.broadcastEvent('seek', { time });
	}

	async skipBy(seconds: number, getLiveTime: () => number) {
		if (!this.canControl) return;
		const liveTime = getLiveTime();
		const newTime = Math.max(0, liveTime + seconds);
		this.currentTime = newTime;
		await this.broadcastEvent('seek', { time: newTime });
	}

	async changeVideo(url: string, type: 'youtube' | 'direct') {
		if (!this.canControl) {
			import('./room.svelte').then(({ toastStore }) => {
				toastStore.show('You don\'t have control access.', 'info');
			});
			return;
		}

		console.log('🎬 Changing video to:', url);

		// Update local state immediately
		this.videoUrl = url;
		this.videoType = type;
		this.currentTime = 0;
		this.isPlaying = false;

		// Write to DB FIRST so any joiner who arrives after the broadcast
		// reads the correct video URL from the rooms table
		await this.writeNewVideoToRoom(url, type);

		// Then broadcast to connected peers
		await this.broadcastEvent('change_video', { url, videoType: type });
	}

	get canControl(): boolean {
		if (!authStore.user || !roomStore.currentRoom) return false;
		const member = roomStore.members.find((m) => m.user_id === authStore.user?.id);
		// Must have controls AND not be banned
		return (member?.has_controls ?? false) && !(member?.is_banned ?? false);
	}

	private syncInProgress = false;
	private lastSyncAt = 0;
	private lastPlayPauseEventAt = 0;

	async syncWithRoom() {
		if (!roomStore.currentRoom) return;

		const now = Date.now();

		if (now - this.lastPlayPauseEventAt < 5000) {
			console.log('⏭️ syncWithRoom skipped — recent play/pause event takes priority');
			return;
		}

		if (this.syncInProgress || now - this.lastSyncAt < 3000) {
			console.log('⏭️ syncWithRoom skipped — too soon or already in progress');
			return;
		}

		this.syncInProgress = true;
		this.lastSyncAt = now;
		console.log('🔄 Syncing with room...');
		this.isSyncing = true;

		try {
			const fetchStart = Date.now();

			const { data: freshRoom } = await supabase
				.from('rooms')
				.select('*')
				.eq('id', roomStore.currentRoom.id)
				.single();

			if (freshRoom) {
				this.videoUrl = freshRoom.current_video_url;
				this.videoType = freshRoom.current_video_type as 'youtube' | 'direct' | null;

				// Compensate for both elapsed playback time AND the network round-trip
				// so the seeded position is accurate at the moment the player receives it
				let syncTime = freshRoom.video_time || 0;
				if (freshRoom.is_playing && freshRoom.last_updated) {
					const dbWrittenAt = new Date(freshRoom.last_updated).getTime();
					const fetchLatencyMs = Date.now() - fetchStart;
					const elapsed = (Date.now() - dbWrittenAt - fetchLatencyMs / 2) / 1000;
					syncTime += Math.max(0, elapsed);
				}

				this.currentTime = syncTime;

				if (!freshRoom.is_playing) {
					this.isPlaying = false;
				} else {
					// Trust DB is_playing=true unless the room has been completely idle
					// for over 5 minutes — prevents auto-play on long-abandoned rooms
					// but correctly resumes for joins and unbans during active sessions
					const lastUpdatedMs = freshRoom.last_updated
						? Date.now() - new Date(freshRoom.last_updated).getTime()
						: Infinity;

					if (lastUpdatedMs < 5 * 60 * 1000) {
						this.isPlaying = true;
					} else {
						console.log('⏸️ DB is_playing=true but room idle >5min — not auto-starting');
						this.isPlaying = false;
					}
				}

				console.log('✅ Synced:', {
					url: this.videoUrl,
					time: syncTime,
					isPlaying: this.isPlaying
				});
			}

			if (roomStore.currentRoom.id) {
				this.subscribeToRoom(roomStore.currentRoom.id);
			}
		} finally {
			// Shorten the sync lock so playback starts faster after sync
			setTimeout(() => {
				this.isSyncing = false;
				this.syncInProgress = false;
			}, 500);
		}
	}

	setVolume(vol: number) {
		this.volume = Math.max(0, Math.min(1, vol));
	}

	cleanup() {
		this.unsubscribeFromRoom();
	}
}

export const playerStore = new PlayerStore();
