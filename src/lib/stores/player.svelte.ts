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
					broadcast: { ack: false } // Don't wait for acknowledgment - faster!
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

	handleRealtimeEvent(event: any) {
		// Skip own events except video changes
		if (event.userId === authStore.user?.id && event.type !== 'change_video') {
			return;
		}

		if (this.isProcessingEvent && event.type !== 'change_video') {
			return;
		}

		console.log('📥 Received real-time event:', event.type);

		this.isProcessingEvent = true;
		this.isSyncing = true;

		try {
			switch (event.type) {
				case 'play':
					this.isPlaying = true;
					if (event.time !== undefined) {
						this.currentTime = event.time;
					}
					break;

				case 'pause':
					this.isPlaying = false;
					if (event.time !== undefined) {
						this.currentTime = event.time;
					}
					break;

				case 'seek':
					if (event.time !== undefined) {
						this.currentTime = event.time;
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
		} finally {
			setTimeout(
				() => {
					this.isSyncing = false;
					this.isProcessingEvent = false;
				},
				event.type === 'change_video' ? 1500 : 50
			);
		}
	}

	detectVideoType(url: string): 'youtube' | 'direct' {
		return url.includes('youtube.com') || url.includes('youtu.be') ? 'youtube' : 'direct';
	}

	async broadcastEvent(type: string, data: any = {}) {
		if (!this.channel || !authStore.user) return;

		const payload = {
			type,
			userId: authStore.user.id,
			timestamp: Date.now(),
			...data
		};

		console.log('📤 Broadcasting:', type);

		// Broadcast via Realtime (instant!)
		await this.channel.send({
			type: 'broadcast',
			event: 'player-action',
			payload
		});

		// Update database in background (don't await)
		this.updateRoomStateInBackground(type, data);
	}

	updateRoomStateInBackground(type: string, data: any) {
		if (!roomStore.currentRoom) return;

		const updates: any = {
			last_updated: new Date().toISOString()
		};

		switch (type) {
			case 'play':
				updates.is_playing = true;
				updates.video_time = data.time ?? this.currentTime;
				break;
			case 'pause':
				updates.is_playing = false;
				updates.video_time = data.time ?? this.currentTime;
				break;
			case 'seek':
				updates.video_time = data.time ?? this.currentTime;
				break;
			case 'change_video':
				updates.current_video_url = data.url;
				updates.current_video_type = data.videoType;
				updates.video_time = 0;
				updates.is_playing = false;
				break;
		}

		// Fire and forget - don't block the UI
		supabase
			.from('rooms')
			.update(updates)
			.eq('id', roomStore.currentRoom.id)
			.then(({ error }) => {
				if (error) console.error('❌ Background DB update failed:', error);
				else console.log('✅ DB updated in background');
			});
	}

	async play() {
		if (!this.canControl()) return;
		this.isPlaying = true;
		await this.broadcastEvent('play', { time: this.currentTime });
	}

	async pause() {
		if (!this.canControl()) return;
		this.isPlaying = false;
		await this.broadcastEvent('pause', { time: this.currentTime });
	}

	async seek(time: number) {
		if (!this.canControl()) return;
		this.currentTime = time;
		await this.broadcastEvent('seek', { time });
	}

	async changeVideo(url: string, type: 'youtube' | 'direct') {
		if (!this.canControl()) return;

		console.log('🎬 Changing video to:', url);

		// Update local state immediately
		this.videoUrl = url;
		this.videoType = type;
		this.currentTime = 0;
		this.isPlaying = false;

		// Broadcast to all users instantly
		await this.broadcastEvent('change_video', { url, videoType: type });
	}

	canControl(): boolean {
		if (!authStore.user || !roomStore.currentRoom) return false;

		const member = roomStore.members.find((m) => m.user_id === authStore.user?.id);
		return member?.has_controls ?? false;
	}

	async syncWithRoom() {
		if (!roomStore.currentRoom) return;

		console.log('🔄 Syncing with room...');
		this.isSyncing = true;

		try {
			const { data: freshRoom } = await supabase
				.from('rooms')
				.select('*')
				.eq('id', roomStore.currentRoom.id)
				.single();

			if (freshRoom) {
				this.videoUrl = freshRoom.current_video_url;
				this.videoType = freshRoom.current_video_type as 'youtube' | 'direct' | null;

				// Calculate actual time if playing
				let syncTime = freshRoom.video_time || 0;
				if (freshRoom.is_playing && freshRoom.last_updated) {
					const elapsed = (Date.now() - new Date(freshRoom.last_updated).getTime()) / 1000;
					syncTime += elapsed;
				}

				this.currentTime = syncTime;
				this.isPlaying = freshRoom.is_playing || false;

				console.log('✅ Synced:', { url: this.videoUrl, time: syncTime });
			}

			if (roomStore.currentRoom.id) {
				this.subscribeToRoom(roomStore.currentRoom.id);
			}
		} finally {
			setTimeout(() => {
				this.isSyncing = false;
			}, 1500);
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
