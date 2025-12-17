<script lang="ts">
	import { roomStore } from '$lib/stores/room.svelte';
	import { Users, Crown, Eye, Video } from 'lucide-svelte';

	let { isHost } = $props<{ isHost: boolean }>();

	async function toggleControls(memberId: string, currentState: boolean) {
		await roomStore.toggleMemberControls(memberId, !currentState);
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
						class="rounded px-3 py-1 text-xs transition
              {member.has_controls
							? 'bg-green-500/20 text-green-400'
							: 'bg-orange-500/20 text-orange-400'}"
					>
						{member.has_controls ? 'Revoke' : 'Grant'}
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
</div>
