<script lang="ts">
	import { roomStore } from '$lib/stores/room.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import {
		Users, Crown, Eye, Video, LogOut,
		Ban, UserCheck, ShieldCheck, ShieldOff
	} from 'lucide-svelte';

	let { isHost } = $props<{ isHost: boolean }>();
	let isLeaving = $state(false);
	let togglingMemberIds = $state<Set<string>>(new Set());
	let banningMemberIds = $state<Set<string>>(new Set());
	let isBulkGranting = $state(false);
	let isBulkRevoking = $state(false);
	let activeTab = $state<'members' | 'banned'>('members');

	const activeMembers = $derived(roomStore.members.filter((m) => !m.is_banned));
	const bannedMembers = $derived(roomStore.members.filter((m) => m.is_banned));

	async function toggleControls(memberId: string, currentState: boolean) {
		if (togglingMemberIds.has(memberId)) return;
		togglingMemberIds.add(memberId);
		togglingMemberIds = new Set(togglingMemberIds);
		try {
			await roomStore.toggleMemberControls(memberId, !currentState);
		} catch {
			alert('Failed to update controls. Please try again.');
		} finally {
			togglingMemberIds.delete(memberId);
			togglingMemberIds = new Set(togglingMemberIds);
		}
	}

	async function banMember(memberId: string) {
		if (banningMemberIds.has(memberId)) return;
		banningMemberIds.add(memberId);
		banningMemberIds = new Set(banningMemberIds);
		try {
			await roomStore.banMember(memberId);
		} catch {
			alert('Failed to ban member. Please try again.');
		} finally {
			banningMemberIds.delete(memberId);
			banningMemberIds = new Set(banningMemberIds);
		}
	}

	async function unbanMember(memberId: string) {
		if (banningMemberIds.has(memberId)) return;
		banningMemberIds.add(memberId);
		banningMemberIds = new Set(banningMemberIds);
		try {
			await roomStore.unbanMember(memberId);
		} catch {
			alert('Failed to unban member. Please try again.');
		} finally {
			banningMemberIds.delete(memberId);
			banningMemberIds = new Set(banningMemberIds);
		}
	}

	async function grantAll() {
		if (isBulkGranting || isBulkRevoking) return;
		isBulkGranting = true;
		try {
			await roomStore.grantControlsToAll();
		} catch {
			alert('Failed to grant controls to all. Please try again.');
		} finally {
			isBulkGranting = false;
		}
	}

	async function revokeAll() {
		if (isBulkGranting || isBulkRevoking) return;
		isBulkRevoking = true;
		try {
			await roomStore.revokeControlsFromAll();
		} catch {
			alert('Failed to revoke controls from all. Please try again.');
		} finally {
			isBulkRevoking = false;
		}
	}

	async function leaveRoom() {
		if (!authStore.user || !roomStore.currentRoom || isLeaving) return;
		isLeaving = true;
		const roomId = roomStore.currentRoom.id;
		try {
			const me = roomStore.members.find((m) => m.user_id === authStore.user!.id);

			if (!me?.is_banned) {
				await supabase
					.from('room_members')
					.delete()
					.eq('room_id', roomId)
					.eq('user_id', authStore.user.id);

				const { count } = await supabase
					.from('room_members')
					.select('id', { count: 'exact', head: true })
					.eq('room_id', roomId);

				if (count === 0) {
					await supabase.from('rooms').delete().eq('id', roomId);
				}
			}

			roomStore.leaveRoom();
			goto('/dashboard');
		} catch {
			isLeaving = false;
		}
	}
</script>

