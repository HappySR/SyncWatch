import { supabase } from '$lib/supabase';
import { roomStore } from './room.svelte';
import { authStore } from './auth.svelte';
import type { PlayerEvent } from '$lib/types';

class PlayerStore {
  isPlaying = $state(false);
  currentTime = $state(0);
  duration = $state(0);
  volume = $state(1);
  videoUrl = $state<string | null>(null);
  videoType = $state<'youtube' | 'direct' | 'drive' | null>(null);
  
  playerInstance: any = null;
  isSyncing = false;

  async logEvent(eventType: PlayerEvent['event_type'], videoTime?: number, videoUrl?: string) {
    if (!roomStore.currentRoom || !authStore.user) return;

    const member = roomStore.members.find(m => m.user_id === authStore.user?.id);
    if (!member?.has_controls) return;

    await supabase.from('player_events').insert({
      room_id: roomStore.currentRoom.id,
      user_id: authStore.user.id,
      event_type: eventType,
      video_time: videoTime ?? this.currentTime,
      video_url: videoUrl
    });

    // Also update room state
    await roomStore.updateRoomState({
      videoUrl: videoUrl ?? this.videoUrl ?? undefined,
      videoType: this.videoType ?? undefined,
      videoTime: videoTime ?? this.currentTime,
      isPlaying: eventType === 'play'
    });
  }

  async play() {
    this.isPlaying = true;
    await this.logEvent('play');
  }

  async pause() {
    this.isPlaying = false;
    await this.logEvent('pause');
  }

  async seek(time: number) {
    this.currentTime = time;
    await this.logEvent('seek', time);
  }

  async changeVideo(url: string, type: 'youtube' | 'direct' | 'drive') {
    this.videoUrl = url;
    this.videoType = type;
    this.currentTime = 0;
    this.isPlaying = false;
    await this.logEvent('change_video', 0, url);
  }

  handleRemoteEvent(event: PlayerEvent) {
    // Don't process our own events
    if (event.user_id === authStore.user?.id) return;

    this.isSyncing = true;

    switch (event.event_type) {
      case 'play':
        this.isPlaying = true;
        if (event.video_time !== null) {
          this.currentTime = event.video_time;
        }
        break;
      case 'pause':
        this.isPlaying = false;
        if (event.video_time !== null) {
          this.currentTime = event.video_time;
        }
        break;
      case 'seek':
        if (event.video_time !== null) {
          this.currentTime = event.video_time;
        }
        break;
      case 'change_video':
        if (event.video_url) {
          this.videoUrl = event.video_url;
          this.currentTime = 0;
          this.isPlaying = false;
        }
        break;
    }

    setTimeout(() => {
      this.isSyncing = false;
    }, 100);
  }

  syncWithRoom() {
    if (!roomStore.currentRoom) return;

    this.videoUrl = roomStore.currentRoom.current_video_url;
    this.videoType = roomStore.currentRoom.current_video_type;
    this.currentTime = roomStore.currentRoom.video_time;
    this.isPlaying = roomStore.currentRoom.is_playing;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }
}

export const playerStore = new PlayerStore();
