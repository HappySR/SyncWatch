<script lang="ts">
  import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-svelte';

  let {
    isMicOn,
    isVideoOn,
    onToggleMic,
    onToggleVideo,
    onEndCall
  } = $props<{
    isMicOn: boolean;
    isVideoOn: boolean;
    onToggleMic: () => void;
    onToggleVideo: () => void;
    onEndCall: () => void;
  }>();
</script>

<div class="flex gap-2 mt-3">
  <button
    onclick={onToggleMic}
    class="flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 text-white text-sm {isMicOn ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}"
  >
    {#if isMicOn}
      <Mic class="w-4 h-4" />
    {:else}
      <MicOff class="w-4 h-4" />
    {/if}
  </button>

  <button
    onclick={onToggleVideo}
    class="flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 text-white text-sm {isVideoOn ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}"
  >
    {#if isVideoOn}
      <Video class="w-4 h-4" />
    {:else}
      <VideoOff class="w-4 h-4" />
    {/if}
  </button>

  <button
    onclick={onEndCall}
    class="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 text-sm"
  >
    <PhoneOff class="w-4 h-4" />
  </button>
</div>
