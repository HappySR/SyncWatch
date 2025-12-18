<script lang="ts">
	import { roomStore } from '$lib/stores/room.svelte';
	import { goto } from '$app/navigation';
	import { Video, Users, Lock, Globe, Loader } from 'lucide-svelte';

	let roomName = $state('');
	let isPublic = $state(true);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function handleCreateRoom() {
		if (!roomName.trim()) {
			error = 'Please enter a room name';
			return;
		}

		if (loading) return;

		loading = true;
		error = null;

		try {
			const roomId = await roomStore.createRoom(roomName.trim());
			console.log('Room created with ID:', roomId);

			// Small delay to ensure database writes complete
			await new Promise((resolve) => setTimeout(resolve, 500));

			goto(`/room/${roomId}`);
		} catch (err: any) {
			console.error('Create room error:', err);
			error = err.message || 'Failed to create room. Please try again.';
			loading = false;
		}
	}
</script>

<div class="mx-auto max-w-2xl px-4 py-8 sm:py-12">
	<div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:p-8">
		<div class="mb-8 text-center">
			<div
				class="bg-primary mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl shadow-2xl shadow-purple-500/50"
			>
				<Video class="h-8 w-8 text-white" />
			</div>
			<h1 class="mb-2 text-2xl font-bold text-white sm:text-3xl">Create a Room</h1>
			<p class="text-sm text-white/60 sm:text-base">Set up your watch party and invite friends</p>
		</div>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleCreateRoom();
			}}
			class="space-y-6"
		>
			<div>
				<label for="roomName" class="mb-2 block text-sm font-medium text-white/80">
					Room Name
				</label>
				<input
					id="roomName"
					type="text"
					bind:value={roomName}
					placeholder="e.g., Movie Night with Friends"
					disabled={loading}
					class="w-full rounded-lg border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-white/40 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				/>
			</div>

			<fieldset disabled={loading}>
				<legend class="mb-3 block text-sm font-medium text-white/80"> Privacy </legend>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<button
						type="button"
						onclick={() => (isPublic = true)}
						class="rounded-lg border-2 p-4 text-left transition
              {isPublic ? 'border-purple-500 bg-purple-500/10' : 'border-white/20 bg-white/5'}
              disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Globe class="mb-2 h-5 w-5 {isPublic ? 'text-purple-400' : 'text-white/60'}" />
						<div class="mb-1 text-sm font-medium text-white">Public</div>
						<div class="text-xs text-white/60">Anyone can join with room ID</div>
					</button>

					<button
						type="button"
						onclick={() => (isPublic = false)}
						class="rounded-lg border-2 p-4 text-left transition
              {!isPublic ? 'border-purple-500 bg-purple-500/10' : 'border-white/20 bg-white/5'}
              disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Lock class="mb-2 h-5 w-5 {!isPublic ? 'text-purple-400' : 'text-white/60'}" />
						<div class="mb-1 text-sm font-medium text-white">Private</div>
						<div class="text-xs text-white/60">Invite only (coming soon)</div>
					</button>
				</div>
			</fieldset>

			{#if error}
				<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
					{error}
				</div>
			{/if}

			<div class="flex flex-col gap-3 pt-4 sm:flex-row">
				<button
					type="button"
					onclick={() => goto('/dashboard')}
					disabled={loading}
					class="flex-1 rounded-lg bg-white/10 px-6 py-3 font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={loading || !roomName.trim()}
					class="bg-primary flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if loading}
						<Loader class="h-5 w-5 animate-spin" />
						<span>Creating...</span>
					{:else}
						Create Room
					{/if}
				</button>
			</div>
		</form>

		<div class="mt-8 border-t border-white/10 pt-6">
			<div class="flex gap-3 text-sm text-white/60">
				<Users class="h-5 w-5 shrink-0" />
				<div>
					<p class="mb-1 font-medium text-white/80">What happens next?</p>
					<ul class="space-y-1 text-xs">
						<li>• You'll be the host of this room</li>
						<li>• Share the room ID with friends to invite them</li>
						<li>• You can control who has video controls</li>
						<li>• Load any YouTube, direct link, or Google Drive video</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</div>
