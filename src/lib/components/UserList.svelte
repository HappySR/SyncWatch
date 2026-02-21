<script lang="ts">
	import { roomStore } from '$lib/stores/room.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { Users, Crown, Eye, Video, LogOut } from 'lucide-svelte';

	let { isHost } = $props<{ isHost: boolean }>();
	let isLeaving = $state(false);
	let togglingMemberIds = $state<Set<string>>(new Set());

	async function toggleControls(memberId: string, currentState: boolean) {
		if (togglingMemberIds.has(memberId)) return;

		// Optimistic update — flip immediately in UI
		const member = roomStore.members.find((m) => m.id === memberId);
		if (member) {
			member.has_controls = !currentState;
			roomStore.members = [...roomStore.members];
		}

		togglingMemberIds.add(memberId);
		togglingMemberIds = new Set(togglingMemberIds);

		try {
			await roomStore.toggleMemberControls(memberId, !currentState);
		} catch (err) {
			// Revert on failure
			if (member) {
				member.has_controls = currentState;
				roomStore.members = [...roomStore.members];
			}
			console.error('Failed to toggle controls:', err);
		} finally {
			togglingMemberIds.delete(memberId);
			togglingMemberIds = new Set(togglingMemberIds);
		}
	}

	async function leaveRoom() {
		if (!authStore.user || !roomStore.currentRoom || isLeaving) return;
		isLeaving = true;
		const roomId = roomStore.currentRoom.id;
		try {
			// Delete this member first
			await supabase
				.from('room_members')
				.delete()
				.eq('room_id', roomId)
				.eq('user_id', authStore.user.id);

			// Check if any members remain
			const { count } = await supabase
				.from('room_members')
				.select('id', { count: 'exact', head: true })
				.eq('room_id', roomId);

			// If no members left, delete the entire room (cascades to messages too)
			if (count === 0) {
				await supabase.from('rooms').delete().eq('id', roomId);
			}

			roomStore.leaveRoom();
			goto('/dashboard');
		} catch (err) {
			console.error('Failed to leave room:', err);
			isLeaving = false;
		}
	}
</script>

<div class="bg-surface border-border rounded-xl border p-6 backdrop-blur-sm">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-text-primary flex items-center gap-2 text-lg font-semibold">
			<Users class="h-5 w-5" />
			Room Members ({roomStore.members.length})
		</h3>
	</div>

	<div class="space-y-2">
		{#each roomStore.members as member}
			{@const isRoomHost = member.user_id === roomStore.currentRoom?.host_id}
			{@const isOnline = member.is_online !== false}
			<div
				class="bg-surface-hover flex items-center justify-between rounded-lg p-3 {!isOnline
					? 'opacity-50'
					: ''}"
			>
				<div class="flex items-center gap-3">
					<div class="relative">
						{#if member.profiles?.avatar_url}
							<img
								src={member.profiles.avatar_url}
								alt={member.profiles.display_name || 'User'}
								class="h-8 w-8 rounded-full"
							/>
						{:else}
							<div
								class="bg-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
							>
								{(
									member.profiles?.display_name?.[0] ||
									member.profiles?.email?.[0] ||
									'?'
								).toUpperCase()}
							</div>
						{/if}

						<!-- Online status indicator -->
						{#if isOnline}
							<div
								class="border-surface absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 bg-green-500"
							></div>
						{:else}
							<div
								class="border-surface absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 bg-gray-500"
							></div>
						{/if}
					</div>

					<div>
						<div class="text-text-primary flex items-center gap-2 text-sm font-medium">
							{member.profiles?.display_name || member.profiles?.email || 'Unknown'}
							{#if isRoomHost}
								<Crown class="h-3 w-3 text-yellow-400" />
							{/if}
							<!-- Online/Offline badge -->
							{#if !isOnline}
								<span class="text-xs text-gray-500">(Offline)</span>
							{/if}
						</div>
						<div class="text-text-muted text-xs">
							{#if member.has_controls}
								<span class="flex items-center gap-1">
									<Video class="h-3 w-3" />
									Can control
								</span>
							{:else}
								<span class="flex items-center gap-1">
									<Eye class="h-3 w-3" />
									View only
								</span>
							{/if}
						</div>
					</div>
				</div>

				{#if isHost && !isRoomHost}
					<button
						onclick={() => toggleControls(member.id, member.has_controls)}
						disabled={togglingMemberIds.has(member.id)}
						class="rounded px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50
							{member.has_controls
							? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
							: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'}"
					>
						{#if togglingMemberIds.has(member.id)}
							<div
								class="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
							></div>
						{:else}
							{member.has_controls ? 'Revoke' : 'Grant'}
						{/if}
					</button>
				{/if}
			</div>
		{/each}
	</div>

	{#if isHost}
		<div class="border-border mt-4 border-t pt-4">
			<p class="text-text-muted text-xs">
				As the host, you can grant or revoke video controls for other members.
			</p>
		</div>
	{/if}

	<div class="border-border mt-4 border-t pt-4">
		<button
			onclick={leaveRoom}
			disabled={isLeaving}
			class="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isLeaving}
				<div
					class="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent"
				></div>
				<span>Leaving...</span>
			{:else}
				<LogOut class="h-4 w-4" />
				<span>Leave Room</span>
			{/if}
		</button>
	</div>
</div>
