<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import { roomStore } from '$lib/stores/room.svelte';
  import { goto } from '$app/navigation';
  import { Plus, Video, Clock } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import type { Room } from '$lib/types';

  let rooms = $state<Room[]>([]);
  let loading = $state(true);
  let showCreateModal = $state(false);
  let newRoomName = $state('');
  let joinRoomId = $state('');

  onMount(async () => {
    await loadRooms();
    loading = false;
  });

  async function loadRooms() {
    if (!authStore.user) return;

    const { data, error } = await supabase
      .from('room_members')
      .select(`
        room_id,
        rooms (*)
      `)
      .eq('user_id', authStore.user.id);

    if (data) {
      rooms = data.flatMap(d => d.rooms).filter((room): room is Room => room !== null && room !== undefined);
    }
  }

  async function createRoom() {
    if (!newRoomName.trim()) return;
    
    try {
      const roomId = await roomStore.createRoom(newRoomName);
      showCreateModal = false;
      newRoomName = '';
      goto(`/room/${roomId}`);
    } catch (error) {
      console.error('Failed to create room:', error);
    }
  }

  async function joinRoom() {
    if (!joinRoomId.trim()) return;
    
    try {
      await roomStore.joinRoom(joinRoomId);
      joinRoomId = '';
      goto(`/room/${roomStore.currentRoom?.id}`);
    } catch (error) {
      alert('Failed to join room. Check the room ID.');
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
</script>

<div class="max-w-7xl mx-auto px-4 py-8">
  <div class="mb-8">
    <h1 class="text-4xl font-bold text-white mb-2">
      Welcome back, {authStore.profile?.display_name || 'there'}!
    </h1>
    <p class="text-white/60">Create a room or join one to start watching together</p>
  </div>

  <div class="grid md:grid-cols-2 gap-4 mb-12">
    <button
      onclick={() => showCreateModal = true}
      class="bg-primary hover:opacity-90 p-6 rounded-xl transition-all transform hover:scale-105 flex items-center justify-center gap-3 text-black"
    >
      <Plus class="w-6 h-6" />
      <span class="text-lg font-semibold">Create New Room</span>
    </button>

    <div class="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
      <div class="text-white/80 text-sm mb-2">Join with Room ID</div>
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={joinRoomId}
          placeholder="Enter room ID"
          class="flex-1 bg-black/30 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-purple-500"
          onkeydown={(e) => e.key === 'Enter' && joinRoom()}
        />
        <button
          onclick={joinRoom}
          class="bg-primary hover:opacity-90 text-black px-6 py-2 rounded-lg transition"
        >
          Join
        </button>
      </div>
    </div>
  </div>

  <div>
    <h2 class="text-2xl font-bold text-white mb-4 flex items-center gap-2">
      <Video class="w-6 h-6" />
      My Rooms
    </h2>

    {#if loading}
      <div class="text-white/60">Loading rooms...</div>
    {:else if rooms.length === 0}
      <div class="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-12 text-center">
        <Video class="w-16 h-16 text-white/20 mx-auto mb-4" />
        <p class="text-white/60 mb-4">No rooms yet. Create one to get started!</p>
      </div>
    {:else}
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each rooms as room}
          <a
            href="/room/{room.id}"
            class="bg-white/5 backdrop-blur-sm border border-white/10 hover:border-purple-500/50 rounded-xl p-6 transition-all group"
          >
            <div class="flex items-start justify-between mb-4">
              <h3 class="text-white font-semibold text-lg group-hover:text-purple-400 transition">
                {room.name}
              </h3>
              {#if room.is_playing}
                <div class="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs">
                  Live
                </div>
              {/if}
            </div>

            <div class="space-y-2 text-sm text-white/60">
              <div class="flex items-center gap-2">
                <Clock class="w-4 h-4" />
                <span>Created {formatDate(room.created_at)}</span>
              </div>
              {#if room.current_video_url}
                <div class="flex items-center gap-2">
                  <Video class="w-4 h-4" />
                  <span class="truncate">Video loaded</span>
                </div>
              {/if}
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showCreateModal}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-white/10">
      <h2 class="text-2xl font-bold text-white mb-4">Create New Room</h2>
      
      <input
        type="text"
        bind:value={newRoomName}
        placeholder="Enter room name"
        class="w-full bg-black/30 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-purple-500 mb-6"
        onkeydown={(e) => e.key === 'Enter' && createRoom()}
      />

      <div class="flex gap-3">
        <button
          onclick={() => { showCreateModal = false; newRoomName = ''; }}
          class="flex-1 bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-lg transition"
        >
          Cancel
        </button>
        <button
          onclick={createRoom}
          class="flex-1 bg-primary hover:opacity-90 px-4 py-3 rounded-lg transition text-black"
        >
          Create Room
        </button>
      </div>
    </div>
  </div>
{/if}
