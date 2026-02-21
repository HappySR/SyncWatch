<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { roomStore } from '$lib/stores/room.svelte';
	import { supabase } from '$lib/supabase';
	import IncomingCallNotification from '../video-call/IncomingCallNotification.svelte';
	import {
		Phone,
		Minimize2,
		Maximize2,
		X,
		Mic,
		MicOff,
		Video,
		VideoOff,
		Monitor,
		MonitorOff,
		Users,
		Settings
	} from 'lucide-svelte';
	import AgoraRTC, {
		type IAgoraRTCClient,
		type ICameraVideoTrack,
		type IMicrophoneAudioTrack,
		type IRemoteVideoTrack,
		type IRemoteAudioTrack
	} from 'agora-rtc-sdk-ng';
	import { PUBLIC_AGORA_APP_ID } from '$env/static/public';

	interface CallInvitation {
		from: string;
		fromName: string;
		timestamp: number;
	}

	interface RemoteUser {
		uid: string;
		videoTrack?: IRemoteVideoTrack;
		audioTrack?: IRemoteAudioTrack;
		displayName?: string;
	}

	let isInCall = $state(false);
	let isMinimized = $state(false);
	let isLoading = $state(false);
	let incomingCall = $state<CallInvitation | null>(null);
	let callChannel: any;

	// Agora states
	let agoraClient: IAgoraRTCClient | null = null;
	let localVideoTrack: ICameraVideoTrack | null = null;
	let localAudioTrack: IMicrophoneAudioTrack | null = null;
	let remoteUsers = $state<Map<string, RemoteUser>>(new Map());

	// UI states - DEFAULT OFF
	let isMuted = $state(true);
	let isVideoOff = $state(true);
	let isSharingScreen = $state(false);
	let showSettings = $state(false);
	let localVideoContainer: HTMLDivElement | undefined = $state(undefined);

	// Settings
	let selectedCamera = $state<string>('');
	let selectedMicrophone = $state<string>('');
	let cameras = $state<MediaDeviceInfo[]>([]);
	let microphones = $state<MediaDeviceInfo[]>([]);

	// Expanded video states
	let expandedVideos = $state<Set<string>>(new Set());

	// Buffer for display names received before user-published fires
	let pendingDisplayNames = new Map<string, string>();

	// Visibility and lifecycle tracking - CRITICAL
	let isPageVisible = $state(true);
	let visibilityCheckInterval: any = null;
	let componentMounted = $state(false);
	let userRequestedEnd = $state(false);

	// Drag state
	let dragContainer: HTMLDivElement | undefined = $state(undefined);
	let minimizedDragContainer: HTMLButtonElement | undefined = $state(undefined);
	let isDragging = $state(false);
	let isDragReady = $state(false); // true after hold completes on mobile
	let dragOffsetX = 0;
	let dragOffsetY = 0;
	let posX = $state(-1);
	let posY = $state(-1);
	let holdTimer: any = null;
	let isMobileHolding = $state(false);
	let startCallDragEl: HTMLButtonElement | undefined = $state(undefined);
	let startCallPos = $state({ x: -1, y: -1 });
	let isStartCallHolding = $state(false);
	let didDrag = $state(false);
	let startCallHoldTimer: any = null;

	function isMobile() {
		return window.matchMedia('(pointer: coarse)').matches;
	}

	function executeDrag(element: HTMLElement, startClientX: number, startClientY: number) {
		const rect = element.getBoundingClientRect();
		dragOffsetX = startClientX - rect.left;
		dragOffsetY = startClientY - rect.top;
		isDragging = true;
		isDragReady = false;
		isMobileHolding = false;

		const onMove = (ev: MouseEvent | TouchEvent) => {
			if (!isDragging) return;
			ev.preventDefault();
			const cx = ev instanceof MouseEvent ? ev.clientX : ev.touches[0].clientX;
			const cy = ev instanceof MouseEvent ? ev.clientY : ev.touches[0].clientY;
			const newX = cx - dragOffsetX;
			const newY = cy - dragOffsetY;
			const maxX = window.innerWidth - (element?.offsetWidth ?? 320);
			const maxY = window.innerHeight - (element?.offsetHeight ?? 200);
			posX = Math.max(0, Math.min(newX, maxX));
			posY = Math.max(0, Math.min(newY, maxY));
		};

		const onUp = () => {
			isDragging = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			window.removeEventListener('touchmove', onMove);
			window.removeEventListener('touchend', onUp);
		};

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		window.addEventListener('touchmove', onMove, { passive: false });
		window.addEventListener('touchend', onUp);
	}

	function startDrag(e: MouseEvent | TouchEvent) {
		const element = dragContainer;
		if (!element) return;

		if (e instanceof MouseEvent) {
			// Desktop: drag immediately from header
			executeDrag(element, e.clientX, e.clientY);
			return;
		}

		// Mobile: require 1.5s hold
		const touch = e.touches[0];
		const startX = touch.clientX;
		const startY = touch.clientY;
		isMobileHolding = true;

		holdTimer = setTimeout(() => {
			isDragReady = true;
			isMobileHolding = false;
			// Vibrate if supported
			if (navigator.vibrate) navigator.vibrate(60);
			executeDrag(element, startX, startY);
		}, 1000);

		// Cancel hold if finger moves too much or lifts
		const cancelHold = (ev: TouchEvent) => {
			if (holdTimer) {
				clearTimeout(holdTimer);
				holdTimer = null;
			}
			isMobileHolding = false;
			element.removeEventListener('touchmove', onTouchMoveCancel);
			element.removeEventListener('touchend', cancelHold);
		};

		const onTouchMoveCancel = (ev: TouchEvent) => {
			const dx = ev.touches[0].clientX - startX;
			const dy = ev.touches[0].clientY - startY;
			if (Math.sqrt(dx * dx + dy * dy) > 10) {
				cancelHold(ev);
			}
		};

		element.addEventListener('touchmove', onTouchMoveCancel, { passive: true });
		element.addEventListener('touchend', cancelHold, { once: true });
	}

	function startMinimizedDrag(e: MouseEvent | TouchEvent) {
		const element = minimizedDragContainer;
		if (!element) return;

		if (e instanceof MouseEvent) {
			executeDrag(element, e.clientX, e.clientY);
			return;
		}

		const touch = e.touches[0];
		const startX = touch.clientX;
		const startY = touch.clientY;
		isMobileHolding = true;

		holdTimer = setTimeout(() => {
			isDragReady = true;
			isMobileHolding = false;
			if (navigator.vibrate) navigator.vibrate(60);
			executeDrag(element, startX, startY);
		}, 1000);

		const cancelHold = (ev: TouchEvent) => {
			if (holdTimer) {
				clearTimeout(holdTimer);
				holdTimer = null;
			}
			isMobileHolding = false;
			element.removeEventListener('touchmove', onTouchMoveCancel);
			element.removeEventListener('touchend', cancelHold);
		};

		const onTouchMoveCancel = (ev: TouchEvent) => {
			const dx = ev.touches[0].clientX - startX;
			const dy = ev.touches[0].clientY - startY;
			if (Math.sqrt(dx * dx + dy * dy) > 10) cancelHold(ev);
		};

		element.addEventListener('touchmove', onTouchMoveCancel, { passive: true });
		element.addEventListener('touchend', cancelHold, { once: true });
	}

	function startCallDrag(e: MouseEvent | TouchEvent) {
		const element = startCallDragEl;
		if (!element) return;
		didDrag = false;

		if (e instanceof MouseEvent) {
			executeStartCallDrag(element, e.clientX, e.clientY);
			return;
		}

		const touch = e.touches[0];
		const startX = touch.clientX;
		const startY = touch.clientY;
		isStartCallHolding = true;

		startCallHoldTimer = setTimeout(() => {
			isStartCallHolding = false;
			if (navigator.vibrate) navigator.vibrate(60);
			executeStartCallDrag(element, startX, startY);
		}, 1500);

		const cancelHold = () => {
			if (startCallHoldTimer) { clearTimeout(startCallHoldTimer); startCallHoldTimer = null; }
			isStartCallHolding = false;
			element.removeEventListener('touchmove', onTouchMoveCancel);
			element.removeEventListener('touchend', cancelHold);
		};

		const onTouchMoveCancel = (ev: TouchEvent) => {
			const dx = ev.touches[0].clientX - startX;
			const dy = ev.touches[0].clientY - startY;
			if (Math.sqrt(dx * dx + dy * dy) > 10) cancelHold();
		};

		element.addEventListener('touchmove', onTouchMoveCancel, { passive: true });
		element.addEventListener('touchend', cancelHold, { once: true });
	}

	function executeStartCallDrag(element: HTMLElement, startClientX: number, startClientY: number) {
		const rect = element.getBoundingClientRect();
		const offsetX = startClientX - rect.left;
		const offsetY = startClientY - rect.top;
		let dragging = true;

		const onMove = (ev: MouseEvent | TouchEvent) => {
			if (!dragging) return;
			ev.preventDefault();
			didDrag = true;
			const cx = ev instanceof MouseEvent ? ev.clientX : ev.touches[0].clientX;
			const cy = ev instanceof MouseEvent ? ev.clientY : ev.touches[0].clientY;
			const maxX = window.innerWidth - (element.offsetWidth ?? 160);
			const maxY = window.innerHeight - (element.offsetHeight ?? 44);
			startCallPos = {
				x: Math.max(0, Math.min(cx - offsetX, maxX)),
				y: Math.max(0, Math.min(cy - offsetY, maxY))
			};
		};

		const onUp = () => {
			dragging = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			window.removeEventListener('touchmove', onMove);
			window.removeEventListener('touchend', onUp);
			// Reset didDrag after click event fires so next tap works normally
			setTimeout(() => { didDrag = false; }, 50);
		};

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		window.addEventListener('touchmove', onMove, { passive: false });
		window.addEventListener('touchend', onUp);
	}

	const channelName = $derived(`syncwatch-${roomStore.currentRoom?.id || 'default'}`);
	const displayName = $derived(
		authStore.profile?.display_name || authStore.user?.email?.split('@')[0] || 'Guest'
	);

	onMount(async () => {
		componentMounted = true;
		console.log('📱 VideoCallContainer mounted');

		setupCallChannel();
		await loadDevices();
		setupVisibilityHandling();
	});

	onDestroy(() => {
		console.log('🔴 VideoCallContainer destroy called, userRequestedEnd:', userRequestedEnd);

		// CRITICAL: Only cleanup if user explicitly ended call or component is truly being destroyed
		// NOT on tab switch, fullscreen, or page visibility changes
		componentMounted = false;

		if (callChannel) {
			supabase.removeChannel(callChannel);
			callChannel = null;
		}

		if (visibilityCheckInterval) {
			clearInterval(visibilityCheckInterval);
			visibilityCheckInterval = null;
		}

		document.removeEventListener('visibilitychange', handleVisibilityChange);

		// Only cleanup Agora if user explicitly ended the call
		if (userRequestedEnd && isInCall) {
			console.log('🛑 User requested end - cleaning up Agora');
			cleanupAgora();
		} else if (isInCall) {
			console.log('⚠️ Component destroyed but call active - NOT cleaning up Agora');
		}
	});

	// CRITICAL FIX: Separate Agora cleanup from component cleanup
	async function cleanupAgora() {
		console.log('🧹 Cleaning up Agora resources');

		try {
			if (localAudioTrack) {
				localAudioTrack.close();
				localAudioTrack = null;
			}

			if (localVideoTrack) {
				localVideoTrack.close();
				localVideoTrack = null;
			}

			if (agoraClient) {
				await agoraClient.leave();
				agoraClient.removeAllListeners();
				agoraClient = null;
			}

			remoteUsers.clear();
			remoteUsers = new Map();
		} catch (error) {
			console.error('Error during Agora cleanup:', error);
		}
	}

	function setupVisibilityHandling() {
		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Periodic health check - keep connection alive
		visibilityCheckInterval = setInterval(() => {
			if (!isInCall || !agoraClient) return;

			const connectionState = agoraClient.connectionState;

			if (connectionState === 'DISCONNECTED' || connectionState === 'DISCONNECTING') {
				console.warn('⚠️ Agora disconnected, state:', connectionState);
			} else if (connectionState === 'CONNECTED') {
				// Connection is healthy
			}
		}, 5000);
	}

	function handleVisibilityChange() {
		isPageVisible = !document.hidden;

		if (isPageVisible && isInCall) {
			console.log('✅ Page visible - call continues');
		} else if (!isPageVisible && isInCall) {
			console.log('👁️ Page hidden - keeping call alive in background');
		}
	}

	async function loadDevices() {
		try {
			await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
			const devices = await AgoraRTC.getDevices();
			cameras = devices.filter((d) => d.kind === 'videoinput');
			microphones = devices.filter((d) => d.kind === 'audioinput');

			if (cameras.length > 0) selectedCamera = cameras[0].deviceId;
			if (microphones.length > 0) selectedMicrophone = microphones[0].deviceId;
		} catch (error) {
			console.error('Error loading devices:', error);
		}
	}

	function setupCallChannel() {
		if (!roomStore.currentRoom) return;

		callChannel = supabase
			.channel(`call:${roomStore.currentRoom.id}`)
			.on('broadcast', { event: 'call-invitation' }, (payload) => {
				handleCallInvitation(payload.payload);
			})
			.on('broadcast', { event: 'user-display-name' }, (payload) => {
				const { uid, displayName: name } = payload.payload;
				// Always store in pending so late arrivals can pick it up
				pendingDisplayNames.set(uid, name);
				const user = remoteUsers.get(uid);
				if (user) {
					user.displayName = name;
					remoteUsers.set(uid, user);
					remoteUsers = new Map(remoteUsers);
				}
			})
			.subscribe();
	}

	function handleCallInvitation(invitation: CallInvitation) {
		if (invitation.from === authStore.user?.id) return;
		if (isInCall) return;

		console.log('📞 Incoming call from:', invitation.fromName);
		incomingCall = invitation;

		setTimeout(() => {
			if (incomingCall?.timestamp === invitation.timestamp) {
				incomingCall = null;
			}
		}, 30000);
	}

	async function startCall() {
		if (callChannel) {
			await callChannel.send({
				type: 'broadcast',
				event: 'call-invitation',
				payload: {
					from: authStore.user?.id,
					fromName: displayName,
					timestamp: Date.now()
				}
			});
		}

		await new Promise((resolve) => setTimeout(resolve, 100));
		await joinCall();
	}

	async function getAgoraToken(channelName: string, uid: string): Promise<string> {
		try {
			const response = await fetch('/api/agora-token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ channelName, uid })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to get token');
			}

			const data = await response.json();
			return data.token;
		} catch (error) {
			console.error('❌ Token fetch error:', error);
			throw new Error('Failed to get authentication token. Please try again.');
		}
	}

	async function joinCall() {
		if (isInCall || isLoading) return;

		console.log('🎬 Starting video call...');
		isInCall = true;
		isLoading = true;
		incomingCall = null;
		userRequestedEnd = false; // Reset flag

		try {
			agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

			// Event handlers
			agoraClient.on('user-published', handleUserPublished);
			agoraClient.on('user-unpublished', handleUserUnpublished);
			agoraClient.on('user-left', handleUserLeft);

			// Connection state monitoring
			agoraClient.on('connection-state-change', (curState, prevState) => {
				console.log(`🔄 Connection: ${prevState} → ${curState}`);
			});

			const numericUid = Math.floor(Math.random() * 1000000);
			const token = await getAgoraToken(channelName, String(numericUid));

			console.log('🔗 Joining Agora channel:', channelName);
			const uid = await agoraClient.join(PUBLIC_AGORA_APP_ID, channelName, token, numericUid);
			console.log('✅ Joined with UID:', uid);

			[localAudioTrack, localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
				{
					microphoneId: selectedMicrophone || undefined,
					encoderConfig: 'music_standard'
				},
				{
					cameraId: selectedCamera || undefined,
					encoderConfig: '720p_2'
				}
			);

			console.log('📹 Publishing tracks...');
			await agoraClient.publish([localAudioTrack, localVideoTrack]);
			console.log('✅ Tracks published');

			// Disable by default
			await localAudioTrack.setEnabled(false);
			await localVideoTrack.setEnabled(false);
			isMuted = true;
			isVideoOff = true;

			if (localVideoContainer && localVideoTrack) {
				localVideoTrack.play(localVideoContainer);
			}

			if (callChannel) {
				await callChannel.send({
					type: 'broadcast',
					event: 'user-display-name',
					payload: {
						uid: String(uid),
						displayName: displayName
					}
				});
			}

			isLoading = false;
			console.log('🎉 Video call started successfully');
		} catch (error: any) {
			console.error('❌ Error joining call:', error);
			alert(`Failed to join call: ${error.message}. Please try again.`);
			await cleanupAgora();
			isInCall = false;
			isLoading = false;
			userRequestedEnd = true;
		}
	}

	async function handleUserPublished(user: any, mediaType: 'audio' | 'video') {
		await agoraClient?.subscribe(user, mediaType);

		const uidStr = String(user.uid);
		const remoteUser = remoteUsers.get(uidStr) || {
			uid: uidStr,
			displayName: pendingDisplayNames.get(uidStr)
		};

		if (mediaType === 'video') {
			remoteUser.videoTrack = user.videoTrack;
			setTimeout(() => {
				const container = document.getElementById(`remote-video-${user.uid}`);
				if (container && user.videoTrack) {
					user.videoTrack.play(container);
				}
			}, 100);
		}

		if (mediaType === 'audio') {
			remoteUser.audioTrack = user.audioTrack;
			user.audioTrack?.play();
		}

		remoteUsers.set(String(user.uid), remoteUser);
		remoteUsers = new Map(remoteUsers);
	}

	function handleUserUnpublished(user: any, mediaType: 'audio' | 'video') {
		const remoteUser = remoteUsers.get(String(user.uid));
		if (!remoteUser) return;

		if (mediaType === 'video') {
			remoteUser.videoTrack = undefined;
		}
		if (mediaType === 'audio') {
			remoteUser.audioTrack = undefined;
		}

		remoteUsers.set(String(user.uid), remoteUser);
		remoteUsers = new Map(remoteUsers);
	}

	function handleUserLeft(user: any) {
		remoteUsers.delete(String(user.uid));
		remoteUsers = new Map(remoteUsers);
	}

	async function toggleMute() {
		if (!localAudioTrack) return;
		isMuted = !isMuted;
		await localAudioTrack.setEnabled(!isMuted);
	}

	async function toggleVideo() {
		if (!localVideoTrack) return;
		isVideoOff = !isVideoOff;
		await localVideoTrack.setEnabled(!isVideoOff);
	}

	async function toggleScreenShare() {
		if (!agoraClient) return;

		try {
			if (!isSharingScreen) {
				const screenTrack = await AgoraRTC.createScreenVideoTrack(
					{ encoderConfig: '1080p_1' },
					'auto'
				);

				const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;

				if (localVideoTrack) {
					await agoraClient.unpublish(localVideoTrack);
					localVideoTrack.close();
				}

				await agoraClient.publish(videoTrack);

				if (localVideoContainer) {
					videoTrack.play(localVideoContainer);
				}

				videoTrack.on('track-ended', async () => {
					await stopScreenShare();
				});

				localVideoTrack = videoTrack as ICameraVideoTrack;
				isSharingScreen = true;
			} else {
				await stopScreenShare();
			}
		} catch (error) {
			console.error('Screen share error:', error);
			alert('Failed to share screen. Please try again.');
		}
	}

	async function stopScreenShare() {
		if (!agoraClient || !localVideoTrack) return;

		await agoraClient.unpublish(localVideoTrack);
		localVideoTrack.close();

		localVideoTrack = await AgoraRTC.createCameraVideoTrack({
			cameraId: selectedCamera || undefined,
			encoderConfig: '720p_2'
		});

		if (localVideoContainer) {
			localVideoTrack.play(localVideoContainer);
		}

		await agoraClient.publish(localVideoTrack);
		isSharingScreen = false;
	}

	async function changeCamera() {
		if (!localVideoTrack || !selectedCamera) return;
		await localVideoTrack.setDevice(selectedCamera);
	}

	async function changeMicrophone() {
		if (!localAudioTrack || !selectedMicrophone) return;
		await localAudioTrack.setDevice(selectedMicrophone);
	}

	function declineCall() {
		incomingCall = null;
	}

	async function endCall() {
		console.log('🛑 User clicked End Call');
		userRequestedEnd = true;
		await cleanupAgora();
		isInCall = false;
		isMinimized = false;
		isLoading = false;
		expandedVideos = new Set();
	}

	function toggleMinimize() {
		isMinimized = !isMinimized;
	}

	function toggleSettings() {
		showSettings = !showSettings;
	}

	function toggleExpandVideo(uid: string) {
		if (expandedVideos.has(uid)) {
			expandedVideos.delete(uid);
		} else {
			expandedVideos.add(uid);
		}
		expandedVideos = new Set(expandedVideos);
	}
