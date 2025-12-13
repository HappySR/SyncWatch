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
  private syncCheckInterval: any = null;
  private isLocalAction = false; // Flag to prevent double-triggering

  constructor() {
    // Sync check every 500ms for tight synchronization
    this.syncCheckInterval = setInterval(() => {
      this.checkSync();
    }, 500);
  }

  checkSync() {
    if (!roomStore.currentRoom || this.isSyncing || this.isLocalAction) return;

    const timeDiff = Math.abs(this.currentTime - roomStore.currentRoom.video_time);
    
    // If time difference is more than 1 second, resync
    if (timeDiff > 1) {
      this.currentTime = roomStore.currentRoom.video_time;
    }

    // Sync playing state
    if (this.isPlaying !== roomStore.currentRoom.is_playing) {
      this.isPlaying = roomStore.currentRoom.is_playing;
    }
  }

  async logEvent(eventType: PlayerEvent['event_type'], videoTime?: number, videoUrl?: string) {
    if (!roomStore.currentRoom || !authStore.user) return;

    const member = roomStore.members.find(m => m.user_id === authStore.user?.id);
    if (!member?.has_controls) {
      console.log('User does not have controls');
      return;
    }

    this.isLocalAction = true;

    try {
      const timeToLog = videoTime ?? this.currentTime;
      
      console.log('Logging event:', eventType, 'time:', timeToLog);

      await supabase.from('player_events').insert({
        room_id: roomStore.currentRoom.id,
        user_id: authStore.user.id,
        event_type: eventType,
        video_time: timeToLog,
        video_url: videoUrl
      });

      // Update room state immediately
      await roomStore.updateRoomState({
        videoUrl: videoUrl ?? this.videoUrl ?? undefined,
        videoType: this.videoType ?? undefined,
        videoTime: timeToLog,
        isPlaying: eventType === 'play'
      });

      console.log('Event logged successfully');
    } catch (error) {
      console.error('Failed to log event:', error);
    } finally {
      setTimeout(() => {
        this.isLocalAction = false;
      }, 200);
    }
  }

  async play() {
    console.log('Play action triggered');
    this.isPlaying = true;
    await this.logEvent('play');
  }

  async pause() {
    console.log('Pause action triggered');
    this.isPlaying = false;
    await this.logEvent('pause');
  }

  async seek(time: number) {
    console.log('Seek action triggered to:', time);
    this.currentTime = time;
    await this.logEvent('seek', time);
  }

  async changeVideo(url: string, type: 'youtube' | 'direct' | 'drive') {
    console.log('Change video triggered:', url, type);
    this.videoUrl = url;
    this.videoType = type;
    this.currentTime = 0;
    this.isPlaying = false;
    await this.logEvent('change_video', 0, url);
  }

  handleRemoteEvent(event: PlayerEvent) {
    // Don't process our own events
    if (event.user_id === authStore.user?.id) {
      console.log('Ignoring own event');
      return;
    }

    console.log('Handling remote event:', event.event_type, event);
    
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
          this.videoType = event.video_url.includes('youtube') ? 'youtube' : 
                         event.video_url.includes('drive.google') ? 'drive' : 'direct';
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

    console.log('Syncing with room state:', roomStore.currentRoom);

    this.videoUrl = roomStore.currentRoom.current_video_url;
    this.videoType = roomStore.currentRoom.current_video_type;
    this.currentTime = roomStore.currentRoom.video_time;
    this.isPlaying = roomStore.currentRoom.is_playing;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  cleanup() {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
    }
  }
}

export const playerStore = new PlayerStore();
