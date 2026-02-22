<script lang="ts">
	import { roomStore } from '$lib/stores/room.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { Ban, LogOut } from 'lucide-svelte';

	let isLeaving = $state(false);

	async function leaveRoom() {
		if (!authStore.user || !roomStore.currentRoom || isLeaving) return;
		isLeaving = true;

		const roomId = roomStore.currentRoom.id;

		try {
			// We don't delete the room_members row — banned users stay in the banned list
			// so the host can see them and unban later.
			// Just clean up local state and navigate away.
			roomStore.leaveRoom();
			goto('/dashboard');
		} catch {
			isLeaving = false;
		}
	}
</script>

<!-- Full-screen overlay blocking the entire room UI -->
{#if roomStore.isBanned}
	<div
		class="fixed inset-0 z-9999 flex items-center justify-center bg-black/90 backdrop-blur-sm"
		role="alert"
		aria-live="assertive"
	>
		<div class="mx-4 w-full max-w-md rounded-2xl border border-red-500/40 bg-zinc-900 p-8 text-center shadow-2xl shadow-red-500/20">
			<!-- Icon -->
			<div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 ring-4 ring-red-500/20">
				<Ban class="h-10 w-10 text-red-400" />
			</div>

			<!-- Heading -->
			<h2 class="mb-2 text-2xl font-bold text-white">You've Been Banned</h2>
			<p class="mb-1 text-base text-red-400/80">
				You have been banned from
				<span class="font-semibold text-red-400">"{roomStore.currentRoom?.name || 'this room'}"</span>.
			</p>
			<p class="mb-8 text-sm text-zinc-400">
				You cannot interact with the room. Contact the host if you believe this was a mistake.
				You will be automatically restored if the host unbans you.
			</p>

			<!-- Leave button -->
			<button
				onclick={leaveRoom}
				disabled={isLeaving}
				class="flex w-full items-center justify-center gap-3 rounded-xl bg-red-500 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{#if isLeaving}
					<div class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
					<span>Leaving...</span>
				{:else}
					<LogOut class="h-5 w-5" />
					<span>Leave Room</span>
				{/if}
			</button>
		</div>
	</div>
{/if}
