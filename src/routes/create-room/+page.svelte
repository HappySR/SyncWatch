<script lang="ts">
  import { roomStore } from '$lib/stores/room.svelte';
  import { goto } from '$app/navigation';
  import { Video, Users, Lock, Globe } from 'lucide-svelte';

  let roomName = $state('');
  let isPublic = $state(true);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function handleCreateRoom() {
    if (!roomName.trim()) {
      error = 'Please enter a room name';
      return;
    }

    loading = true;
    error = null;

    try {
      const roomId = await roomStore.createRoom(roomName);
      goto(`/room/${roomId}`);
    } catch (err: any) {
      error = err.message || 'Failed to create room';
      loading = false;
    }
  }
</script>

<div class="max-w-2xl mx-auto px-4 py-12">
  <div class="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-linear-to-br from-purple-500 to-pink-500 rounded-2xl mb-4">
        <Video class="w-8 h-8 text-white" />
      </div>
      <h1 class="text-3xl font-bold text-white mb-2">Create a Room</h1>
      <p class="text-white/60">Set up your watch party and invite friends</p>
    </div>

    <form onsubmit={(e) => { e.preventDefault(); handleCreateRoom(); }} class="space-y-6">
      <div>
        <label for="roomName" class="block text-white/80 text-sm font-medium mb-2">
          Room Name
        </label>
        <input
          id="roomName"
          type="text"
          bind:value={roomName}
          placeholder="e.g., Movie Night with Friends"
          class="w-full bg-black/30 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-purple-500"
          disabled={loading}
        />
      </div>

      <fieldset>
        <legend class="block text-white/80 text-sm font-medium mb-3">
          Privacy
        </legend>
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            onclick={() => isPublic = true}
            class="p-4 rounded-lg border-2 transition text-left
              {isPublic
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-white/20 bg-white/5'}"
            disabled={loading}
          >
            <Globe class="w-5 h-5 mb-2 {isPublic ? 'text-purple-400' : 'text-white/60'}" />
            <div class="text-white font-medium text-sm mb-1">Public</div>
            <div class="text-white/60 text-xs">Anyone can join with room ID</div>
          </button>

          <button
            type="button"
            onclick={() => isPublic = false}
            class="p-4 rounded-lg border-2 transition text-left
              {!isPublic
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-white/20 bg-white/5'}"
            disabled={loading}
          >
            <Lock class="w-5 h-5 mb-2 {!isPublic ? 'text-purple-400' : 'text-white/60'}" />
            <div class="text-white font-medium text-sm mb-1">Private</div>
            <div class="text-white/60 text-xs">Invite only (coming soon)</div>
          </button>
        </div>
      </fieldset>

      {#if error}
        <div class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      {/if}

      <div class="flex gap-3 pt-4">
        <button
          type="button"
          onclick={() => goto('/dashboard')}
          class="flex-1 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-lg transition font-medium"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="flex-1 bg-primary hover:opacity-90 text-white px-6 py-3 rounded-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading || !roomName.trim()}
        >
          {loading ? 'Creating...' : 'Create Room'}
        </button>
      </div>
    </form>

    <div class="mt-8 pt-6 border-t border-white/10">
      <div class="flex gap-3 text-white/60 text-sm">
        <Users class="w-5 h-5 shrink-0" />
        <div>
          <p class="font-medium text-white/80 mb-1">What happens next?</p>
          <ul class="space-y-1 text-xs">
            <li>• You'll be the host of this room</li>
            <li>• Share the room ID with friends to invite them</li>
            <li>• You can control who has video controls</li>
            <li>• Load any YouTube, direct link, or Google Drive video</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>