<div class="bg-surface border-border rounded-xl border p-6 backdrop-blur-sm">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-text-primary flex items-center gap-2 text-lg font-semibold">
			<Users class="h-5 w-5" />
			Members
		</h3>
	</div>

	{#if isHost}
		<!-- Tabs -->
		<div class="border-border mb-3 flex gap-1 rounded-lg border p-1">
			<button
				onclick={() => (activeTab = 'members')}
				class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition
					{activeTab === 'members' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}"
			>
				Members ({activeMembers.length})
			</button>
			<button
				onclick={() => (activeTab = 'banned')}
				class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition
					{activeTab === 'banned' ? 'bg-red-500 text-white' : 'text-text-secondary hover:text-text-primary'}"
			>
				Banned ({bannedMembers.length})
			</button>
		</div>

		<!-- Grant All / Revoke All — only on members tab -->
		{#if activeTab === 'members'}
			<div class="mb-3 flex gap-2">
				<button
					onclick={grantAll}
					disabled={isBulkGranting || isBulkRevoking}
					class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-500/15 px-3 py-2 text-xs font-medium text-green-400 transition hover:bg-green-500/25 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isBulkGranting}
						<div class="h-3 w-3 animate-spin rounded-full border border-green-400 border-t-transparent"></div>
					{:else}
						<ShieldCheck class="h-3.5 w-3.5" />
					{/if}
					Grant All
				</button>
				<button
					onclick={revokeAll}
					disabled={isBulkGranting || isBulkRevoking}
					class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500/15 px-3 py-2 text-xs font-medium text-orange-400 transition hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isBulkRevoking}
						<div class="h-3 w-3 animate-spin rounded-full border border-orange-400 border-t-transparent"></div>
					{:else}
						<ShieldOff class="h-3.5 w-3.5" />
					{/if}
					Revoke All
				</button>
			</div>
		{/if}
	{/if}

	<!-- Members tab -->
	{#if activeTab === 'members'}
		<div class="space-y-2">
			{#each activeMembers as member (member.id)}
				{@const isRoomHost = member.user_id === roomStore.currentRoom?.host_id}
				{@const isOnline = member.is_online === true}
				<div class="bg-surface-hover flex items-center justify-between rounded-lg p-3 {!isOnline ? 'opacity-50' : ''}">
					<div class="flex items-center gap-3">
						<div class="relative">
							{#if member.profiles?.avatar_url}
								<img src={member.profiles.avatar_url} alt={member.profiles.display_name || 'User'} class="h-8 w-8 rounded-full" />
							{:else}
								<div class="bg-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white">
									{(member.profiles?.display_name?.[0] || member.profiles?.email?.[0] || '?').toUpperCase()}
								</div>
							{/if}
							<div class="border-surface absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 {isOnline ? 'bg-green-500' : 'bg-gray-500'}"></div>
						</div>
						<div>
							<div class="text-text-primary flex items-center gap-2 text-sm font-medium">
								{member.profiles?.display_name || member.profiles?.email || 'Unknown'}
								{#if isRoomHost}<Crown class="h-3 w-3 text-yellow-400" />{/if}
								{#if !isOnline}<span class="text-xs text-gray-500">(Offline)</span>{/if}
							</div>
							<div class="text-text-muted text-xs">
								{#if member.has_controls}
									<span class="flex items-center gap-1"><Video class="h-3 w-3" />Can control</span>
								{:else}
									<span class="flex items-center gap-1"><Eye class="h-3 w-3" />View only</span>
								{/if}
							</div>
						</div>
					</div>

					{#if isHost && !isRoomHost}
						<div class="flex items-center gap-1">
							<button
								onclick={() => toggleControls(member.id, member.has_controls)}
								disabled={togglingMemberIds.has(member.id)}
								class="rounded px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50
									{member.has_controls ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'}"
							>
								{#if togglingMemberIds.has(member.id)}
									<div class="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"></div>
								{:else}
									{member.has_controls ? 'Revoke' : 'Grant'}
								{/if}
							</button>
							<button
								onclick={() => banMember(member.id)}
								disabled={banningMemberIds.has(member.id)}
								title="Ban member"
								class="rounded p-1 text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{#if banningMemberIds.has(member.id)}
									<div class="h-3 w-3 animate-spin rounded-full border border-red-400 border-t-transparent"></div>
								{:else}
									<Ban class="h-3.5 w-3.5" />
								{/if}
							</button>
						</div>
					{/if}
				</div>
			{/each}
			{#if activeMembers.length === 0}
				<p class="text-text-muted py-4 text-center text-sm">No members</p>
			{/if}
		</div>
	{/if}

	<!-- Banned tab -->
	{#if activeTab === 'banned'}
		<div class="space-y-2">
			{#each bannedMembers as member (member.id)}
				<div class="bg-surface-hover flex items-center justify-between rounded-lg p-3 opacity-60">
					<div class="flex items-center gap-3">
						<div class="relative">
							{#if member.profiles?.avatar_url}
								<img src={member.profiles.avatar_url} alt={member.profiles.display_name || 'User'} class="h-8 w-8 rounded-full grayscale" />
							{:else}
								<div class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-600 text-sm font-bold text-white">
									{(member.profiles?.display_name?.[0] || member.profiles?.email?.[0] || '?').toUpperCase()}
								</div>
							{/if}
							<div class="border-surface absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 bg-red-500"></div>
						</div>
						<div>
							<div class="text-text-primary flex items-center gap-2 text-sm font-medium">
								{member.profiles?.display_name || member.profiles?.email || 'Unknown'}
								<Ban class="h-3 w-3 text-red-400" />
							</div>
							<div class="text-xs text-red-400/70">Banned</div>
						</div>
					</div>
					<button
						onclick={() => unbanMember(member.id)}
						disabled={banningMemberIds.has(member.id)}
						class="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-400 transition hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if banningMemberIds.has(member.id)}
							<div class="h-3 w-3 animate-spin rounded-full border border-green-400 border-t-transparent"></div>
						{:else}
							<UserCheck class="h-3.5 w-3.5" />
							Unban
						{/if}
					</button>
				</div>
			{/each}
			{#if bannedMembers.length === 0}
				<p class="text-text-muted py-4 text-center text-sm">No banned members</p>
			{/if}
		</div>
	{/if}

	<div class="border-border mt-4 border-t pt-4">
		<button
			onclick={leaveRoom}
			disabled={isLeaving}
			class="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isLeaving}
				<div class="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent"></div>
				<span>Leaving...</span>
			{:else}
				<LogOut class="h-4 w-4" />
				<span>Leave Room</span>
			{/if}
		</button>
	</div>
</div>
