<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { roomStore } from '$lib/stores/room.svelte';
	import { goto } from '$app/navigation';
	import { Plus, Video, Clock, Loader, AlertCircle } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import type { Room } from '$lib/types';

	let rooms = $state<Room[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let showCreateModal = $state(false);
	let newRoomName = $state('');
	let joinRoomId = $state('');
	let isJoining = $state(false);
	let isCreating = $state(false);
	let loadingTimeout: any;

	// Force refresh tracking
	const DASHBOARD_VISITED_KEY = 'dashboard_visited_at';
	const FORCE_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

	onMount(async () => {
		// Force refresh logic
		const lastVisit = sessionStorage.getItem(DASHBOARD_VISITED_KEY);
		const now = Date.now();

		if (lastVisit) {
			const timeSinceLastVisit = now - parseInt(lastVisit, 10);
			if (timeSinceLastVisit > FORCE_REFRESH_INTERVAL) {
				console.log('🔄 Force refreshing dashboard (last visit was', timeSinceLastVisit / 1000, 'seconds ago)');
				sessionStorage.setItem(DASHBOARD_VISITED_KEY, now.toString());
				window.location.reload();
				return;
			}
		} else {
			// First visit in this session
			sessionStorage.setItem(DASHBOARD_VISITED_KEY, now.toString());
		}

		// Check authentication
		if (!authStore.user) {
			goto('/');
			return;
		}

		// Set timeout for loading state
		loadingTimeout = setTimeout(() => {
			if (loading) {
				error = 'Loading is taking longer than expected. Please refresh the page.';
				loading = false;
			}
		}, 10000);

		try {
			await loadRooms();
		} catch (err) {
			console.error('Error loading rooms:', err);
			error = 'Failed to load rooms. Please refresh the page.';
		} finally {
			clearTimeout(loadingTimeout);
			loading = false;
		}
	});

	// Redirect if user logs out
	$effect(() => {
		if (!authStore.loading && !authStore.user) {
			goto('/');
		}
	});

	async function loadRooms() {
		if (!authStore.user) return;

		const { data, error: fetchError } = await supabase
			.from('room_members')
			.select('room_id, rooms (*)')
			.eq('user_id', authStore.user.id)
			.throwOnError();

		if (fetchError) throw fetchError;

		if (data) {
			rooms = data
				.flatMap((d) => d.rooms)
				.filter((room): room is Room => room !== null && room !== undefined);
		}
	}

	async function createRoom() {
		if (!newRoomName.trim() || isCreating) return;

		isCreating = true;
		try {
			const roomId = await roomStore.createRoom(newRoomName);
			showCreateModal = false;
			newRoomName = '';
			goto(`/room/${roomId}`);
		} catch (err: any) {
			console.error('Failed to create room:', err);
			alert('Failed to create room. Please try again.');
		} finally {
			isCreating = false;
		}
	}

	async function joinRoom() {
		const trimmedId = joinRoomId.trim();

		if (!trimmedId) {
			alert('Please enter a room ID');
			return;
		}

		if (isJoining) {
			console.log('Join already in progress');
			return;
		}

		isJoining = true;
		console.log('🚀 Joining room:', trimmedId);

		try {
			// Check if room exists
			const { data: room, error: roomError } = await supabase
				.from('rooms')
				.select('id, name, is_public')
				.eq('id', trimmedId)
				.single();

			if (roomError || !room) {
				alert('Room not found. Please check the room ID and try again.');
				return;
			}

			if (!room.is_public) {
				alert('This room is private and cannot be joined directly.');
				return;
			}

			// Join with timeout
			const joinPromise = roomStore.joinRoom(trimmedId);
			const timeoutPromise = new Promise((_, reject) => 
				setTimeout(() => reject(new Error('Join timeout')), 20000)
			);

			await Promise.race([joinPromise, timeoutPromise]);

			// Navigate after small delay
			await new Promise((resolve) => setTimeout(resolve, 300));
			joinRoomId = '';
			goto(`/room/${trimmedId}`);
		} catch (err: any) {
			console.error('❌ Join error:', err);

			const errorMessage = err.message?.includes('timeout')
				? 'Connection timed out. Please check your internet and try again.'
				: err.message?.includes('row-level security')
				? 'You may not have permission to join this room.'
				: 'Failed to join room. Please try again.';

			alert(errorMessage);
		} finally {
			isJoining = false;
		}
	}

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function retryLoading() {
		error = null;
		loading = true;
		loadRooms()
			.catch((err) => {
				console.error('Retry failed:', err);
				error = 'Failed to load rooms. Please try again.';
			})
			.finally(() => {
				loading = false;
			});
	}

	function handleCreateKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !isCreating) createRoom();
	}

	function handleJoinKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !isJoining) joinRoom();
	}
</script>

