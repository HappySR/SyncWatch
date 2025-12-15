<script lang="ts">
  import { playerStore } from '$lib/stores/player.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { Maximize, Minimize } from 'lucide-svelte';

  let { onFullscreenChange = () => {} } = $props<{ onFullscreenChange?: (isFullscreen: boolean) => void }>();

  let videoElement: HTMLVideoElement | undefined = $state(undefined);
  let youtubePlayer: any;
  let isFullscreen = $state(false);
  let containerElement: HTMLDivElement | undefined = $state(undefined);

  const videoUrl = $derived(playerStore.videoUrl);
  const videoType = $derived(playerStore.videoType);
  const isPlaying = $derived(playerStore.isPlaying);
  const currentTime = $derived(playerStore.currentTime);

  let lastYtTime = 0;
  let ytSyncInterval: any = null;
  let isYouTubeReady = $state(false);

  onMount(() => {
    loadYouTubeAPI();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  });

  onDestroy(() => {
    if (youtubePlayer) {
      youtubePlayer.destroy();
    }
    if (ytSyncInterval) clearInterval(ytSyncInterval);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
  });

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
      // API already loaded
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
      if (match) return match[1].substring(0, 11); // Ensure only 11 chars
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

    // Create new player
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
        // These help reduce buffering
        iv_load_policy: 3,
        disablekb: 0
      },
      events: {
        onReady: (event: any) => {
          console.log('✅ YouTube player ready');
          isYouTubeReady = true;
          lastYtTime = currentTime;
          
          // Set quality to auto (best for connection)
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
          
          if (playerStore.isSyncing) {
            return;
          }
          
          // Only process user actions, not programmatic changes
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
    if (ytSyncInterval) {
      clearInterval(ytSyncInterval);
    }

    ytSyncInterval = setInterval(() => {
      if (!youtubePlayer || !youtubePlayer.getCurrentTime || !isYouTubeReady) return;
      
      try {
        const ytTime = youtubePlayer.getCurrentTime();
        const duration = youtubePlayer.getDuration();
        
        if (duration && duration !== playerStore.duration) {
          playerStore.duration = duration;
        }
        
        // Only detect intentional seeks (jumps > 2 seconds)
        const timeDiff = Math.abs(ytTime - lastYtTime);
        if (timeDiff > 2 && !playerStore.isSyncing) {
          console.log('⏩ YouTube seek detected:', lastYtTime, '→', ytTime);
          playerStore.seek(ytTime);
        }
        
        lastYtTime = ytTime;
        
        // Update current time smoothly
        if (!playerStore.isSyncing && isPlaying) {
          playerStore.currentTime = ytTime;
        }
      } catch (e) {
        // Ignore errors during monitoring
      }
    }, 500); // Check every 500ms for smooth playback
  }

  function syncYouTubePlayer() {
    if (!youtubePlayer || !isYouTubeReady || videoType !== 'youtube') return;

    try {
      const state = youtubePlayer.getPlayerState();
      const ytTime = youtubePlayer.getCurrentTime ? youtubePlayer.getCurrentTime() : 0;
      
      console.log('🔄 Syncing YouTube:', { isPlaying, currentTime, ytTime, state });
      
      // Seek if time difference is significant
      const timeDiff = Math.abs(ytTime - currentTime);
      if (timeDiff > 1) {
        console.log('⏩ Seeking YouTube to:', currentTime);
        youtubePlayer.seekTo(currentTime, true);
        lastYtTime = currentTime;
      }
      
      // Sync play/pause state
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

  $effect(() => {
    if (videoUrl && videoType === 'youtube') {
      console.log('🔄 Video URL changed, initializing player');
      isYouTubeReady = false;
      initYouTubePlayer();
    }
  });

  $effect(() => {
    if (playerStore.isSyncing && isYouTubeReady) {
      syncYouTubePlayer();
    }
  });

  // Direct video handling
  $effect(() => {
    if (videoElement && videoUrl && videoType === 'direct') {
      videoElement.src = videoUrl;
    }
  });

  $effect(() => {
    if (videoType === 'direct' && videoElement) {
      const handleLoadedMetadata = () => {
        if (playerStore.isSyncing && Math.abs(videoElement!.currentTime - currentTime) > 0.5) {
          videoElement!.currentTime = currentTime;
          if (isPlaying) {
            videoElement!.play().catch(e => console.log('Autoplay prevented:', e));
          }
        }
      };

      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);

      if (!playerStore.isSyncing) {
        const interval = setInterval(() => {
          if (videoElement && isPlaying) {
            playerStore.currentTime = videoElement.currentTime;
          }
        }, 500);
        
        return () => {
          clearInterval(interval);
          videoElement?.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
      }

      return () => {
        videoElement?.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  });
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
      <div class="text-center">
        <p>No video loaded. Add a video URL below to start watching.</p>
      </div>
    </div>
  {:else if videoType === 'youtube'}
    <div id="youtube-player" class="w-full h-full"></div>
    
    <button
      onclick={toggleFullscreen}
      class="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white p-3 rounded-lg transition z-10 opacity-0 group-hover:opacity-100 focus:opacity-100 md:opacity-100"
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
    <video
      bind:this={videoElement}
      class="w-full h-full"
      controls
      onloadedmetadata={() => {
        if (videoElement) {
          playerStore.duration = videoElement.duration;
        }
      }}
      onplay={() => {
        if (!playerStore.isSyncing && !isPlaying) {
          playerStore.play();
        }
      }}
      onpause={() => {
        if (!playerStore.isSyncing && isPlaying) {
          playerStore.pause();
        }
      }}
      onseeked={() => {
        if (!playerStore.isSyncing && videoElement) {
          playerStore.seek(videoElement.currentTime);
        }
      }}
    >
      <track kind="captions" />
    </video>
    
    <button
      onclick={toggleFullscreen}
      class="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white p-3 rounded-lg transition z-10 opacity-0 group-hover:opacity-100 focus:opacity-100 md:opacity-100"
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
