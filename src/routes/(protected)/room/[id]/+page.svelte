<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { roomStore, toastStore } from '$lib/stores/room.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { playerStore } from '$lib/stores/player.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import RoomControls from '$lib/components/RoomControls.svelte';
	import UserList from '$lib/components/UserList.svelte';
	import ChatPanel from '$lib/components/ChatPanel.svelte';
	import VideoCallContainer from '$lib/components/video-call/VideoCallContainer.svelte';
	import { Copy, Check } from 'lucide-svelte';
	import BanOverlay from '$lib/components/BanOverlay.svelte';

	let roomId = $derived($page.params.id ?? '');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let copied = $state(false);
	let isVideoFullscreen = $state(false);
	let mounted = $state(false);
	let isFullscreen = $state(false);
	let recentChatMessages = $state<any[]>([]);
	let chatMessagesForOverlay = $derived([...recentChatMessages]);

	onMount(async () => {
		mounted = true;

		// CRITICAL: Wait for auth
		while (authStore.loading) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (!authStore.user) {
			goto('/');
			return;
		}

		if (!roomId) {
			console.error('No room ID provided');
			error = 'Invalid room ID';
			loading = false;
			return;
		}

		await attemptJoinRoom();
	});

	onDestroy(() => {
		mounted = false;
		console.log('🔴 Room page destroy');

		// Pause any playing video before leaving
		if (playerStore.isPlaying) {
			playerStore.pause();
		}

		roomStore.leaveRoom();
		playerStore.cleanup();
	});

	async function attemptJoinRoom() {
		loading = true;
		error = null;

		try {
			console.log('=== JOINING ROOM ===');
			console.log('Room ID:', roomId);

			// Join room with timeout
			const joinPromise = roomStore.joinRoom(roomId);
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('Connection timeout')), 20000);
			});

			await Promise.race([joinPromise, timeoutPromise]);

			console.log('✅ Room joined successfully');

			// Small delay for state to settle
			await new Promise((resolve) => setTimeout(resolve, 500));

			console.log('Current room:', roomStore.currentRoom);
			console.log('Current members:', roomStore.members);

			// Sync player — reset debounce state so a fresh join always syncs
			console.log('=== SYNCING PLAYER ===');
			playerStore.resetSyncState();
			await playerStore.syncWithRoom();
			console.log('✅ Player synced');

			loading = false;
		} catch (err: any) {
			console.error('❌ Failed to join room:', err);
			loading = false;

			const errorMsg = err.message || 'Failed to join room';

			// Use toast for ban errors, alert for others
			if (errorMsg.includes('banned')) {
				toastStore.show(errorMsg, 'ban', 8000);
				goto('/dashboard');
				return;
			} else {
				alert(`${errorMsg}. Returning to dashboard.`);
				goto('/dashboard');
			}
		}
	}

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

<BanOverlay />

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

		<div class="grid gap-6 lg:grid-cols-[1fr_400px] lg:items-start">
			<div class="space-y-6">
				<VideoPlayer
					onFullscreenChange={(fs) => { isFullscreen = fs; }}
					recentMessages={chatMessagesForOverlay}
					showChatOverlay={settingsStore.showChatInFullscreen}
					chatOverlayOpacity={settingsStore.chatOpacityInFullscreen}
					currentUserId={authStore.user?.id ?? ''}
				/>
				<RoomControls />
			</div>

			<div class="flex flex-col gap-4 lg:sticky lg:top-6" style="max-height: calc(100vh - 6rem);">
				<UserList {isHost} />
				<ChatPanel
					{isFullscreen}
					onRecentMessages={(msgs) => { recentChatMessages = msgs; }}
				/>
			</div>
		</div>
	</div>

	<VideoCallContainer />
{:else}
	<div class="flex min-h-screen items-center justify-center">
		<div class="text-xl text-white">
			{error || 'Room not found'}
		</div>
	</div>
{/if}
