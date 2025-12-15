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

  $effect(() => {
    if (localVideoRef && localStream) {
      localVideoRef.srcObject = localStream;
      localVideoRef.play().catch(e => console.log('Local video autoplay prevented'));
    }
  });

  $effect(() => {
    remoteStreams.forEach((stream: MediaStream, userId: string) => {
      const videoEl = remoteVideoRefs.get(userId);
      const audioEl = remoteAudioRefs.get(userId);
      
      if (videoEl && videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
        videoEl.play().catch(e => console.log('Remote video autoplay prevented'));
      }
      
      if (audioEl && audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
        audioEl.play().catch(e => console.log('Remote audio autoplay prevented'));
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

  function setAudioRef(node: HTMLAudioElement, userId: string) {
    remoteAudioRefs.set(userId, node);
    return {
      destroy() {
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
  }

  function onDrag(e: MouseEvent) {
    if (!isDragging || !isDraggable) return;
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
  class="relative {isDraggable ? 'cursor-move' : ''}"
  style={isDraggable ? `transform: translate(${position.x}px, ${position.y}px); position: fixed;` : ''}
  onmousedown={startDrag}
  role="region"
  aria-label="Video call"
>
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
          <audio
            autoplay
            use:setAudioRef={userId}
          ></audio>
          {#if activeSpeaker === userId}
            <div class="absolute top-2 left-2 bg-green-500/80 px-2 py-1 rounded text-white text-xs">
              Speaking
            </div>
          {/if}
          {#if onMaximize}
            <button
              onclick={onMaximize}
              class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1 rounded text-xs"
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
