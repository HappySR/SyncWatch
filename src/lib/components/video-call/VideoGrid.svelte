<script lang="ts">
  let {
    localStream,
    remoteStreams,
    activeSpeaker,
    currentUserId,
    compact = false,
    isDraggable = false
  } = $props<{
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    activeSpeaker: string | null;
    currentUserId: string;
    compact?: boolean;
    isDraggable?: boolean;
  }>();

  let localVideoRef: HTMLVideoElement | undefined = $state(undefined);
  let remoteVideoRefs = $state<Map<string, HTMLVideoElement>>(new Map());
  let remoteAudioRefs = $state<Map<string, HTMLAudioElement>>(new Map());

  $effect(() => {
    if (localVideoRef && localStream) {
      if (localVideoRef.srcObject !== localStream) {
        localVideoRef.srcObject = localStream;
        localVideoRef.play().catch(e => console.log('Local video autoplay prevented'));
      }
    }
  });

  $effect(() => {
    remoteStreams.forEach((stream: MediaStream, userId: string) => {
      const videoEl = remoteVideoRefs.get(userId);
      const audioEl = remoteAudioRefs.get(userId);
      
      if (videoEl && videoEl.srcObject !== stream) {
        console.log(`Setting video stream for ${userId}`);
        videoEl.srcObject = stream;
        videoEl.play().catch(e => {
          console.log('Remote video autoplay prevented:', e);
          setTimeout(() => videoEl.play().catch(() => {}), 500);
        });
      }
      
      if (audioEl && audioEl.srcObject !== stream) {
        console.log(`Setting audio stream for ${userId}`);
        audioEl.srcObject = stream;
        audioEl.play().catch(e => {
          console.log('Remote audio autoplay prevented:', e);
          setTimeout(() => audioEl.play().catch(() => {}), 500);
        });
      }
    });
  });

  function setVideoRef(node: HTMLVideoElement, userId: string) {
    console.log(`Video ref set for ${userId}`);
    remoteVideoRefs.set(userId, node);
    
    const stream = remoteStreams.get(userId);
    if (stream && node.srcObject !== stream) {
      node.srcObject = stream;
      setTimeout(() => {
        node.play().catch(e => console.log('Initial video play failed:', e));
      }, 100);
    }
    
    return {
      destroy() {
        console.log(`Video ref destroyed for ${userId}`);
        remoteVideoRefs.delete(userId);
      }
    };
  }

  function setAudioRef(node: HTMLAudioElement, userId: string) {
    console.log(`Audio ref set for ${userId}`);
    remoteAudioRefs.set(userId, node);
    
    const stream = remoteStreams.get(userId);
    if (stream && node.srcObject !== stream) {
      node.srcObject = stream;
      setTimeout(() => {
        node.play().catch(e => console.log('Initial audio play failed:', e));
      }, 100);
    }
    
    return {
      destroy() {
        console.log(`Audio ref destroyed for ${userId}`);
        remoteAudioRefs.delete(userId);
      }
    };
  }

  const remoteStreamsArray = $derived<[string, MediaStream][]>(Array.from(remoteStreams.entries()));

  const gridClass = $derived.by(() => {
    const total = remoteStreams.size + 1;
    if (total === 1) return 'grid-cols-1';
    if (total === 2) return 'grid-cols-2';
    if (total <= 4) return 'grid-cols-2';
    if (total <= 6) return 'grid-cols-3';
    return 'grid-cols-4';
  });
</script>

<div class="relative" role="region" aria-label="Video call">
  {#if remoteStreams.size > 0}
    <!-- Grid layout for multiple participants -->
    <div class="grid {gridClass} gap-2">
      <!-- Remote streams -->
      {#each remoteStreamsArray as [userId, stream] (userId)}
        <div class="relative aspect-video bg-black rounded-lg overflow-hidden">
          <video
            autoplay
            playsinline
            class="w-full h-full object-cover"
            use:setVideoRef={userId}
          ></video>
          <audio
            autoplay
            use:setAudioRef={userId}
          ></audio>
          {#if activeSpeaker === userId}
            <div class="absolute top-2 left-2 bg-green-500/80 px-2 py-1 rounded text-white text-xs z-10">
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
        <div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs z-10">
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
      <div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs z-10">
        You
      </div>
    </div>
  {/if}
</div>
