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
  private syncInterval: any = null;
  private dbUpdateTimeout: any = null;

  subscribeToRoom(roomId: string) {
    if (this.currentRoomId === roomId && this.channel) {
      console.log('Already subscribed to room:', roomId);
      return;
    }

    this.unsubscribeFromRoom();
    console.log('Subscribing to room:', roomId);
    this.currentRoomId = roomId;

    this.channel = supabase.channel(`player:${roomId}`)
      .on('broadcast', { event: 'player-action' }, (payload) => {
        this.handleRealtimeEvent(payload.payload);
      })
      .on('broadcast', { event: 'time-sync' }, (payload) => {
        if (payload.payload.userId !== authStore.user?.id) {
          const timeDiff = Math.abs(this.currentTime - payload.payload.time);
          if (timeDiff > 2) {
            this.currentTime = payload.payload.time;
            this.isSyncing = true;
            setTimeout(() => this.isSyncing = false, 100);
          }
        }
      })
      .subscribe((status) => {
        console.log('Player channel status:', status);
      });

    // Periodic time sync every 3 seconds (reduced from 5)
    this.syncInterval = setInterval(async () => {
      if (this.canControl() && this.isPlaying) {
        this.channel?.send({
          type: 'broadcast',
          event: 'time-sync',
          payload: {
            time: this.currentTime,
            userId: authStore.user?.id,
            timestamp: Date.now()
          }
        });
      }
    }, 3000);
  }

  unsubscribeFromRoom() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
      this.currentRoomId = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.dbUpdateTimeout) {
      clearTimeout(this.dbUpdateTimeout);
      this.dbUpdateTimeout = null;
    }
  }

  handleRealtimeEvent(event: any) {
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

    // Broadcast instantly
    await this.channel.send({
      type: 'broadcast',
      event: 'player-action',
      payload
    });

    // Update database immediately for persistence
    await this.updateRoomStateInDatabase(type, data);
  }

  async updateRoomStateInDatabase(type: string, data: any) {
    if (!roomStore.currentRoom) return;

    // Clear any pending timeout
    if (this.dbUpdateTimeout) {
      clearTimeout(this.dbUpdateTimeout);
    }

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

    try {
      const { error } = await supabase
        .from('rooms')
        .update(updates)
        .eq('id', roomStore.currentRoom.id);

      if (error) {
        console.error('Database update error:', error);
      } else {
        console.log('✅ Room state saved to database:', updates);
      }
    } catch (error) {
      console.error('Failed to update room state:', error);
    }
  }

  async play() {
    if (!this.canControl()) return;
    
    console.log('▶️ Play action triggered');
    this.isPlaying = true;
    await this.broadcastEvent('play', { time: this.currentTime });
  }

  async pause() {
    if (!this.canControl()) return;
    
    console.log('⏸️ Pause action triggered');
    this.isPlaying = false;
    await this.broadcastEvent('pause', { time: this.currentTime });
  }

  async seek(time: number) {
    if (!this.canControl()) return;
    
    console.log('⏩ Seek action triggered to:', time);
    this.currentTime = time;
    await this.broadcastEvent('seek', { time });
  }

  async changeVideo(url: string, type: 'youtube' | 'direct') {
    if (!this.canControl()) return;
    
    console.log('🎬 Change video triggered:', url, type);
    
    // Update local state first for immediate UI feedback
    this.videoUrl = url;
    this.videoType = type;
    this.currentTime = 0;
    this.isPlaying = false;
    
    // Broadcast and save to database
    await this.broadcastEvent('change_video', { url, videoType: type });
    
    console.log('✅ Video change complete');
  }

  canControl(): boolean {
    if (!authStore.user || !roomStore.currentRoom) return false;
    
    const member = roomStore.members.find(m => m.user_id === authStore.user?.id);
    if (!member?.has_controls) {
      console.log('❌ User does not have controls');
      return false;
    }
    
    return true;
  }

  async syncWithRoom() {
    if (!roomStore.currentRoom) return;

    console.log('🔄 Syncing with room state...');
    this.isSyncing = true;

    try {
      // Fetch fresh room state
      const { data: freshRoom, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomStore.currentRoom.id)
        .single();

      if (error) {
        console.error('Error fetching room state:', error);
        return;
      }

      if (freshRoom) {
        console.log('📦 Fresh room data:', freshRoom);
        
        // Set video URL and type
        this.videoUrl = freshRoom.current_video_url;
        
        // Handle video type
        const roomVideoType = freshRoom.current_video_type;
        if (roomVideoType === 'youtube' || roomVideoType === 'direct') {
          this.videoType = roomVideoType;
        } else if (roomVideoType === 'drive') {
          this.videoType = 'direct';
        } else {
          this.videoType = null;
        }
        
        // Sync state
        this.currentTime = freshRoom.video_time || 0;
        this.isPlaying = freshRoom.is_playing || false;
        
        console.log('✅ Synced state:', {
          url: this.videoUrl,
          type: this.videoType,
          time: this.currentTime,
          playing: this.isPlaying
        });
      }

      // Subscribe to room channel
      if (roomStore.currentRoom.id) {
        this.subscribeToRoom(roomStore.currentRoom.id);
      }

    } finally {
      // Keep sync flag longer for video to load properly
      setTimeout(() => {
        console.log('✅ Sync complete');
        this.isSyncing = false;
      }, 2000);
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
