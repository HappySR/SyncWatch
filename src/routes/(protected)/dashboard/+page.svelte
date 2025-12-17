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

	onMount(async () => {
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
		}, 10000); // 10 second timeout

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
			.select(`
        room_id,
        rooms (*)
      `)
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
		} catch (error) {
			console.error('Failed to create room:', error);
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
		try {
			// First check if room exists
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

			// Try to join the room
			await roomStore.joinRoom(trimmedId);
			
			// Small delay to ensure state is updated
			await new Promise((resolve) => setTimeout(resolve, 300));

			joinRoomId = '';
			goto(`/room/${trimmedId}`);
		} catch (error: any) {
			console.error('Join room error:', error);
			
			// Better error messages
			let errorMessage = 'Failed to join room. ';
			if (error.message?.includes('row-level security')) {
				errorMessage += 'You may not have permission to join this room.';
			} else if (error.message) {
				errorMessage += error.message;
			} else {
				errorMessage += 'Please try again.';
			}
			
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
		loadRooms().then(() => {
			loading = false;
		}).catch((err) => {
			console.error('Retry failed:', err);
			error = 'Failed to load rooms. Please try again.';
			loading = false;
		});
	}
</script>

<div class="mx-auto max-w-7xl px-4 py-8">
	<div class="mb-8">
		<h1 class="mb-2 text-3xl sm:text-4xl font-bold text-white">
			Welcome back, {authStore.profile?.display_name || 'there'}!
		</h1>
		<p class="text-white/60 text-sm sm:text-base">Create a room or join one to start watching together</p>
	</div>

	<div class="mb-12 grid gap-4 sm:grid-cols-2">
		<button
			onclick={() => (showCreateModal = true)}
			class="bg-linear-to-br from-purple-500 to-pink-500 flex transform items-center justify-center gap-3 rounded-xl p-6 text-white transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50"
		>
			<Plus class="h-6 w-6" />
			<span class="text-lg font-semibold">Create New Room</span>
		</button>

		<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
			<div class="mb-2 text-sm text-white/80">Join with Room ID</div>
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={joinRoomId}
					placeholder="Enter room ID"
					disabled={isJoining}
					class="flex-1 rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-white placeholder-white/40 focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
					onkeydown={(e) => e.key === 'Enter' && !isJoining && joinRoom()}
				/>
				<button
					onclick={joinRoom}
					disabled={isJoining || !joinRoomId.trim()}
					class="bg-linear-to-r from-purple-500 to-pink-500 rounded-lg px-4 sm:px-6 py-2 text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm sm:text-base"
				>
					{#if isJoining}
						<Loader class="h-4 w-4 animate-spin" />
						<span class="hidden sm:inline">Joining...</span>
					{:else}
						Join
					{/if}
				</button>
			</div>
		</div>
	</div>

	<div>
		<h2 class="mb-4 flex items-center gap-2 text-xl sm:text-2xl font-bold text-white">
			<Video class="h-6 w-6" />
			My Rooms
		</h2>

		{#if loading}
			<div class="flex flex-col items-center justify-center py-12 text-white/60">
				<Loader class="h-12 w-12 animate-spin mb-4" />
				<p>Loading rooms...</p>
			</div>
		{:else if error}
			<div class="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
				<AlertCircle class="mx-auto mb-4 h-12 w-12 text-red-400" />
				<p class="mb-4 text-red-400">{error}</p>
				<button
					onclick={retryLoading}
					class="rounded-lg bg-red-500 px-6 py-2 text-white transition hover:bg-red-600"
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
				{#each rooms as room}
					<a
						href="/room/{room.id}"
						class="group rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all hover:border-purple-500/50 hover:scale-105"
					>
						<div class="mb-4 flex items-start justify-between">
							<h3 class="text-lg font-semibold text-white transition group-hover:text-purple-400 wrap-break-words">
								{room.name}
							</h3>
							{#if room.is_playing}
								<div class="rounded bg-green-500/20 px-2 py-1 text-xs text-green-400 whitespace-nowrap ml-2">Live</div>
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
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
		<div class="w-full max-w-md rounded-2xl border border-white/10 bg-slate-800 p-8">
			<h2 class="mb-4 text-2xl font-bold text-white">Create New Room</h2>

			<input
				type="text"
				bind:value={newRoomName}
				placeholder="Enter room name"
				disabled={isCreating}
				class="mb-6 w-full rounded-lg border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-white/40 focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
				onkeydown={(e) => e.key === 'Enter' && !isCreating && createRoom()}
			/>

			<div class="flex gap-3">
				<button
					onclick={() => {
						showCreateModal = false;
						newRoomName = '';
					}}
					disabled={isCreating}
					class="flex-1 rounded-lg bg-white/10 px-4 py-3 text-white transition hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Cancel
				</button>
				<button
					onclick={createRoom}
					disabled={isCreating || !newRoomName.trim()}
					class="bg-linear-to-r from-purple-500 to-pink-500 flex-1 rounded-lg px-4 py-3 text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
