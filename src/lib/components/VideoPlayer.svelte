<script lang="ts">
  import { playerStore } from '$lib/stores/player.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { Maximize, Minimize, Loader, Video } from 'lucide-svelte';

  let { onFullscreenChange = () => {} } = $props<{ onFullscreenChange?: (isFullscreen: boolean) => void }>();

  let videoElement: HTMLVideoElement | undefined = $state(undefined);
  let youtubePlayer: any;
  let isFullscreen = $state(false);
  let containerElement: HTMLDivElement | undefined = $state(undefined);
  let isVideoLoading = $state(false);

  const videoUrl = $derived(playerStore.videoUrl);
  const videoType = $derived(playerStore.videoType);
  const isPlaying = $derived(playerStore.isPlaying);
  const currentTime = $derived(playerStore.currentTime);

  // YouTube tracking
  let lastYtTime = 0;
  let ytSyncInterval: any = null;
  let isYouTubeReady = $state(false);

  // Direct video tracking
  let lastDirectTime = 0;
  let directSyncInterval: any = null;
  let isDirectVideoReady = $state(false);

  onMount(() => {
    loadYouTubeAPI();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  });

  onDestroy(() => {
    cleanup();
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
  });

  function cleanup() {
    if (youtubePlayer) {
      youtubePlayer.destroy();
    }
    if (ytSyncInterval) clearInterval(ytSyncInterval);
    if (directSyncInterval) clearInterval(directSyncInterval);
  }

  function handleFullscreenChange() {
    const newFullscreenState = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    isFullscreen = newFullscreenState;
    onFullscreenChange(newFullscreenState);
  }

  function toggleFullscreen() {
    if (!containerElement) return;
    
    if (!isFullscreen) {
      if (containerElement.requestFullscreen) {
        containerElement.requestFullscreen();
      } else if ((containerElement as any).webkitRequestFullscreen) {
        (containerElement as any).webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }
  }

  // ==================== YOUTUBE FUNCTIONS ====================

  function loadYouTubeAPI() {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
      
      (window as any).onYouTubeIframeAPIReady = () => {
        console.log('✅ YouTube API Ready');
        if (videoType === 'youtube' && videoUrl) {
          initYouTubePlayer();
        }
      };
    } else if ((window as any).YT && (window as any).YT.Player) {
      if (videoType === 'youtube' && videoUrl) {
        initYouTubePlayer();
      }
    }
  }

  function getYouTubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
      /youtube\.com\/embed\/([^&\s]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1].substring(0, 11);
    }
    return null;
  }

  function initYouTubePlayer() {
    if (!videoUrl || videoType !== 'youtube') return;
    
    const videoId = getYouTubeVideoId(videoUrl);
    if (!videoId) {
      console.error('Could not extract video ID from:', videoUrl);
      return;
    }

    console.log('🎬 Initializing YouTube player:', videoId);

    if (youtubePlayer) {
      youtubePlayer.destroy();
      isYouTubeReady = false;
    }
    
    if (ytSyncInterval) {
      clearInterval(ytSyncInterval);
      ytSyncInterval = null;
    }

    youtubePlayer = new (window as any).YT.Player('youtube-player', {
      videoId,
      playerVars: {
        controls: 1,
        modestbranding: 1,
        rel: 0,
        fs: 0,
        playsinline: 1,
        autoplay: 0,
        enablejsapi: 1,
        iv_load_policy: 3,
        disablekb: 0
      },
      events: {
        onReady: (event: any) => {
          console.log('✅ YouTube player ready');
          isYouTubeReady = true;
          lastYtTime = currentTime;
          
          try {
            event.target.setPlaybackQuality('default');
          } catch (e) {}
          
          setTimeout(() => {
            syncYouTubePlayer();
            startYouTubeMonitoring();
          }, 500);
        },
        onStateChange: (event: any) => {
          const YT = (window as any).YT;
          
          if (playerStore.isSyncing) return;
          
          if (event.data === YT.PlayerState.PLAYING && !isPlaying) {
            const currentYtTime = youtubePlayer.getCurrentTime();
            playerStore.currentTime = currentYtTime;
            lastYtTime = currentYtTime;
            playerStore.play();
          } else if (event.data === YT.PlayerState.PAUSED && isPlaying) {
            const currentYtTime = youtubePlayer.getCurrentTime();
            playerStore.currentTime = currentYtTime;
            lastYtTime = currentYtTime;
            playerStore.pause();
          }
        },
        onError: (event: any) => {
          console.error('YouTube player error:', event.data);
        }
      }
    });
  }

  function startYouTubeMonitoring() {
    if (ytSyncInterval) clearInterval(ytSyncInterval);

    ytSyncInterval = setInterval(() => {
      if (!youtubePlayer || !youtubePlayer.getCurrentTime || !isYouTubeReady) return;
      
      try {
        const ytTime = youtubePlayer.getCurrentTime();
        const duration = youtubePlayer.getDuration();
        
        if (duration && duration !== playerStore.duration) {
          playerStore.duration = duration;
        }
        
        const timeDiff = Math.abs(ytTime - lastYtTime);
        if (timeDiff > 2 && !playerStore.isSyncing) {
          console.log('⏩ YouTube seek detected:', lastYtTime, '→', ytTime);
          playerStore.seek(ytTime);
        }
        
        lastYtTime = ytTime;
        
        if (!playerStore.isSyncing && isPlaying) {
          playerStore.currentTime = ytTime;
        }
      } catch (e) {}
    }, 500);
  }

  function syncYouTubePlayer() {
    if (!youtubePlayer || !isYouTubeReady || videoType !== 'youtube') return;

    try {
      const state = youtubePlayer.getPlayerState();
      const ytTime = youtubePlayer.getCurrentTime ? youtubePlayer.getCurrentTime() : 0;
      
      console.log('🔄 Syncing YouTube:', { isPlaying, currentTime, ytTime, state });
      
      const timeDiff = Math.abs(ytTime - currentTime);
      if (timeDiff > 1) {
        console.log('⏩ Seeking YouTube to:', currentTime);
        youtubePlayer.seekTo(currentTime, true);
        lastYtTime = currentTime;
      }
      
      const YT = (window as any).YT;
      if (isPlaying && state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
        console.log('▶️ Starting YouTube playback');
        youtubePlayer.playVideo();
      } else if (!isPlaying && state === YT.PlayerState.PLAYING) {
        console.log('⏸️ Pausing YouTube playback');
        youtubePlayer.pauseVideo();
      }
    } catch (e) {
      console.log('Sync error:', e);
    }
  }

  // ==================== DIRECT VIDEO FUNCTIONS ====================

  function initDirectVideo() {
    if (!videoElement || !videoUrl || videoType !== 'direct') return;

    console.log('🎬 Initializing direct video player');
    isVideoLoading = true;
    isDirectVideoReady = false;

    // Set the source
    videoElement.src = videoUrl;
    
    // Wait for it to load
    videoElement.load();
  }

  function startDirectVideoMonitoring() {
    if (directSyncInterval) clearInterval(directSyncInterval);

    directSyncInterval = setInterval(() => {
      if (!videoElement || !isDirectVideoReady) return;
      
      try {
        const videoTime = videoElement.currentTime;
        const duration = videoElement.duration;
        
        // Update duration
        if (duration && !isNaN(duration) && duration !== playerStore.duration) {
          playerStore.duration = duration;
        }
        
        // Detect manual seeks (jumps > 2 seconds)
        const timeDiff = Math.abs(videoTime - lastDirectTime);
        if (timeDiff > 2 && !playerStore.isSyncing && !videoElement.seeking) {
          console.log('⏩ Direct video seek detected:', lastDirectTime, '→', videoTime);
          playerStore.seek(videoTime);
        }
        
        lastDirectTime = videoTime;
        
        // Smooth time updates during playback
        if (!playerStore.isSyncing && isPlaying && !videoElement.paused) {
          playerStore.currentTime = videoTime;
        }
      } catch (e) {}
    }, 500);
  }

  function syncDirectVideo() {
    if (!videoElement || !isDirectVideoReady || videoType !== 'direct') return;

    try {
      const videoTime = videoElement.currentTime;
      const isPaused = videoElement.paused;
      
      console.log('🔄 Syncing direct video:', { isPlaying, currentTime, videoTime, isPaused });
      
      // Seek if time difference is significant
      const timeDiff = Math.abs(videoTime - currentTime);
      if (timeDiff > 1 && !videoElement.seeking) {
        console.log('⏩ Seeking direct video to:', currentTime);
        videoElement.currentTime = currentTime;
        lastDirectTime = currentTime;
      }
      
      // Sync play/pause state
      if (isPlaying && isPaused) {
        console.log('▶️ Starting direct video playback');
        videoElement.play().catch(e => {
          console.log('Autoplay prevented:', e);
        });
      } else if (!isPlaying && !isPaused) {
        console.log('⏸️ Pausing direct video playback');
        videoElement.pause();
      }
    } catch (e) {
      console.log('Sync error:', e);
    }
  }

  // ==================== EFFECTS ====================

  // YouTube video URL changed
  $effect(() => {
    if (videoUrl && videoType === 'youtube') {
      console.log('🔄 Video URL changed, initializing YouTube player');
      isYouTubeReady = false;
      initYouTubePlayer();
    }
  });

  // Direct video URL changed
  $effect(() => {
    if (videoUrl && videoType === 'direct') {
      console.log('🔄 Video URL changed, initializing direct video');
      isDirectVideoReady = false;
      initDirectVideo();
    }
  });

  // Sync when isSyncing changes
  $effect(() => {
    if (playerStore.isSyncing) {
      if (videoType === 'youtube' && isYouTubeReady) {
        syncYouTubePlayer();
      } else if (videoType === 'direct' && isDirectVideoReady) {
        syncDirectVideo();
      }
    }
  });

  // Direct video event handlers
  function handleDirectVideoLoadedMetadata() {
    if (!videoElement) return;
    
    console.log('✅ Direct video metadata loaded');
    isVideoLoading = false;
    isDirectVideoReady = true;
    lastDirectTime = currentTime;
    
    playerStore.duration = videoElement.duration;
    
    // Initial sync
    setTimeout(() => {
      syncDirectVideo();
      startDirectVideoMonitoring();
    }, 100);
  }

  function handleDirectVideoPlay() {
    if (playerStore.isSyncing || !isDirectVideoReady) return;
    
    if (!isPlaying && videoElement) {
      const videoTime = videoElement.currentTime;
      playerStore.currentTime = videoTime;
      lastDirectTime = videoTime;
      playerStore.play();
    }
  }

  function handleDirectVideoPause() {
    if (playerStore.isSyncing || !isDirectVideoReady) return;
    
    if (isPlaying && videoElement) {
      const videoTime = videoElement.currentTime;
      playerStore.currentTime = videoTime;
      lastDirectTime = videoTime;
      playerStore.pause();
    }
  }

  function handleDirectVideoSeeked() {
    if (playerStore.isSyncing || !isDirectVideoReady || !videoElement) return;
    
    const videoTime = videoElement.currentTime;
    const timeDiff = Math.abs(videoTime - lastDirectTime);
    
    // Only report significant seeks
    if (timeDiff > 2) {
      playerStore.seek(videoTime);
      lastDirectTime = videoTime;
    }
  }

  function handleDirectVideoWaiting() {
    isVideoLoading = true;
  }

  function handleDirectVideoCanPlay() {
    isVideoLoading = false;
  }

  function handleDirectVideoError(e: Event) {
    console.error('❌ Direct video error:', e);
    isVideoLoading = false;
    alert('Failed to load video. Please check:\n\n• The URL is correct\n• The file is publicly accessible\n• Your internet connection is stable\n\nTry using YouTube or Dropbox for better reliability.');
  }