<div class="mx-auto max-w-7xl px-4 py-8">
	<div class="mb-8">
		<h1 class="mb-2 text-3xl font-bold text-white sm:text-4xl">
			Welcome back, {authStore.profile?.display_name || 'there'}!
		</h1>
		<p class="text-sm text-white/60 sm:text-base">
			Create a room or join one to start watching together
		</p>
	</div>

	<div class="mb-12 grid gap-4 sm:grid-cols-2">
		<button
			onclick={() => (showCreateModal = true)}
			class="bg-primary flex transform items-center justify-center gap-3 rounded-xl p-6 text-white transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50"
			aria-label="Create new room"
		>
			<Plus class="h-6 w-6" />
			<span class="text-lg font-semibold">Create New Room</span>
		</button>

		<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
			<label for="join-room-input" class="mb-2 block text-sm text-white/80">
				Join with Room ID
			</label>
			<div class="flex gap-2">
				<input
					id="join-room-input"
					type="text"
					bind:value={joinRoomId}
					placeholder="Enter room ID"
					disabled={isJoining}
					class="flex-1 rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
					onkeydown={handleJoinKeydown}
				/>
				<button
					onclick={joinRoom}
					disabled={isJoining || !joinRoomId.trim()}
					class="bg-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6 sm:text-base"
					aria-label="Join room"
				>
					{#if isJoining}
						<Loader class="h-4 w-4 animate-spin" />
						<span class="hidden sm:inline">Joining...</span>
					{:else}
						Join
					{/if}
				</button>
			</div>
			{#if isJoining}
				<div class="mt-2 text-xs text-yellow-400">
					Connecting to room... This may take up to 20 seconds.
				</div>
			{/if}
		</div>
	</div>

	<div>
		<h2 class="mb-4 flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
			<Video class="h-6 w-6" />
			My Rooms
		</h2>

		{#if loading}
			<div class="flex flex-col items-center justify-center py-12 text-white/60">
				<Loader class="mb-4 h-12 w-12 animate-spin" />
				<p>Loading rooms...</p>
			</div>
		{:else if error}
			<div class="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
				<AlertCircle class="mx-auto mb-4 h-12 w-12 text-red-400" />
				<p class="mb-4 text-red-400">{error}</p>
				<button
					onclick={retryLoading}
					class="rounded-lg bg-red-500 px-6 py-2 text-white transition hover:bg-red-600"
					aria-label="Retry loading rooms"
				>
					Retry
				</button>
			</div>
		{:else if rooms.length === 0}
			<div class="rounded-xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur-sm">
				<Video class="mx-auto mb-4 h-16 w-16 text-white/20" />
				<p class="mb-4 text-white/60">No rooms yet. Create one to get started!</p>
			</div>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each rooms as room (room.id)}
					<a
						href="/room/{room.id}"
						class="group rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all hover:scale-105 hover:border-purple-500/50"
						aria-label="Join room {room.name}"
					>
						<div class="mb-4 flex items-start justify-between">
							<h3 class="wrap-break-words text-lg font-semibold text-white transition group-hover:text-purple-400">
								{room.name}
							</h3>
							{#if room.is_playing}
								<div class="ml-2 whitespace-nowrap rounded bg-green-500/20 px-2 py-1 text-xs text-green-400">
									Live
								</div>
							{/if}
						</div>

						<div class="space-y-2 text-sm text-white/60">
							<div class="flex items-center gap-2">
								<Clock class="h-4 w-4 shrink-0" />
								<span>Created {formatDate(room.created_at)}</span>
							</div>
							{#if room.current_video_url}
								<div class="flex items-center gap-2">
									<Video class="h-4 w-4 shrink-0" />
									<span class="truncate">Video loaded</span>
								</div>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>

{#if showCreateModal}
	<div 
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
		onclick={(e) => {
			if (e.target === e.currentTarget && !isCreating) {
				showCreateModal = false;
				newRoomName = '';
			}
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape' && !isCreating) {
				showCreateModal = false;
				newRoomName = '';
			}
		}}
		role="dialog"
		aria-modal="true"
		aria-labelledby="create-room-title"
		tabindex="-1"
	>
		<div class="w-full max-w-md rounded-2xl border border-white/10 bg-slate-800 p-8">
			<h2 id="create-room-title" class="mb-4 text-2xl font-bold text-white">
				Create New Room
			</h2>

			<label for="room-name-input" class="sr-only">Room name</label>
			<input
				id="room-name-input"
				type="text"
				bind:value={newRoomName}
				placeholder="Enter room name"
				disabled={isCreating}
				class="mb-6 w-full rounded-lg border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-white/40 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				onkeydown={handleCreateKeydown}
			/>

			<div class="flex gap-3">
				<button
					onclick={() => {
						showCreateModal = false;
						newRoomName = '';
					}}
					disabled={isCreating}
					class="flex-1 rounded-lg bg-white/10 px-4 py-3 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onclick={createRoom}
					disabled={isCreating || !newRoomName.trim()}
					class="bg-primary flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isCreating}
						<Loader class="h-4 w-4 animate-spin" />
						Creating...
					{:else}
						Create Room
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