</script>

<!-- Incoming Call Notification -->
{#if incomingCall && !isInCall}
	<IncomingCallNotification
		callerName={incomingCall.fromName}
		onJoin={joinCall}
		onDecline={declineCall}
	/>
{/if}

{#if isInCall}
	<!-- Video call overlay - FIXED BOTTOM RIGHT POSITION -->
	<div
		bind:this={dragContainer}
		class="fixed z-10000"
		style={posX >= 0
			? `left: ${posX}px; top: ${posY}px; ${isMinimized ? 'width: auto; height: auto;' : 'width: 320px; max-height: 85vh;'}`
			: isMinimized
				? 'right: 16px; bottom: 16px; width: auto; height: auto;'
				: 'right: 16px; bottom: 16px; width: 320px; max-height: 85vh;'}
	>
		<!-- Expanded Video Call Panel -->
		<div
			class="flex flex-col overflow-hidden rounded-xl border-2 border-white/20 bg-black shadow-2xl"
			style="max-height: 85vh; display: {isMinimized ? 'none' : 'flex'};"
		>
			<!-- Header -->
			<div
				role="button"
				tabindex="0"
				class="flex cursor-grab items-center justify-between border-b border-white/10 bg-black/90 px-3 py-2 select-none active:cursor-grabbing
					{isMobileHolding ? 'bg-white/10' : ''}"
				onmousedown={startDrag}
				ontouchstart={startDrag}
			>
				<span class="flex items-center gap-2 text-sm font-medium text-white">
					<Users class="h-4 w-4" />
					Video Call ({remoteUsers.size + 1})
				</span>
				<div class="flex gap-2">
					<button
						onclick={toggleSettings}
						class="rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
						title="Settings"
					>
						<Settings class="h-4 w-4" />
					</button>
					<button
						onclick={toggleMinimize}
						class="rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
						title="Minimize"
					>
						<Minimize2 class="h-4 w-4" />
					</button>
					<button
						onclick={endCall}
						class="rounded p-1 text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
						title="End call"
					>
						<X class="h-4 w-4" />
					</button>
				</div>
			</div>

			<!-- Video Grid - Scrollable -->
			<div class="overflow-y-auto bg-black p-2" style="max-height: calc(85vh - 120px);">
				<div class="space-y-2">
					<!-- Local Video -->
					<div
						class="relative overflow-hidden rounded-lg bg-gray-900 transition-all"
						class:expanded={expandedVideos.has('local')}
						style={expandedVideos.has('local') ? 'height: 400px;' : 'height: 150px;'}
					>
						<div
							bind:this={localVideoContainer}
							class="h-full w-full"
							style={isVideoOff ? 'display:none;' : ''}
						></div>
						{#if isVideoOff}
							<div class="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
								<VideoOff class="mb-2 h-10 w-10 text-white/40" />
								<span class="text-xs text-white/40">Camera Off</span>
							</div>
						{/if}
						<div class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
							You
						</div>
						<button
							onclick={() => toggleExpandVideo('local')}
							class="absolute top-2 right-2 rounded bg-black/60 p-1 text-white/80 transition hover:bg-black/80 hover:text-white"
							title={expandedVideos.has('local') ? 'Minimize' : 'Maximize'}
						>
							{#if expandedVideos.has('local')}
								<Minimize2 class="h-3 w-3" />
							{:else}
								<Maximize2 class="h-3 w-3" />
							{/if}
						</button>
					</div>

					<!-- Remote Videos -->
					{#each Array.from(remoteUsers.values()) as user (user.uid)}
						<div
							class="relative overflow-hidden rounded-lg bg-gray-900 transition-all"
							class:expanded={expandedVideos.has(user.uid)}
							style={expandedVideos.has(user.uid) ? 'height: 400px;' : 'height: 150px;'}
						>
							<div id="remote-video-{user.uid}" class="h-full w-full"></div>
							<div
								class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white"
							>
								{user.displayName || 'Connecting...'}
							</div>
							<button
								onclick={() => toggleExpandVideo(user.uid)}
								class="absolute top-2 right-2 rounded bg-black/60 p-1 text-white/80 transition hover:bg-black/80 hover:text-white"
								title={expandedVideos.has(user.uid) ? 'Minimize' : 'Maximize'}
							>
								{#if expandedVideos.has(user.uid)}
									<Minimize2 class="h-3 w-3" />
								{:else}
									<Maximize2 class="h-3 w-3" />
								{/if}
							</button>
						</div>
					{/each}
				</div>
			</div>

			<!-- Controls -->
			<div
				class="flex items-center justify-center gap-2 border-t border-white/10 bg-black/90 px-4 py-3"
			>
				<button
					onclick={toggleMute}
					class="rounded-full p-3 transition {isMuted
						? 'bg-red-500 hover:bg-red-600'
						: 'bg-white/10 hover:bg-white/20'} text-white"
					title={isMuted ? 'Unmute' : 'Mute'}
				>
					{#if isMuted}
						<MicOff class="h-5 w-5" />
					{:else}
						<Mic class="h-5 w-5" />
					{/if}
				</button>

				<button
					onclick={toggleVideo}
					class="rounded-full p-3 transition {isVideoOff
						? 'bg-red-500 hover:bg-red-600'
						: 'bg-white/10 hover:bg-white/20'} text-white"
					title={isVideoOff ? 'Turn on video' : 'Turn off video'}
				>
					{#if isVideoOff}
						<VideoOff class="h-5 w-5" />
					{:else}
						<Video class="h-5 w-5" />
					{/if}
				</button>

				<button
					onclick={toggleScreenShare}
					class="rounded-full p-3 transition {isSharingScreen
						? 'bg-primary hover:bg-primary/90'
						: 'bg-white/10 hover:bg-white/20'} text-white"
					title={isSharingScreen ? 'Stop sharing' : 'Share screen'}
				>
					{#if isSharingScreen}
						<MonitorOff class="h-5 w-5" />
					{:else}
						<Monitor class="h-5 w-5" />
					{/if}
				</button>
			</div>

			<!-- Settings Panel -->
			{#if showSettings}
				<div class="absolute inset-0 z-10 flex items-center justify-center bg-black/95 p-4">
					<div class="w-full max-w-md space-y-4 rounded-xl bg-gray-900 p-6">
						<div class="mb-4 flex items-center justify-between">
							<h3 class="font-semibold text-white">Call Settings</h3>
							<button onclick={toggleSettings} class="text-white/60 hover:text-white">
								<X class="h-5 w-5" />
							</button>
						</div>

						<div>
							<label for="camera-select" class="mb-2 block text-sm text-white">Camera</label>
							<select
								id="camera-select"
								bind:value={selectedCamera}
								onchange={changeCamera}
								class="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white"
							>
								{#each cameras as camera}
									<option value={camera.deviceId}>
										{camera.label || `Camera ${camera.deviceId.slice(0, 8)}`}
									</option>
								{/each}
							</select>
						</div>

						<div>
							<label for="mic-select" class="mb-2 block text-sm text-white">Microphone</label>
							<select
								id="mic-select"
								bind:value={selectedMicrophone}
								onchange={changeMicrophone}
								class="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white"
							>
								{#each microphones as mic}
									<option value={mic.deviceId}>
										{mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`}
									</option>
								{/each}
							</select>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Minimized Button - Transparent & Small -->
		{#if isMinimized}
			<button
				bind:this={minimizedDragContainer}
				onclick={toggleMinimize}
				onmousedown={startMinimizedDrag}
				ontouchstart={startMinimizedDrag}
				class="flex items-center gap-2 rounded-full px-3 py-2 text-white shadow-lg backdrop-blur-sm transition-all select-none active:scale-95
					{isMobileHolding
					? 'scale-110 bg-green-400 ring-2 ring-white/50'
					: 'bg-green-500/80 hover:scale-105 hover:bg-green-500'}"
				title="Hold to drag · Tap to expand ({remoteUsers.size + 1} participant{remoteUsers.size !==
				0
					? 's'
					: ''})"
			>
				<Users class="h-4 w-4" />
				<span class="text-sm font-medium">{remoteUsers.size + 1}</span>
				{#if isMobileHolding}
					<span class="text-xs text-white/70">Hold…</span>
				{/if}
			</button>
		{/if}
	</div>
{:else}
	<!-- Start Call Button - FIXED BOTTOM RIGHT, hold-to-drag -->
	<button
		bind:this={startCallDragEl}
		onclick={() => { if (!didDrag) startCall(); }}
		onmousedown={startCallDrag}
		ontouchstart={startCallDrag}
		disabled={isLoading}
		class="fixed z-9999 flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium text-white shadow-lg transition select-none
			{isLoading ? 'cursor-not-allowed bg-gray-500' : 'bg-green-500 hover:bg-green-600 hover:shadow-green-500/50'}
			{isStartCallHolding ? 'scale-110 ring-2 ring-white/50' : ''}"
		style={startCallPos.x >= 0
			? `left: ${startCallPos.x}px; top: ${startCallPos.y}px;`
			: 'right: 16px; bottom: 16px;'}
	>
		{#if isLoading}
			<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
			<span>Starting...</span>
		{:else}
			<Phone class="h-4 w-4" />
			<span>Start Video Call</span>
			{#if isStartCallHolding}
				<span class="text-xs text-white/70">Hold…</span>
			{/if}
		{/if}
	</button>
{/if}

<style>
	.expanded {
		height: 400px !important;
	}
</style>
