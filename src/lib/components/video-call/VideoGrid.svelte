<script lang="ts">
  let {
    localStream,
    remoteStreams,
    activeSpeaker,
    currentUserId,
    compact = false,
    isDraggable = false,
    onMaximize
  } = $props<{
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    activeSpeaker: string | null;
    currentUserId: string;
    compact?: boolean;
    isDraggable?: boolean;
    onMaximize?: () => void;
  }>();

  let localVideoRef: HTMLVideoElement | undefined = $state(undefined);
  let remoteVideoRefs = $state<Map<string, HTMLVideoElement>>(new Map());
  let remoteAudioRefs = $state<Map<string, HTMLAudioElement>>(new Map());

  // Keep track of which streams we've already set up
  let setupStreams = $state<Set<string>>(new Set());

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
      
      // Only set srcObject if it's different or not set yet
      if (videoEl && videoEl.srcObject !== stream) {
        console.log(`Setting video stream for ${userId}`);
        videoEl.srcObject = stream;
        videoEl.play().catch(e => {
          console.log('Remote video autoplay prevented, trying again:', e);
          // Retry after a short delay
          setTimeout(() => {
            videoEl.play().catch(e2 => console.log('Video play retry failed:', e2));
          }, 100);
        });
      }
      
      if (audioEl && audioEl.srcObject !== stream) {
        console.log(`Setting audio stream for ${userId}`);
        audioEl.srcObject = stream;
        audioEl.play().catch(e => {
          console.log('Remote audio autoplay prevented, trying again:', e);
          // Retry after a short delay
          setTimeout(() => {
            audioEl.play().catch(e2 => console.log('Audio play retry failed:', e2));
          }, 100);
        });
      }

      setupStreams.add(userId);
    });

    // Clean up removed streams
    setupStreams.forEach(userId => {
      if (!remoteStreams.has(userId)) {
        const videoEl = remoteVideoRefs.get(userId);
        const audioEl = remoteAudioRefs.get(userId);
        if (videoEl) videoEl.srcObject = null;
        if (audioEl) audioEl.srcObject = null;
        setupStreams.delete(userId);
      }
    });
  });

  function setVideoRef(node: HTMLVideoElement, userId: string) {
    console.log(`Video ref set for ${userId}`);
    remoteVideoRefs.set(userId, node);
    
    // Immediately try to set stream if available
    const stream = remoteStreams.get(userId);
    if (stream && node.srcObject !== stream) {
      node.srcObject = stream;
      node.play().catch(e => console.log('Initial video play failed:', e));
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
    
    // Immediately try to set stream if available
    const stream = remoteStreams.get(userId);
    if (stream && node.srcObject !== stream) {
      node.srcObject = stream;
      node.play().catch(e => console.log('Initial audio play failed:', e));
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

  // Dragging logic
  let isDragging = $state(false);
  let dragStart = $state({ x: 0, y: 0 });
  let position = $state({ x: 0, y: 0 });
  let containerRef: HTMLDivElement | undefined = $state(undefined);

  function startDrag(e: MouseEvent) {
    if (!isDraggable) return;
    isDragging = true;
    dragStart = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    e.preventDefault();
  }

  function onDrag(e: MouseEvent) {
    if (!isDragging || !isDraggable) return;
    e.preventDefault();
    position = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    };
  }

  function stopDrag() {
    isDragging = false;
  }

  $effect(() => {
    if (isDraggable) {
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', stopDrag);
      return () => {
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
      };
    }
  });
</script>

<div 
  bind:this={containerRef}
  class="relative {isDraggable ? 'cursor-move select-none' : ''}"
  style={isDraggable ? `transform: translate(${position.x}px, ${position.y}px);` : ''}
  role="region"
  aria-label={isDraggable ? 'Draggable video call window' : 'Video call'}
  onmousedown={isDraggable ? startDrag : undefined}
>
  {#if remoteStreams.size > 0}
    <!-- Grid layout for multiple participants -->
    <div class="grid {gridClass} gap-2">
      <!-- Remote streams -->
      {#each remoteStreamsArray as [userId, stream] (userId)}
        <div class="relative aspect-video bg-black rounded-lg overflow-hidden">
          <video
            autoplay
            playsinline
            muted={false}
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
          {#if onMaximize && isDraggable}
            <button
              onclick={onMaximize}
              class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1 rounded text-xs z-10"
            >
              Maximize
            </button>
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
