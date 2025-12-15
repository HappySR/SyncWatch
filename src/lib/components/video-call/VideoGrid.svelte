<script lang="ts">
  let {
    localStream,
    remoteStreams,
    activeSpeaker,
    currentUserId,
    compact = false
  } = $props<{
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    activeSpeaker: string | null;
    currentUserId: string;
    compact?: boolean;
  }>();

  let localVideoRef: HTMLVideoElement | undefined = $state(undefined);
  let remoteVideoRefs = $state<Map<string, HTMLVideoElement>>(new Map());

  $effect(() => {
    if (localVideoRef && localStream) {
      localVideoRef.srcObject = localStream;
      localVideoRef.play().catch(e => console.log('Local video autoplay prevented'));
    }
  });

  $effect(() => {
    remoteStreams.forEach((stream: MediaStream, userId: string) => {
      const videoEl = remoteVideoRefs.get(userId);
      if (videoEl && videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
        videoEl.play().catch(e => console.log('Remote video autoplay prevented'));
      }
    });
  });

  function setVideoRef(node: HTMLVideoElement, userId: string) {
    remoteVideoRefs.set(userId, node);
    return {
        destroy() {
        remoteVideoRefs.delete(userId);
        }
    };
  }

  const remoteStreamsArray = $derived<[string, MediaStream][]>(Array.from(remoteStreams.entries()));

  const gridClass = $derived.by(() => {
  const total = remoteStreams.size + 1; // +1 for local
  if (total === 1) return 'grid-cols-1';
  if (total === 2) return 'grid-cols-2';
  if (total <= 4) return 'grid-cols-2';
  if (total <= 6) return 'grid-cols-3';
  return 'grid-cols-4';
});
</script>

<div class="relative">
  {#if remoteStreams.size > 0}
    <!-- Grid layout for multiple participants -->
    <div class="grid {gridClass} gap-2">
      <!-- Remote streams -->
      {#each remoteStreamsArray as [userId, stream]}
        <div class="relative aspect-video bg-black rounded-lg overflow-hidden">
          <video
            autoplay
            playsinline
            class="w-full h-full object-cover"
            use:setVideoRef={userId}
          ></video>
          {#if activeSpeaker === userId}
            <div class="absolute top-2 left-2 bg-green-500/80 px-2 py-1 rounded text-white text-xs">
              Speaking
            </div>
          {/if}
        </div>
      {/each}
      
      <!-- Local stream (smaller in grid) -->
      <div class="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video
          bind:this={localVideoRef}
          autoplay
          muted
          playsinline
          class="w-full h-full object-cover"
          style="transform: scaleX(-1);"
        ></video>
        <div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs">
          You
        </div>
      </div>
    </div>
  {:else}
    <!-- Local stream only (full size) -->
    <div class="relative aspect-video bg-black rounded-lg overflow-hidden {compact ? 'h-40' : 'h-48'}">
      <video
        bind:this={localVideoRef}
        autoplay
        muted
        playsinline
        class="w-full h-full object-cover"
        style="transform: scaleX(-1);"
      ></video>
      <div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs">
        You
      </div>
    </div>
  {/if}
</div>
