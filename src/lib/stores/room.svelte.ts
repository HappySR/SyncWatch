import { supabase } from '$lib/supabase';
import type { Room, RoomMember, PlayerEvent } from '$lib/types';
import { authStore } from './auth.svelte';

class RoomStore {
  currentRoom = $state<Room | null>(null);
  members = $state<RoomMember[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  
  private roomChannel: any = null;
  private eventsChannel: any = null;

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
          is_public: true
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Add creator as member
      const { error: memberError } = await supabase
        .from('room_members')
        .insert({
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

    try {
      // Check if already a member
      const { data: existing } = await supabase
        .from('room_members')
        .select()
        .eq('room_id', roomId)
        .eq('user_id', authStore.user.id)
        .single();

      if (!existing) {
        const { error } = await supabase
          .from('room_members')
          .insert({
            room_id: roomId,
            user_id: authStore.user.id,
            has_controls: true
          });

        if (error) throw error;
      }

      await this.loadRoom(roomId);
      this.subscribeToRoom(roomId);
    } catch (err: any) {
      this.error = err.message;
      throw err;
    } finally {
      this.loading = false;
    }
  }

  async loadRoom(roomId: string) {
    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error) throw error;
    this.currentRoom = room;

    await this.loadMembers(roomId);
  }

  async loadMembers(roomId: string) {
    const { data, error } = await supabase
      .from('room_members')
      .select(`
        *,
        profiles (*)
      `)
      .eq('room_id', roomId);

    if (error) throw error;
    this.members = data || [];
  }

  subscribeToRoom(roomId: string) {
    this.unsubscribe();

    // Subscribe to room updates
    this.roomChannel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            this.currentRoom = payload.new as Room;
          }
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
        () => {
          this.loadMembers(roomId);
        }
      )
      .subscribe();

    // Subscribe to player events
    this.eventsChannel = supabase
      .channel(`events:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'player_events',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          const event = payload.new as PlayerEvent;
          // This will be handled by player store
          window.dispatchEvent(new CustomEvent('player-event', { detail: event }));
        }
      )
      .subscribe();
  }

  async updateRoomState(updates: {
    videoUrl?: string;
    videoType?: 'youtube' | 'direct' | 'drive';
    videoTime?: number;
    isPlaying?: boolean;
  }) {
    if (!this.currentRoom) return;

    const { error } = await supabase.rpc('update_room_state', {
      p_room_id: this.currentRoom.id,
      p_video_url: updates.videoUrl,
      p_video_type: updates.videoType,
      p_video_time: updates.videoTime,
      p_is_playing: updates.isPlaying
    });

    if (error) console.error('Failed to update room state:', error);
  }

  async toggleMemberControls(memberId: string, hasControls: boolean) {
    const { error } = await supabase
      .from('room_members')
      .update({ has_controls: hasControls })
      .eq('id', memberId);

    if (error) console.error('Failed to update member controls:', error);
  }

  unsubscribe() {
    if (this.roomChannel) {
      supabase.removeChannel(this.roomChannel);
      this.roomChannel = null;
    }
    if (this.eventsChannel) {
      supabase.removeChannel(this.eventsChannel);
      this.eventsChannel = null;
    }
  }

  leaveRoom() {
    this.unsubscribe();
    this.currentRoom = null;
    this.members = [];
  }
}

export const roomStore = new RoomStore();
