<script lang="ts">
	import { playerStore } from '$lib/stores/player.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { Maximize, Minimize, Loader, Video, SkipForward, SkipBack } from 'lucide-svelte';

	let { onFullscreenChange = () => {} } = $props<{
		onFullscreenChange?: (isFullscreen: boolean) => void;
	}>();

	let videoElement: HTMLVideoElement | undefined = $state(undefined);
	let youtubePlayer: any;
	let isFullscreen = $state(false);
	let containerElement: HTMLDivElement | undefined = $state(undefined);
	let isVideoLoading = $state(false);
	let showFullscreenButton = $state(false);

	// Double-tap seek states
	let lastTapTime = 0;
	let lastTapSide: 'left' | 'right' | null = null;
	let showSeekIndicator = $state<'forward' | 'backward' | null>(null);
	let seekIndicatorTimeout: any = null;

	const videoUrl = $derived(playerStore.videoUrl);
	const videoType = $derived(playerStore.videoType);
	const isPlaying = $derived(playerStore.isPlaying);
	const currentTime = $derived(playerStore.currentTime);

	// YouTube tracking
	let lastYtTime = 0;
	let ytSyncInterval: any = null;
	let isYouTubeReady = $state(false);
	let ytSyncCheckInterval: any = null;

	// Direct video tracking
	let lastDirectTime = 0;
	let directSyncInterval: any = null;
	let isDirectVideoReady = $state(false);
	let directSyncCheckInterval: any = null;
	let isUserSeeking = false;
	let seekDebounceTimeout: any = null;
	let hasUserInteracted = $state(false);
	let pendingPlayRequest = $state(false);
	let ignoreNextPlayEvent = false;
	let ignoreNextPauseEvent = false;

	onMount(() => {
		loadYouTubeAPI();
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
		document.addEventListener('keydown', handleGlobalKeydown);
	});

	onDestroy(() => {
		cleanup();
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
		document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
		document.removeEventListener('keydown', handleGlobalKeydown);
	});

	function cleanup() {
		if (youtubePlayer) {
			youtubePlayer.destroy();
		}
		if (ytSyncInterval) clearInterval(ytSyncInterval);
		if (ytSyncCheckInterval) clearInterval(ytSyncCheckInterval);
		if (directSyncInterval) clearInterval(directSyncInterval);
		if (directSyncCheckInterval) clearInterval(directSyncCheckInterval);
		if (seekDebounceTimeout) clearTimeout(seekDebounceTimeout);
		if (seekIndicatorTimeout) clearTimeout(seekIndicatorTimeout);
	}

	function handleFullscreenChange() {
		const newFullscreenState = !!(
			document.fullscreenElement || (document as any).webkitFullscreenElement
		);
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

	// ==================== KEYBOARD CONTROLS ====================

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

		// Handle both direct video and YouTube
		const hasVideo = (videoType === 'direct' && isDirectVideoReady) || (videoType === 'youtube' && isYouTubeReady);
		if (!hasVideo) return;

		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			handleSkip(-10);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			handleSkip(10);
		}
	}

	async function handleSkip(amount: number) {
		if (!playerStore.canControl()) return;

		// Show indicator
		showSeekIndicator = amount > 0 ? 'forward' : 'backward';
		if (seekIndicatorTimeout) clearTimeout(seekIndicatorTimeout);
		seekIndicatorTimeout = setTimeout(() => {
			showSeekIndicator = null;
		}, 500);

		if (videoType === 'youtube' && isYouTubeReady && youtubePlayer) {
			// Read live time directly from YouTube player
			const liveTime = youtubePlayer.getCurrentTime();
			const newTime = Math.max(0, liveTime + amount);
			youtubePlayer.seekTo(newTime, true);
			lastYtTime = newTime;
			playerStore.currentTime = newTime;
			await playerStore.seek(newTime);
		} else if (videoType === 'direct' && isDirectVideoReady && videoElement) {
			// Read live time directly from the video element
			const liveTime = videoElement.currentTime;
			const newTime = Math.max(0, Math.min(videoElement.duration || Infinity, liveTime + amount));
			isUserSeeking = true;
			videoElement.currentTime = newTime;
			lastDirectTime = newTime;
			await playerStore.seek(newTime);
			setTimeout(() => { isUserSeeking = false; }, 100);
		}
	}

	// Keep old name as alias so handleDoubleTapSeek still works
	async function handleKeyboardSeek(amount: number) {
		await handleSkip(amount);
	}

	// ==================== DOUBLE TAP SEEK ====================

	function handleVideoClick(e: MouseEvent) {
		if (!videoElement || videoType !== 'direct' || !playerStore.canControl()) return;

		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		const side = clickX < rect.width / 2 ? 'left' : 'right';
		const now = Date.now();

		// Check for double tap (within 300ms)
		if (now - lastTapTime < 300 && lastTapSide === side) {
			e.preventDefault();
			const seekAmount = side === 'left' ? -10 : 10;
			handleDoubleTapSeek(seekAmount);
			lastTapTime = 0;
			lastTapSide = null;
		} else {
			lastTapTime = now;
			lastTapSide = side;
		}
	}

	async function handleDoubleTapSeek(amount: number) {
		await handleSkip(amount);
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

		if (ytSyncInterval) clearInterval(ytSyncInterval);
		if (ytSyncCheckInterval) clearInterval(ytSyncCheckInterval);

		youtubePlayer = new (window as any).YT.Player('youtube-player', {
			videoId,
			playerVars: {
				controls: 1,
				modestbranding: 1,
				rel: 0,
				fs: 1,
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

					setTimeout(() => {
						syncYouTubePlayer();
						startYouTubeMonitoring();
						startYouTubeSyncCheck();
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

	function startYouTubeSyncCheck() {
		if (ytSyncCheckInterval) clearInterval(ytSyncCheckInterval);

		ytSyncCheckInterval = setInterval(() => {
			if (!youtubePlayer || !isYouTubeReady || playerStore.isSyncing) return;

			try {
				const ytTime = youtubePlayer.getCurrentTime();
				const expectedTime = currentTime;
				const diff = Math.abs(ytTime - expectedTime);

				if (diff > 2) {
					console.log('🔄 FORCE SYNC - Desync detected:', diff, 'seconds');
					youtubePlayer.seekTo(expectedTime, true);
					lastYtTime = expectedTime;
				}
			} catch (e) {}
		}, 3000);
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
		hasUserInteracted = false;
		pendingPlayRequest = false;

		videoElement.src = videoUrl;
		videoElement.preload = 'auto';
		videoElement.load();
	}

	function startDirectVideoMonitoring() {
		if (directSyncInterval) clearInterval(directSyncInterval);

		directSyncInterval = setInterval(() => {
			if (!videoElement || !isDirectVideoReady) return;

			try {
				const videoTime = videoElement.currentTime;
				const duration = videoElement.duration;

				if (duration && !isNaN(duration) && duration !== playerStore.duration) {
					playerStore.duration = duration;
				}

				// Only detect user-initiated seeks (not programmatic)
				const timeDiff = Math.abs(videoTime - lastDirectTime);
				if (timeDiff > 2 && !playerStore.isSyncing && !videoElement.seeking && !isUserSeeking) {
					console.log('⏩ Direct video USER seek detected:', lastDirectTime, '→', videoTime);
					playerStore.seek(videoTime);
				}

				lastDirectTime = videoTime;

				if (!playerStore.isSyncing && isPlaying && !videoElement.paused) {
					playerStore.currentTime = videoTime;
				}
			} catch (e) {}
		}, 500);
	}

	function startDirectSyncCheck() {
		if (directSyncCheckInterval) clearInterval(directSyncCheckInterval);

		directSyncCheckInterval = setInterval(() => {
			if (!videoElement || !isDirectVideoReady || playerStore.isSyncing || isUserSeeking) return;

			try {
				const videoTime = videoElement.currentTime;
				const expectedTime = currentTime;
				const diff = Math.abs(videoTime - expectedTime);

				if (diff > 2 && !videoElement.seeking) {
					console.log('🔄 FORCE SYNC - Desync detected:', diff, 'seconds');
					videoElement.currentTime = expectedTime;
					lastDirectTime = expectedTime;
				}
			} catch (e) {}
		}, 3000);
	}

	function syncDirectVideo() {
		if (!videoElement || !isDirectVideoReady || videoType !== 'direct') return;

		try {
			const videoTime = videoElement.currentTime;
			const isPaused = videoElement.paused;

			console.log('🔄 Syncing direct video:', { isPlaying, currentTime, videoTime, isPaused });

			const timeDiff = Math.abs(videoTime - currentTime);
			if (timeDiff > 1 && !videoElement.seeking && !isUserSeeking) {
				console.log('⏩ Seeking direct video to:', currentTime);
				videoElement.currentTime = currentTime;
				lastDirectTime = currentTime;
			}

			if (isPlaying && isPaused && !isUserSeeking) {
				console.log('▶️ Starting direct video playback');
				ignoreNextPlayEvent = true;
				attemptVideoPlay();
			} else if (!isPlaying && !isPaused) {
				console.log('⏸️ Pausing direct video playback');
				ignoreNextPauseEvent = true;
				videoElement.pause();
			}
		} catch (e) {
			console.log('Sync error:', e);
		}
	}

	async function attemptVideoPlay() {
		if (!videoElement) return;

		try {
			await videoElement.play();
			hasUserInteracted = true;
			pendingPlayRequest = false;
			console.log('✅ Video playback started successfully');
		} catch (error: any) {
			if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
				console.log('⏸️ Autoplay blocked - waiting for user interaction');
				pendingPlayRequest = true;
			} else {
				console.error('❌ Play error:', error);
			}
		}
	}

	// ==================== EFFECTS ====================

	$effect(() => {
		if (videoUrl && videoType === 'youtube') {
			console.log('🔄 Video URL changed, initializing YouTube player');
			isYouTubeReady = false;
			initYouTubePlayer();
		}
	});

	$effect(() => {
		if (videoUrl && videoType === 'direct') {
			console.log('🔄 Video URL changed, initializing direct video');
			isDirectVideoReady = false;
			initDirectVideo();
		}
	});

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

		setTimeout(() => {
			syncDirectVideo();
			startDirectVideoMonitoring();
			startDirectSyncCheck();
		}, 100);
	}

	function handleDirectVideoPlay() {
		// Ignore if this play was triggered by sync
		if (ignoreNextPlayEvent) {
			console.log('🔕 Ignoring play event (triggered by sync)');
			ignoreNextPlayEvent = false;
			return;
		}

		if (playerStore.isSyncing || !isDirectVideoReady || isUserSeeking) return;

		hasUserInteracted = true;
		pendingPlayRequest = false;

		if (!isPlaying && videoElement) {
			const videoTime = videoElement.currentTime;
			console.log('👆 USER PLAY detected, broadcasting...');
			playerStore.currentTime = videoTime;
			lastDirectTime = videoTime;
			playerStore.play();
		}
	}

	function handleDirectVideoPause() {
		// Ignore if this pause was triggered by sync
		if (ignoreNextPauseEvent) {
			console.log('🔕 Ignoring pause event (triggered by sync)');
			ignoreNextPauseEvent = false;
			return;
		}

		if (playerStore.isSyncing || !isDirectVideoReady || isUserSeeking) return;

		if (isPlaying && videoElement) {
			const videoTime = videoElement.currentTime;
			console.log('👆 USER PAUSE detected, broadcasting...');
			playerStore.currentTime = videoTime;
			lastDirectTime = videoTime;
			playerStore.pause();
		}
	}

	function handleDirectVideoSeeking() {
		if (!isUserSeeking && !playerStore.isSyncing) {
			isUserSeeking = true;
			if (seekDebounceTimeout) clearTimeout(seekDebounceTimeout);
		}
	}

	function handleDirectVideoSeeked() {
		if (playerStore.isSyncing || !isDirectVideoReady || !videoElement) return;

		if (seekDebounceTimeout) clearTimeout(seekDebounceTimeout);
		
		seekDebounceTimeout = setTimeout(() => {
			if (!videoElement) return;
			
			const videoTime = videoElement.currentTime;
			const timeDiff = Math.abs(videoTime - lastDirectTime);

			if (timeDiff > 1) {
				console.log('✅ USER seek completed, broadcasting:', videoTime);
				playerStore.seek(videoTime);
				lastDirectTime = videoTime;
			}
			
			isUserSeeking = false;
		}, 200);
	}

	function handleDirectVideoWaiting() {
		isVideoLoading = true;
	}

	function handleDirectVideoCanPlay() {
		isVideoLoading = false;
		
		if (pendingPlayRequest && isPlaying) {
			console.log('🔄 Retrying play after canplay event');
			attemptVideoPlay();
		}
	}

	function handleDirectVideoError(e: Event) {
		if (!videoElement) return;
		
		const error = videoElement.error;
		console.error('❌ Direct video error:', e, error);
		
		if (error?.code === MediaError.MEDIA_ERR_NETWORK && isUserSeeking) {
			console.log('⚠️ Network error during seek, ignoring...');
			isUserSeeking = false;
			return;
		}
		
		if (error?.code === MediaError.MEDIA_ERR_DECODE && isVideoLoading) {
			console.log('⚠️ Decode error during loading, ignoring...');
			return;
		}
		
		if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
			isVideoLoading = false;
			alert('Video format not supported. Please use MP4, WebM, or OGG format.');
		} else if (error?.code === MediaError.MEDIA_ERR_ABORTED) {
			console.log('ℹ️ Video loading aborted by user');
		}
	}

	function handleUserInteraction() {
		hasUserInteracted = true;
		if (pendingPlayRequest && videoElement && isPlaying) {
			console.log('👆 User interacted - attempting delayed play');
			attemptVideoPlay();
		}
	}
</script>

<div class="relative">
	<div
		bind:this={containerElement}
		role="region"
		aria-label="Video player"
		class="group relative aspect-video overflow-hidden rounded-xl bg-black"
		class:fullscreen-container={isFullscreen}
		onmouseenter={() => (showFullscreenButton = true)}
		onmouseleave={() => (showFullscreenButton = false)}
	>
		{#if !videoUrl}
			<div class="absolute inset-0 flex items-center justify-center text-white/60">
				<div class="space-y-2 text-center">
					<Video class="mx-auto h-16 w-16 opacity-30" />
					<p class="text-lg">No video loaded</p>
					<p class="text-sm">Add a video URL below to start watching together</p>
				</div>
			</div>
		{:else if videoType === 'youtube'}
			<div id="youtube-player" class="h-full w-full"></div>
		{:else}
			<div 
				class="relative h-full w-full" 
				role="button"
				tabindex="-1"
				aria-label="Video player with double-tap seek support"
				onclick={(e) => {
					handleUserInteraction();
					handleVideoClick(e);
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						handleUserInteraction();
					}
				}}
			>
				<video
					bind:this={videoElement}
					class="h-full w-full"
					controls
					preload="auto"
					onloadedmetadata={handleDirectVideoLoadedMetadata}
					onplay={handleDirectVideoPlay}
					onpause={handleDirectVideoPause}
					onseeking={handleDirectVideoSeeking}
					onseeked={handleDirectVideoSeeked}
					onwaiting={handleDirectVideoWaiting}
					oncanplay={handleDirectVideoCanPlay}
					onerror={handleDirectVideoError}
					onclick={handleUserInteraction}
				>
					<track kind="captions" />
				</video>

				<!-- Autoplay Blocked Notice -->
				{#if pendingPlayRequest && !hasUserInteracted}
					<div class="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
						<button
							onclick={handleUserInteraction}
							class="bg-primary hover:bg-primary/90 flex items-center gap-2 rounded-lg px-6 py-3 text-white transition"
						>
							<svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
								<path d="M8 5v14l11-7z"/>
							</svg>
							<span>Click to Play Video</span>
						</button>
					</div>
				{/if}

				<!-- Double Tap Seek Indicators -->
				{#if showSeekIndicator === 'backward'}
					<div class="absolute left-8 top-1/2 -translate-y-1/2 pointer-events-none z-50">
						<div class="bg-black/70 backdrop-blur-sm rounded-full p-4 animate-fade-out">
							<SkipBack class="h-12 w-12 text-white" />
							<!-- <div class="text-white text-center mt-2 font-semibold">-10s</div> -->
						</div>
					</div>
				{/if}
				
				{#if showSeekIndicator === 'forward'}
					<div class="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none z-50">
						<div class="bg-black/70 backdrop-blur-sm rounded-full p-4 animate-fade-out">
							<SkipForward class="h-12 w-12 text-white" />
							<!-- <div class="text-white text-center mt-2 font-semibold">+10s</div> -->
						</div>
					</div>
				{/if}
			</div>

			{#if isVideoLoading}
				<div class="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
					<div class="text-center text-white">
						<Loader class="mx-auto mb-2 h-12 w-12 animate-spin" />
						<p>Loading video...</p>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- External Fullscreen Button -->
	<button
		onclick={toggleFullscreen}
		class="absolute right-0 -bottom-12 z-40 rounded-lg bg-black/80 p-3 text-white backdrop-blur-sm transition-all hover:bg-black
			{isFullscreen ? 'opacity-0 hover:opacity-100' : 'opacity-100'}"
		class:fullscreen-button-hidden={isFullscreen && !showFullscreenButton}
		title="Toggle Fullscreen (or press F)"
		aria-label="Toggle Fullscreen"
	>
		{#if isFullscreen}
			<Minimize class="h-5 w-5" />
		{:else}
			<Maximize class="h-5 w-5" />
		{/if}
	</button>
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
		z-index: 9998;
		border-radius: 0;
	}

	.fullscreen-button-hidden {
		opacity: 0;
		pointer-events: none;
	}

	@keyframes fade-out {
		0% {
			opacity: 1;
			transform: scale(1);
		}
		100% {
			opacity: 0;
			transform: scale(0.8);
		}
	}

	.animate-fade-out {
		animation: fade-out 0.5s ease-out forwards;
	}
</style>
