import { supabase } from '$lib/supabase';
import type { Room, RoomMember } from '$lib/types';
import { authStore } from './auth.svelte';

class RoomStore {
  currentRoom = $state<Room | null>(null);
  members = $state<RoomMember[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  
  private roomChannel: any = null;

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
        // Add as member with controls enabled by default
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

    console.log('Subscribing to room updates:', roomId);

    // Subscribe to room updates and member changes
    this.roomChannel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          console.log('Room updated:', payload.new);
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
        () => {
          console.log('Members changed, reloading...');
          this.loadMembers(roomId);
        }
      )
      .subscribe((status) => {
        console.log('Room channel status:', status);
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
  }

  leaveRoom() {
    this.unsubscribe();
    this.currentRoom = null;
    this.members = [];
  }
}

export const roomStore = new RoomStore();
