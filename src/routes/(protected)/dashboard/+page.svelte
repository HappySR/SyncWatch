<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { roomStore, toastStore } from '$lib/stores/room.svelte';
	import { goto } from '$app/navigation';
	import { Plus, Video, Clock, Loader, AlertCircle, RefreshCw } from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';
	import { supabase, ensureConnection } from '$lib/supabase';
	import type { Room } from '$lib/types';
	import { page } from '$app/stores';

	let rooms = $state<Room[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let showCreateModal = $state(false);
	let newRoomName = $state('');
	let joinRoomId = $state('');
	let isJoining = $state(false);
	let isCreating = $state(false);
	let mounted = $state(false);

	onMount(async () => {
		mounted = true;

		// Show ban toast if redirected from a banned room
		if ($page.url.searchParams.get('banned') === '1') {
			toastStore.show('You have been banned from that room.', 'ban', 8000);
			history.replaceState({}, '', '/dashboard');
		}

		// Wait for auth
		let attempts = 0;
		while (authStore.loading && attempts < 50) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			attempts++;
		}

		if (!authStore.user) {
			goto('/');
			return;
		}

		// Initial load
		await loadRooms();
	});

	onDestroy(() => {
		mounted = false;
	});

	// Redirect if user logs out
	$effect(() => {
		if (!authStore.loading && !authStore.user) {
			goto('/');
		}
	});

	async function loadRooms() {
		if (!authStore.user) {
			console.warn('⚠️ No user, cannot load rooms');
			return;
		}

		loading = true;
		error = null;

		try {
			console.log('📥 Loading rooms...');

			// CRITICAL: Ensure connection is alive before querying
			const connectionOk = await ensureConnection();
			if (!connectionOk) {
				console.warn('⚠️ Connection not ready, waiting...');
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			// Load with timeout
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);

			const { data, error: fetchError } = await supabase
				.from('room_members')
				.select('room_id, rooms (*)')
				.eq('user_id', authStore.user.id)
				.abortSignal(controller.signal);

			clearTimeout(timeoutId);

			if (fetchError) {
				throw fetchError;
			}

			rooms = data
				? data
						.flatMap((d) => d.rooms)
						.filter((room): room is Room => room !== null && room !== undefined)
				: [];

			console.log('✅ Loaded', rooms.length, 'rooms');
			error = null;
		} catch (err: any) {
			console.error('❌ Load error:', err);

			if (err.name === 'AbortError') {
				error = 'Loading timed out. Click retry to try again.';
			} else {
				error = err.message || 'Failed to load rooms. Click retry to try again.';
			}
		} finally {
			loading = false;
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

		if (isJoining) return;

		isJoining = true;
		console.log('🚀 Joining room:', trimmedId);

		try {
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

			await roomStore.joinRoom(trimmedId);

			await new Promise((resolve) => setTimeout(resolve, 300));
			joinRoomId = '';
			goto(`/room/${trimmedId}`);
			} catch (err: any) {
				console.error('❌ Join error:', err);
				if (err.message?.includes('banned')) {
					toastStore.show('You have been banned from this room and cannot rejoin until the host unbans you.', 'ban', 8000);
				} else {
					alert(err.message || 'Failed to join room. Please try again.');
				}
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
			class="bg-primary flex transform items-center justify-center gap-2 rounded-xl p-4 text-white transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50 sm:gap-3 sm:p-6"
			aria-label="Create new room"
		>
			<Plus class="h-5 w-5 sm:h-6 sm:w-6" />
			<span class="text-base font-semibold sm:text-lg">Create New Room</span>
		</button>

		<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:p-6">
			<label for="join-room-input" class="mb-2 block text-sm text-white/80">
				Join with Room ID
			</label>
			<div class="flex flex-col gap-2 sm:flex-row sm:items-stretch">
				<input
					id="join-room-input"
					type="text"
					bind:value={joinRoomId}
					placeholder="Enter room ID"
					disabled={isJoining}
					class="w-full min-w-0 rounded-lg border border-white/20 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1 sm:px-4"
					onkeydown={handleJoinKeydown}
				/>
				<button
					onclick={joinRoom}
					disabled={isJoining || !joinRoomId.trim()}
					class="bg-primary flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-30"
					aria-label="Join room"
				>
					{#if isJoining}
						<Loader class="h-4 w-4 animate-spin" />
						<span>Joining...</span>
					{:else}
						<span>Join Room</span>
					{/if}
				</button>
			</div>
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
					onclick={loadRooms}
					class="inline-flex items-center gap-2 rounded-lg bg-red-500 px-6 py-2 text-white transition hover:bg-red-600"
					aria-label="Retry loading rooms"
				>
					<RefreshCw class="h-4 w-4" />
					<span>Retry</span>
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
							<h3
								class="wrap-break-words text-lg font-semibold text-white transition group-hover:text-purple-400"
							>
								{room.name}
							</h3>
							{#if room.is_playing}
								<div
									class="ml-2 rounded bg-green-500/20 px-2 py-1 text-xs whitespace-nowrap text-green-400"
								>
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
			<h2 id="create-room-title" class="mb-4 text-2xl font-bold text-white">Create New Room</h2>

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
