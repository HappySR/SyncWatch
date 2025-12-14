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

  onMount(() => {
    loadYouTubeAPI();
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    return () => {
      if (ytSyncInterval) clearInterval(ytSyncInterval);
    };
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
    if (!videoId) {
      console.error('Could not extract video ID from:', videoUrl);
      return;
    }

    console.log('Initializing YouTube player with video ID:', videoId);

    if (youtubePlayer) {
      youtubePlayer.destroy();
    }
    
    if (ytSyncInterval) {
      clearInterval(ytSyncInterval);
    }

    youtubePlayer = new (window as any).YT.Player('youtube-player', {
      videoId,
      playerVars: {
        controls: 1,
        modestbranding: 1,
        rel: 0,
        fs: 0,
        playsinline: 1,
        autoplay: 0
      },
      events: {
        onReady: () => {
          console.log('YouTube player ready');
          console.log('Current playerStore state:', {
            currentTime,
            isPlaying,
            isSyncing: playerStore.isSyncing
          });
          
          lastYtTime = currentTime;
          
          // Sync player state after a short delay to ensure player is fully loaded
          setTimeout(() => {
            syncPlayer();
            startYouTubeMonitoring();
          }, 500);
        },
        onStateChange: (event: any) => {
          const YT = (window as any).YT;
          
          if (playerStore.isSyncing) {
            console.log('Ignoring state change during sync');
            return;
          }
          
          if (event.data === YT.PlayerState.PLAYING && !isPlaying) {
            console.log('YouTube play detected');
            const currentYtTime = youtubePlayer.getCurrentTime();
            playerStore.currentTime = currentYtTime;
            lastYtTime = currentYtTime;
            playerStore.play();
          } else if (event.data === YT.PlayerState.PAUSED && isPlaying) {
            console.log('YouTube pause detected');
            const currentYtTime = youtubePlayer.getCurrentTime();
            playerStore.currentTime = currentYtTime;
            lastYtTime = currentYtTime;
            playerStore.pause();
          }
        }
      }
    });
  }

  function startYouTubeMonitoring() {
    ytSyncInterval = setInterval(() => {
      if (!youtubePlayer || !youtubePlayer.getCurrentTime) return;
      
      try {
        const ytTime = youtubePlayer.getCurrentTime();
        const duration = youtubePlayer.getDuration();
        
        if (duration && duration !== playerStore.duration) {
          playerStore.duration = duration;
        }
        
        // Only detect intentional seeks (jumps > 3 seconds)
        const timeDiff = Math.abs(ytTime - lastYtTime);
        if (timeDiff > 3 && !playerStore.isSyncing) {
          console.log('YouTube seek detected:', lastYtTime, '→', ytTime);
          playerStore.seek(ytTime);
        }
        
        lastYtTime = ytTime;
        
        // Update playerStore currentTime for progress bar
        if (!playerStore.isSyncing) {
          playerStore.currentTime = ytTime;
        }
      } catch (e) {
        console.log('YouTube monitoring error:', e);
      }
    }, 1000); // Changed from 300ms to 1000ms for smoother experience
  }

  function syncPlayer() {
    if (videoType === 'youtube' && youtubePlayer && youtubePlayer.getPlayerState) {
      try {
        const state = youtubePlayer.getPlayerState();
        const ytTime = youtubePlayer.getCurrentTime ? youtubePlayer.getCurrentTime() : 0;
        
        console.log('Syncing YouTube:', { isPlaying, currentTime, ytTime, state });
        
        // Only sync if difference is significant (>2 seconds) to avoid jitter
        const timeDiff = Math.abs(ytTime - currentTime);
        if (timeDiff > 2) {
          console.log('Seeking YouTube to:', currentTime);
          youtubePlayer.seekTo(currentTime, true);
          lastYtTime = currentTime;
        }
        
        if (isPlaying && state !== 1 && state !== 3) {
          console.log('Starting YouTube playback');
          youtubePlayer.playVideo();
        } else if (!isPlaying && state === 1) {
          console.log('Pausing YouTube playback');
          youtubePlayer.pauseVideo();
        }
      } catch (e) {
        console.log('Sync error:', e);
      }
    } else if (videoType === 'direct' && videoElement) {
      if (Math.abs(videoElement.currentTime - currentTime) > 1) {
        videoElement.currentTime = currentTime;
      }
      
      if (isPlaying && videoElement.paused) {
        videoElement.play().catch(e => console.log('Play failed:', e));
      } else if (!isPlaying && !videoElement.paused) {
        videoElement.pause();
      }
    }
  }

  $effect(() => {
    if (videoUrl && videoType === 'youtube') {
      console.log('Effect triggered: Initializing YouTube player');
      console.log('Video URL:', videoUrl);
      console.log('Current time:', currentTime);
      console.log('Is playing:', isPlaying);
      initYouTubePlayer();
    }
  });

  $effect(() => {
    if (playerStore.isSyncing) {
      syncPlayer();
    }
  });

  // Set video source for direct videos
  $effect(() => {
    if (videoElement && videoUrl && videoType === 'direct') {
      videoElement.src = videoUrl;
    }
  });

  // Sync direct video currentTime to playerStore and handle initial sync
  $effect(() => {
    if (videoType === 'direct' && videoElement) {
      // Initial sync when video loads
      const handleLoadedMetadata = () => {
        if (playerStore.isSyncing && Math.abs(videoElement!.currentTime - currentTime) > 0.5) {
          console.log('Initial video sync to:', currentTime);
          videoElement!.currentTime = currentTime;
          if (isPlaying) {
            videoElement!.play().catch(e => console.log('Autoplay prevented:', e));
          }
        }
      };

      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);

      // Continuous sync during playback
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
    
    <!-- Fullscreen button - hidden by default, shows on hover/touch -->
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
    
    <!-- Fullscreen button - hidden by default, shows on hover/touch -->
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
