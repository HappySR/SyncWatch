<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { roomStore } from '$lib/stores/room.svelte';
  import { playerStore } from '$lib/stores/player.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';
  import RoomControls from '$lib/components/RoomControls.svelte';
  import UserList from '$lib/components/UserList.svelte';
  import ChatPanel from '$lib/components/ChatPanel.svelte';
  import { Copy, Check } from 'lucide-svelte';

  let roomId = $derived($page.params.id ?? '');
  let loading = $state(true);
  let copied = $state(false);
  let isVideoFullscreen = $state(false);

  onMount(async () => {
    try {
      console.log('Joining room:', roomId);
      await roomStore.joinRoom(roomId);
      console.log('Room joined successfully');
      console.log('Current members:', roomStore.members);
      console.log('Current user:', authStore.user?.id);
      
      // Find current user's member record
      const myMember = roomStore.members.find(m => m.user_id === authStore.user?.id);
      console.log('My member record:', myMember);
      console.log('Has controls:', myMember?.has_controls);
      
      await playerStore.syncWithRoom();
      console.log('Player synced with room');
      loading = false;
    } catch (error) {
      console.error('Failed to join room:', error);
      loading = false;
    }
  });

  onDestroy(() => {
    roomStore.leaveRoom();
    playerStore.cleanup();
  });

  async function copyRoomId() {
    await navigator.clipboard.writeText(roomId);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }

  function handleFullscreenChange(fullscreen: boolean) {
    isVideoFullscreen = fullscreen;
  }

  const currentMember = $derived(
    roomStore.members.find(m => m.user_id === authStore.user?.id)
  );

  const isHost = $derived(
    roomStore.currentRoom?.host_id === authStore.user?.id
  );
</script>

{#if loading}
  <div class="flex items-center justify-center min-h-screen">
    <div class="text-white text-xl">Loading room...</div>
  </div>
{:else if roomStore.currentRoom}
  <div class="max-w-450 mx-auto px-4 py-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-text-primary mb-2">
          {roomStore.currentRoom.name}
        </h1>
        <button
          onclick={copyRoomId}
          class="flex items-center gap-2 text-text-secondary hover:text-text-primary transition text-sm"
        >
          {#if copied}
            <Check class="w-4 h-4 text-green-400" />
            <span class="text-green-400">Copied!</span>
          {:else}
            <Copy class="w-4 h-4" />
            <span>Room ID: {roomId}</span>
          {/if}
        </button>
      </div>

      {#if !currentMember?.has_controls}
        <div class="bg-orange-500/20 text-orange-400 px-4 py-2 rounded-lg text-sm">
          View Only Mode
        </div>
      {/if}
    </div>

    <div class="grid lg:grid-cols-[1fr_320px] gap-6">
      <div class="space-y-6">
        <VideoPlayer onFullscreenChange={handleFullscreenChange} />
        
        <RoomControls />
      </div>

      <div class="space-y-6">
        <UserList {isHost} />
        
        <div class="h-125">
          <ChatPanel isFullscreen={isVideoFullscreen} />
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="flex items-center justify-center min-h-screen">
    <div class="text-white text-xl">Room not found</div>
  </div>
{/if}
