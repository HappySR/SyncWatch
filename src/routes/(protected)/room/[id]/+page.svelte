<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { roomStore } from '$lib/stores/room.svelte';
	import { playerStore } from '$lib/stores/player.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import RoomControls from '$lib/components/RoomControls.svelte';
	import UserList from '$lib/components/UserList.svelte';
	import ChatPanel from '$lib/components/ChatPanel.svelte';
	import VideoCallContainer from '$lib/components/video-call/VideoCallContainer.svelte';
	import { Copy, Check } from 'lucide-svelte';

	let roomId = $derived($page.params.id ?? '');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let copied = $state(false);
	let isVideoFullscreen = $state(false);

	onMount(async () => {
		if (!roomId) {
			console.error('No room ID provided');
			error = 'Invalid room ID';
			loading = false;
			return;
		}

		let retryCount = 0;
		const maxRetries = 3;

		async function attemptJoinRoom() {
			try {
				console.log(`=== JOINING ROOM (Attempt ${retryCount + 1}/${maxRetries}) ===`);
				console.log('Room ID:', roomId);

				const timeoutPromise = new Promise((_, reject) => {
					setTimeout(() => reject(new Error('Connection timeout after 20 seconds')), 20000);
				});

				await Promise.race([
					roomStore.joinRoom(roomId),
					timeoutPromise
				]);

				console.log('Room joined successfully');

				await new Promise((resolve) => setTimeout(resolve, 500));

				console.log('Current room:', roomStore.currentRoom);
				console.log('Current members:', roomStore.members);
				console.log('Current user:', authStore.user?.id);

				const myMember = roomStore.members.find((m) => m.user_id === authStore.user?.id);
				console.log('My member record:', myMember);
				console.log('Has controls:', myMember?.has_controls);

				console.log('=== SYNCING PLAYER ===');
				await playerStore.syncWithRoom();
				console.log('Player synced with room');
				console.log('Player state after sync:', {
					videoUrl: playerStore.videoUrl,
					videoType: playerStore.videoType,
					currentTime: playerStore.currentTime,
					isPlaying: playerStore.isPlaying
				});

				loading = false;
			} catch (error: any) {
				console.error(`Failed to join room (Attempt ${retryCount + 1}):`, error);

				retryCount++;

				if (retryCount < maxRetries) {
					console.log(`Retrying in 2 seconds... (${retryCount}/${maxRetries})`);
					error = `Connection timeout. Retrying... (${retryCount}/${maxRetries})`;
					
					await new Promise(resolve => setTimeout(resolve, 2000));
					return attemptJoinRoom();
				} else {
					loading = false;
					error = error.message || 'Failed to join room after multiple attempts';

					setTimeout(() => {
						alert(`Failed to join room after ${maxRetries} attempts: ${error.message || 'Unknown error'}. Returning to dashboard.`);
						goto('/dashboard');
					}, 100);
				}
			}
		}

		await attemptJoinRoom();
	});

	onDestroy(() => {
		// Pause any playing video before leaving
		if (playerStore.isPlaying) {
			playerStore.pause();
		}
		
		roomStore.leaveRoom();
		playerStore.cleanup();
		
		// Note: VideoCallContainer handles its own cleanup
		// We do NOT cleanup video call here - it manages its own lifecycle
	});

	async function copyRoomId() {
		await navigator.clipboard.writeText(roomId);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function handleFullscreenChange(fullscreen: boolean) {
		isVideoFullscreen = fullscreen;
	}

	const currentMember = $derived(roomStore.members.find((m) => m.user_id === authStore.user?.id));
	const isHost = $derived(roomStore.currentRoom?.host_id === authStore.user?.id);
</script>

{#if loading}
	<div class="flex min-h-screen items-center justify-center">
		<div class="text-xl text-white">Loading room...</div>
	</div>
{:else if roomStore.currentRoom}
	<div class="mx-auto max-w-450 px-4 py-6">
		<div class="mb-6 flex items-center justify-between">
			<div>
				<h1 class="text-text-primary mb-2 text-3xl font-bold">
					{roomStore.currentRoom.name}
				</h1>
				<button
					onclick={copyRoomId}
					class="text-text-secondary hover:text-text-primary flex items-center gap-2 text-sm transition"
				>
					{#if copied}
						<Check class="h-4 w-4 text-green-400" />
						<span class="text-green-400">Copied!</span>
					{:else}
						<Copy class="h-4 w-4" />
						<span>Room ID: {roomId}</span>
					{/if}
				</button>
			</div>

			{#if !currentMember?.has_controls}
				<div class="rounded-lg bg-orange-500/20 px-4 py-2 text-sm text-orange-400">
					View Only Mode
				</div>
			{/if}
		</div>

		<div class="grid gap-6 lg:grid-cols-[1fr_400px]">
			<div class="space-y-6">
				<VideoPlayer onFullscreenChange={handleFullscreenChange} />
				<RoomControls />
			</div>

			<div class="flex flex-col gap-6" style="height: calc(100vh - 140px); min-height: 600px;">
				<UserList {isHost} />
				<div class="flex-1 overflow-hidden">
					<ChatPanel isFullscreen={isVideoFullscreen} />
				</div>
			</div>
		</div>
	</div>

	<!-- CRITICAL: Video Call Container - Always rendered, manages own lifecycle -->
	<!-- This component persists even during fullscreen and tab switches -->
	<VideoCallContainer />
{:else}
	<div class="flex min-h-screen items-center justify-center">
		<div class="text-xl text-white">Room not found</div>
	</div>
{/if}
