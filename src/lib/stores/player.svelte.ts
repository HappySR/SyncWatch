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
    // Prevent duplicate subscriptions
    if (this.currentRoomId === roomId && this.channel) {
      console.log('Already subscribed to room:', roomId);
      return;
    }

    // Unsubscribe from previous channel
    this.unsubscribeFromRoom();

    console.log('Subscribing to room:', roomId);
    this.currentRoomId = roomId;

    // Create a new channel for player events
    this.channel = supabase.channel(`player:${roomId}`)
      .on(
        'broadcast',
        { event: 'player-action' },
        (payload) => {
          this.handleRealtimeEvent(payload.payload);
        }
      )
      .subscribe((status) => {
        console.log('Player channel status:', status);
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
    // Don't process our own events
    if (event.userId === authStore.user?.id || this.isProcessingEvent) {
      return;
    }

    console.log('Received real-time event:', event);
    
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
          if (event.url) {
            this.videoUrl = event.url;
            this.videoType = event.videoType || this.detectVideoType(event.url);
            this.currentTime = 0;
            this.isPlaying = false;
          }
          break;
      }
    } finally {
      setTimeout(() => {
        this.isSyncing = false;
        this.isProcessingEvent = false;
      }, 100);
    }
  }

  detectVideoType(url: string): 'youtube' | 'direct' {
    return (url.includes('youtube.com') || url.includes('youtu.be')) ? 'youtube' : 'direct';
  }

  async broadcastEvent(type: string, data: any = {}) {
    if (!this.channel || !authStore.user) return;

    const payload = {
      type,
      userId: authStore.user.id,
      timestamp: Date.now(),
      ...data
    };

    console.log('Broadcasting event:', payload);

    // Broadcast to all room members instantly
    await this.channel.send({
      type: 'broadcast',
      event: 'player-action',
      payload
    });

    // Also update room state in database for persistence
    await this.updateRoomState(type, data);
  }

  async updateRoomState(type: string, data: any) {
    if (!roomStore.currentRoom) return;

    try {
      const updates: any = {
        updated_at: new Date().toISOString()
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

      await supabase
        .from('rooms')
        .update(updates)
        .eq('id', roomStore.currentRoom.id);

      console.log('Room state updated:', updates);
    } catch (error) {
      console.error('Failed to update room state:', error);
    }
  }

  async play() {
    if (!this.canControl()) return;
    
    console.log('Play action triggered');
    this.isPlaying = true;
    await this.broadcastEvent('play', { time: this.currentTime });
  }

  async pause() {
    if (!this.canControl()) return;
    
    console.log('Pause action triggered');
    this.isPlaying = false;
    await this.broadcastEvent('pause', { time: this.currentTime });
  }

  async seek(time: number) {
    if (!this.canControl()) return;
    
    console.log('Seek action triggered to:', time);
    this.currentTime = time;
    await this.broadcastEvent('seek', { time });
  }

  async changeVideo(url: string, type: 'youtube' | 'direct') {
    if (!this.canControl()) return;
    
    console.log('Change video triggered:', url, type);
    this.videoUrl = url;
    this.videoType = type;
    this.currentTime = 0;
    this.isPlaying = false;
    await this.broadcastEvent('change_video', { url, videoType: type });
  }

  canControl(): boolean {
    if (!authStore.user || !roomStore.currentRoom) return false;
    
    const member = roomStore.members.find(m => m.user_id === authStore.user?.id);
    if (!member?.has_controls) {
      console.log('User does not have controls');
      return false;
    }
    
    return true;
  }

  syncWithRoom() {
    if (!roomStore.currentRoom) return;

    console.log('Syncing with room state:', roomStore.currentRoom);

    this.isSyncing = true;

    // Subscribe to the room's broadcast channel
    if (roomStore.currentRoom.id) {
      this.subscribeToRoom(roomStore.currentRoom.id);
    }

    this.videoUrl = roomStore.currentRoom.current_video_url;
    
    // Handle video type conversion
    const roomVideoType = roomStore.currentRoom.current_video_type;
    if (roomVideoType === 'youtube' || roomVideoType === 'direct') {
      this.videoType = roomVideoType;
    } else if (roomVideoType === 'drive') {
      this.videoType = 'direct'; // Treat drive as direct
    } else {
      this.videoType = null;
    }
    
    this.currentTime = roomStore.currentRoom.video_time || 0;
    this.isPlaying = roomStore.currentRoom.is_playing || false;

    setTimeout(() => {
      this.isSyncing = false;
    }, 200);
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  cleanup() {
    this.unsubscribeFromRoom();
  }
}

export const playerStore = new PlayerStore();