</script>

<div 
  bind:this={containerElement}
  role="region"
  aria-label="Video player"
  class="relative bg-black rounded-xl overflow-hidden aspect-video group"
  class:fullscreen-container={isFullscreen}
>
  {#if !videoUrl}
    <div class="absolute inset-0 flex items-center justify-center text-white/60">
      <div class="text-center space-y-2">
        <Video class="w-16 h-16 mx-auto opacity-30" />
        <p class="text-lg">No video loaded</p>
        <p class="text-sm">Add a video URL below to start watching together</p>
      </div>
    </div>
  {:else if videoType === 'youtube'}
    <div id="youtube-player" class="w-full h-full"></div>
    
    <button
      onclick={toggleFullscreen}
      class="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white p-3 rounded-lg transition z-50 opacity-100 pointer-events-auto"
      title="Toggle Fullscreen"
      aria-label="Toggle Fullscreen"
    >
      {#if isFullscreen}
        <Minimize class="w-5 h-5" />
      {:else}
        <Maximize class="w-5 h-5" />
      {/if}
    </button>
  {:else}
    <!-- Direct Video Player -->
    <video
      bind:this={videoElement}
      class="w-full h-full"
      controls
      preload="metadata"
      onloadedmetadata={handleDirectVideoLoadedMetadata}
      onplay={handleDirectVideoPlay}
      onpause={handleDirectVideoPause}
      onseeked={handleDirectVideoSeeked}
      onwaiting={handleDirectVideoWaiting}
      oncanplay={handleDirectVideoCanPlay}
      onerror={handleDirectVideoError}
    >
      <track kind="captions" />
    </video>
    
    <!-- Loading indicator -->
    {#if isVideoLoading}
      <div class="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div class="text-center text-white">
          <Loader class="w-12 h-12 mx-auto mb-2 animate-spin" />
          <p>Loading video...</p>
        </div>
      </div>
    {/if}
    
    <button
      onclick={toggleFullscreen}
      class="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white p-3 rounded-lg transition z-50 opacity-100 pointer-events-auto"
      title="Toggle Fullscreen"
      aria-label="Toggle Fullscreen"
    >
      {#if isFullscreen}
        <Minimize class="w-5 h-5" />
      {:else}
        <Maximize class="w-5 h-5" />
      {/if}
    </button>
  {/if}
</div>

<style>
  .fullscreen-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    border-radius: 0;
  }
</style>
