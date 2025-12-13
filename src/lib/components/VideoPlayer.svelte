<script lang="ts">
  import { playerStore } from '$lib/stores/player.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { Play, Pause, Volume2, VolumeX } from 'lucide-svelte';

  let videoElement: HTMLVideoElement;
  let youtubePlayer: any;
  let isMuted = $state(false);
  let showControls = $state(true);
  let controlsTimeout: any;

  const videoUrl = $derived(playerStore.videoUrl);
  const videoType = $derived(playerStore.videoType);
  const isPlaying = $derived(playerStore.isPlaying);
  const currentTime = $derived(playerStore.currentTime);
  const volume = $derived(playerStore.volume);

  let progressBarElement: HTMLDivElement;
  let isDragging = $state(false);

  onMount(() => {
    loadYouTubeAPI();
  });

  onDestroy(() => {
    if (youtubePlayer) {
      youtubePlayer.destroy();
    }
  });

  function loadYouTubeAPI() {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
      
      (window as any).onYouTubeIframeAPIReady = () => {
        if (videoType === 'youtube' && videoUrl) {
          initYouTubePlayer();
        }
      };
    }
  }

  function getYouTubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
      /youtube\.com\/embed\/([^&\s]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function initYouTubePlayer() {
    if (!videoUrl || videoType !== 'youtube') return;
    
    const videoId = getYouTubeVideoId(videoUrl);
    if (!videoId) return;

    if (youtubePlayer) {
      youtubePlayer.destroy();
    }

    youtubePlayer = new (window as any).YT.Player('youtube-player', {
      videoId,
      playerVars: {
        controls: 0,
        modestbranding: 1,
        rel: 0
      },
      events: {
        onReady: () => {
          syncPlayer();
        },
        onStateChange: (event: any) => {
          if (event.data === (window as any).YT.PlayerState.PLAYING && !isPlaying && !playerStore.isSyncing) {
            playerStore.pause();
          } else if (event.data === (window as any).YT.PlayerState.PAUSED && isPlaying && !playerStore.isSyncing) {
            playerStore.play();
          }
        }
      }
    });

    setInterval(() => {
      if (youtubePlayer && youtubePlayer.getCurrentTime) {
        const time = youtubePlayer.getCurrentTime();
        if (!isDragging && Math.abs(time - currentTime) > 1) {
          playerStore.currentTime = time;
        }
        if (youtubePlayer.getDuration) {
          playerStore.duration = youtubePlayer.getDuration();
        }
      }
    }, 500);
  }

  function syncPlayer() {
    if (videoType === 'youtube' && youtubePlayer) {
      if (isPlaying) {
        youtubePlayer.playVideo();
      } else {
        youtubePlayer.pauseVideo();
      }
      if (Math.abs(youtubePlayer.getCurrentTime() - currentTime) > 1) {
        youtubePlayer.seekTo(currentTime, true);
      }
    } else if (videoType === 'direct' && videoElement) {
      if (isPlaying) {
        videoElement.play();
      } else {
        videoElement.pause();
      }
      if (Math.abs(videoElement.currentTime - currentTime) > 1) {
        videoElement.currentTime = currentTime;
      }
    }
  }

  $effect(() => {
    if (videoUrl && videoType === 'youtube') {
      initYouTubePlayer();
    }
  });

  $effect(() => {
    if (!playerStore.isSyncing) return;
    syncPlayer();
  });

  function togglePlay() {
    if (isPlaying) {
      playerStore.pause();
    } else {
      playerStore.play();
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (videoType === 'youtube' && youtubePlayer) {
      if (isMuted) {
        youtubePlayer.mute();
      } else {
        youtubePlayer.unMute();
      }
    } else if (videoElement) {
      videoElement.muted = isMuted;
    }
  }

  function handleVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newVolume = parseFloat(target.value);
    playerStore.setVolume(newVolume);
    
    if (videoType === 'youtube' && youtubePlayer) {
      youtubePlayer.setVolume(newVolume * 100);
    } else if (videoElement) {
      videoElement.volume = newVolume;
    }
  }

  function handleProgressClick(e: MouseEvent) {
    if (!progressBarElement) return;
    const rect = progressBarElement.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * playerStore.duration;
    playerStore.seek(newTime);
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function handleMouseMove() {
    showControls = true;
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      if (isPlaying) showControls = false;
    }, 3000);
  }
</script>

<div 
  role="region"
  aria-label="Video player"
  class="relative bg-black rounded-xl overflow-hidden aspect-video group"
  onmousemove={handleMouseMove}
  onmouseleave={() => isPlaying && (showControls = false)}
>
  {#if !videoUrl}
    <div class="absolute inset-0 flex items-center justify-center text-white/60">
      <div class="text-center">
        <Play class="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>No video loaded. Add a video URL below to start watching.</p>
      </div>
    </div>
  {:else if videoType === 'youtube'}
    <div id="youtube-player" class="w-full h-full"></div>
  {:else}
    <video
      bind:this={videoElement}
      src={videoUrl}
      class="w-full h-full"
      onloadedmetadata={() => {
        playerStore.duration = videoElement.duration;
      }}
      ontimeupdate={() => {
        if (!isDragging) {
          playerStore.currentTime = videoElement.currentTime;
        }
      }}
    >
      <track kind="captions" />
    </video>
  {/if}
    
  <div 
    class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent transition-opacity duration-300"
    class:opacity-0={!showControls && isPlaying}
    class:opacity-100={showControls || !isPlaying}
  >
    <button
      onclick={togglePlay}
      class="absolute inset-0 flex items-center justify-center group/play"
    >
      <div class="bg-white/10 backdrop-blur-sm rounded-full p-6 group-hover/play:bg-white/20 transition">
        {#if isPlaying}
          <Pause class="w-12 h-12 text-white" fill="white" />
        {:else}
          <Play class="w-12 h-12 text-white" fill="white" />
        {/if}
      </div>
    </button>

    <div class="absolute bottom-0 left-0 right-0 p-4 space-y-2">
      <div
        bind:this={progressBarElement}
        role="button"
        tabindex="0"
        aria-label="Seek to position"
        class="w-full h-1 bg-white/30 rounded-full cursor-pointer group/progress"
        onclick={handleProgressClick}
        onkeydown={(e) => {
          if (e.key === 'ArrowLeft') {
            playerStore.seek(Math.max(0, currentTime - 5));
          } else if (e.key === 'ArrowRight') {
            playerStore.seek(Math.min(playerStore.duration, currentTime + 5));
          }
        }}
      >
        <div 
          class="h-full bg-purple-500 rounded-full relative"
          style="width: {(currentTime / playerStore.duration) * 100}%"
        >
          <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition"></div>
        </div>
      </div>

      <div class="flex items-center justify-between text-white">
        <div class="flex items-center gap-4">
          <button onclick={togglePlay} class="hover:text-purple-400 transition">
            {#if isPlaying}
              <Pause class="w-5 h-5" />
            {:else}
              <Play class="w-5 h-5" />
            {/if}
          </button>

          <button onclick={toggleMute} class="hover:text-purple-400 transition">
            {#if isMuted}
              <VolumeX class="w-5 h-5" />
            {:else}
              <Volume2 class="w-5 h-5" />
            {/if}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            oninput={handleVolumeChange}
            class="w-20 accent-purple-500"
          />

          <span class="text-sm">
            {formatTime(currentTime)} / {formatTime(playerStore.duration)}
          </span>
        </div>
      </div>
    </div>
  </div>
</div>
