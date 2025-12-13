<script lang="ts">
  import { playerStore } from '$lib/stores/player.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { Play, Pause, Volume2, VolumeX, Maximize, SkipForward, SkipBack, Settings } from 'lucide-svelte';

  let videoElement: HTMLVideoElement;
  let youtubePlayer: any;
  let isMuted = $state(false);
  let isMobile = $state(false);
  let showControls = $state(true);
  let controlsTimeout: any;
  let isFullscreen = $state(false);
  let containerElement: HTMLDivElement;
  let showSettings = $state(false);
  let playbackRate = $state(1);

  const videoUrl = $derived(playerStore.videoUrl);
  const videoType = $derived(playerStore.videoType);
  const isPlaying = $derived(playerStore.isPlaying);
  const currentTime = $derived(playerStore.currentTime);
  const volume = $derived(playerStore.volume);

  let progressBarElement: HTMLDivElement;
  let isDragging = $state(false);

  onMount(() => {
    // Detect mobile device
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
      || window.innerWidth < 768;
    
    // Re-check on resize
    const handleResize = () => {
      isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || window.innerWidth < 768;
    };
    window.addEventListener('resize', handleResize);
    
    loadYouTubeAPI();
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    // Keyboard shortcuts (disabled on mobile)
    if (!isMobile) {
      document.addEventListener('keydown', handleKeyboard);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  onDestroy(() => {
    if (youtubePlayer) {
      youtubePlayer.destroy();
    }
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.removeEventListener('keydown', handleKeyboard);
  });

  function handleKeyboard(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    
    switch(e.key) {
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skipBackward();
        break;
      case 'ArrowRight':
        e.preventDefault();
        skipForward();
        break;
    }
  }

  function handleFullscreenChange() {
    isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
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

  function skipForward() {
    const newTime = Math.min(playerStore.duration, currentTime + 10);
    playerStore.seek(newTime);
  }

  function skipBackward() {
    const newTime = Math.max(0, currentTime - 10);
    playerStore.seek(newTime);
  }

  function changePlaybackRate(rate: number) {
    playbackRate = rate;
    if (videoType === 'youtube' && youtubePlayer && youtubePlayer.setPlaybackRate) {
      youtubePlayer.setPlaybackRate(rate);
    } else if (videoElement) {
      videoElement.playbackRate = rate;
    }
    showSettings = false;
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
    if (!videoId) return;

    if (youtubePlayer) {
      youtubePlayer.destroy();
    }

    youtubePlayer = new (window as any).YT.Player('youtube-player', {
      videoId,
      playerVars: {
        controls: isMobile ? 1 : 1, // Always show YouTube controls now
        modestbranding: 1,
        rel: 0,
        fs: isMobile ? 1 : 0, // Enable YouTube fullscreen on mobile
        playsinline: 1 // Better mobile support
      },
      events: {
        onReady: () => {
          syncPlayer();
          if (playbackRate !== 1) {
            youtubePlayer.setPlaybackRate(playbackRate);
          }
        },
        onStateChange: (event: any) => {
          const YT = (window as any).YT;
          
          if (!playerStore.isSyncing) {
            // User clicked play on YouTube player
            if (event.data === YT.PlayerState.PLAYING && !isPlaying) {
              playerStore.play();
            } 
            // User clicked pause on YouTube player
            else if (event.data === YT.PlayerState.PAUSED && isPlaying) {
              playerStore.pause();
            }
          }
        },
        onPlaybackRateChange: (event: any) => {
          playbackRate = event.data;
        }
      }
    });

    let lastYouTubeTime = 0;
    
    setInterval(() => {
      if (youtubePlayer && youtubePlayer.getCurrentTime && youtubePlayer.getDuration) {
        const time = youtubePlayer.getCurrentTime();
        const timeDiff = Math.abs(time - lastYouTubeTime);
        
        // Only sync if user manually seeked (big jump) and we're not already syncing
        if (timeDiff > 2 && !playerStore.isSyncing && !isDragging) {
          console.log('YouTube manual seek detected:', time);
          playerStore.seek(time);
        }
        
        lastYouTubeTime = time;
        playerStore.duration = youtubePlayer.getDuration();
      }
    }, 1000);
  }

  function syncPlayer() {
    if (videoType === 'youtube' && youtubePlayer && youtubePlayer.getPlayerState) {
      try {
        const state = youtubePlayer.getPlayerState();
        const ytTime = youtubePlayer.getCurrentTime ? youtubePlayer.getCurrentTime() : 0;
        
        // Sync play/pause state
        if (isPlaying && state !== 1 && state !== 3) {
          youtubePlayer.playVideo();
        } else if (!isPlaying && state === 1) {
          youtubePlayer.pauseVideo();
        }
        
        // Sync time only if significantly different (> 3 seconds)
        if (Math.abs(ytTime - currentTime) > 3) {
          youtubePlayer.seekTo(currentTime, true);
        }
      } catch (e) {
        console.log('Sync error:', e);
      }
    } else if (videoType === 'direct' && videoElement) {
      if (isPlaying && videoElement.paused) {
        videoElement.play().catch(e => console.log('Play failed:', e));
      } else if (!isPlaying && !videoElement.paused) {
        videoElement.pause();
      }
      
      if (Math.abs(videoElement.currentTime - currentTime) > 3) {
        videoElement.currentTime = currentTime;
      }
    }
  }

  $effect(() => {
    if (videoUrl && videoType === 'youtube') {
      initYouTubePlayer();
    }
  });

  let syncTimeout: any;
  
  $effect(() => {
    if (playerStore.isSyncing) {
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        syncPlayer();
      }, 100);
    }
  });

  function togglePlay() {
    console.log('Toggle play clicked. Current state:', isPlaying);
    if (isPlaying) {
      playerStore.pause();
      if (videoType === 'youtube' && youtubePlayer && youtubePlayer.pauseVideo) {
        youtubePlayer.pauseVideo();
      } else if (videoElement) {
        videoElement.pause();
      }
    } else {
      playerStore.play();
      if (videoType === 'youtube' && youtubePlayer && youtubePlayer.playVideo) {
        youtubePlayer.playVideo();
      } else if (videoElement) {
        videoElement.play();
      }
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
      if (isPlaying && !showSettings) showControls = false;
    }, 3000);
  }
</script>

<div 
  bind:this={containerElement}
  role="region"
  aria-label="Video player"
  class="relative bg-black rounded-xl overflow-hidden aspect-video group"
  class:fullscreen-container={isFullscreen}
  onmousemove={handleMouseMove}
  onmouseleave={() => isPlaying && !showSettings && (showControls = false)}
>
  {#if !videoUrl}
    <div class="absolute inset-0 flex items-center justify-center text-white/60">
      <div class="text-center">
        <Play class="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>No video loaded. Add a video URL below to start watching.</p>
      </div>
    </div>
  {:else if videoType === 'youtube'}
    <div id="youtube-player" class="w-full h-full pointer-events-auto"></div>
    {#if isMobile}
      <div class="absolute top-4 left-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white text-sm pointer-events-none z-10">
        <p class="font-medium mb-1">Mobile Mode</p>
        <p class="text-xs text-white/80">Use YouTube's controls (tap video) for all settings including quality</p>
      </div>
    {/if}
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
    class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-300 pointer-events-none"
    class:opacity-0={!showControls && isPlaying && !isMobile}
    class:opacity-100={showControls || !isPlaying || isMobile}
    class:hidden={isMobile && videoType === 'youtube'}
  >
    <button
      onclick={togglePlay}
      class="absolute inset-0 flex items-center justify-center group/play pointer-events-auto"
    >
      <div class="bg-white/10 backdrop-blur-sm rounded-full p-6 group-hover/play:bg-white/20 transition">
        {#if isPlaying}
          <Pause class="w-12 h-12 text-white" fill="white" />
        {:else}
          <Play class="w-12 h-12 text-white" fill="white" />
        {/if}
      </div>
    </button>

    <div class="absolute bottom-0 left-0 right-0 p-4 space-y-2 pointer-events-auto">
      <div
        bind:this={progressBarElement}
        role="button"
        tabindex="0"
        aria-label="Seek to position"
        class="w-full h-1 bg-white/30 rounded-full cursor-pointer group/progress"
        onclick={handleProgressClick}
        onkeydown={(e) => {
          if (e.key === 'ArrowLeft') {
            skipBackward();
          } else if (e.key === 'ArrowRight') {
            skipForward();
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

      <div class="flex items-center justify-between text-white" class:flex-col={isMobile} class:gap-2={isMobile}>
        <div class="flex items-center gap-3 md:gap-4" class:w-full={isMobile} class:justify-center={isMobile}>
          <button onclick={togglePlay} class="hover:text-purple-400 transition touch-manipulation" title="Play/Pause (Space)">
            {#if isPlaying}
              <Pause class={isMobile ? "w-6 h-6" : "w-5 h-5"} />
            {:else}
              <Play class="w-5 h-5" />
            {/if}
          </button>

          <!-- <button onclick={skipBackward} class="hover:text-purple-400 transition" title="Rewind 10s (←)">
            <SkipBack class="w-5 h-5" />
          </button>

          <button onclick={skipForward} class="hover:text-purple-400 transition" title="Forward 10s (→)">
            <SkipForward class="w-5 h-5" />
          </button> -->

          <button onclick={toggleMute} class="hover:text-purple-400 transition" title="Mute (M)">
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

        <div class="flex items-center gap-4">
          <div class="relative mt-1">
            <button 
              onclick={() => showSettings = !showSettings} 
              class="hover:text-purple-400 transition"
              title="Settings"
            >
              <Settings class="w-5 h-5" />
            </button>

            {#if showSettings}
              <div class="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-sm rounded-lg p-2 min-w-[150px]">
                <div class="text-xs text-white/60 mb-2 px-2">Playback Speed</div>
                {#each [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as rate}
                  <button
                    onclick={() => changePlaybackRate(rate)}
                    class="w-full text-left px-3 py-2 rounded hover:bg-white/10 transition text-sm"
                    class:bg-purple-500={playbackRate === rate}
                  >
                    {rate}x {rate === 1 ? '(Normal)' : ''}
                  </button>
                {/each}
                
                <!-- {#if videoType === 'youtube' && youtubePlayer && youtubePlayer.getAvailableQualityLevels}
                  <div class="text-xs text-white/60 mb-2 px-2 mt-3 pt-3 border-t border-white/10">Quality</div>
                  {#each youtubePlayer.getAvailableQualityLevels() as quality}
                    <button
                      onclick={() => { youtubePlayer.setPlaybackQuality(quality); showSettings = false; }}
                      class="w-full text-left px-3 py-2 rounded hover:bg-white/10 transition text-sm"
                    >
                      {quality}
                    </button>
                  {/each}
                {/if} -->
              </div>
            {/if}
          </div>

          <button onclick={toggleFullscreen} class="hover:text-purple-400 transition" title="Fullscreen (F)">
            <Maximize class="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  </div>
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
