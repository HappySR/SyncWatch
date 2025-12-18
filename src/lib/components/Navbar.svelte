<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { signOut } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { LogOut, Video, Settings } from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';

	let showMenu = $state(false);
	let menuRef: HTMLDivElement | undefined = $state(undefined);
	let buttonRef: HTMLButtonElement | undefined = $state(undefined);
	let isSigningOut = $state(false);

	function handleClickOutside(event: MouseEvent) {
		if (
			menuRef &&
			buttonRef &&
			!menuRef.contains(event.target as Node) &&
			!buttonRef.contains(event.target as Node)
		) {
			showMenu = false;
		}
	}

	function toggleMenu(event: MouseEvent) {
		event.stopPropagation();
		showMenu = !showMenu;
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		document.removeEventListener('click', handleClickOutside);
	});

	async function handleSignOut() {
		if (isSigningOut) return;

		isSigningOut = true;
		try {
			await signOut();
			goto('/');
		} catch (error) {
			console.error('Sign out error:', error);
			isSigningOut = false;
		}
	}
</script>

<nav class="border-b border-white/10 bg-black/30 backdrop-blur-md">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 items-center justify-between">
			<div class="flex items-center gap-8">
				<a href="/dashboard" class="flex items-center gap-2">
					<img src="/SyncWatch-nobg1.png" alt="SyncWatch" class="h-8 w-auto" />
				</a>
			</div>

			<div class="relative">
				<button
					bind:this={buttonRef}
					onclick={toggleMenu}
					class="flex items-center gap-3 focus:outline-none"
				>
					{#if authStore.profile?.avatar_url}
						<img src={authStore.profile.avatar_url} alt="Avatar" class="h-8 w-8 rounded-full" />
					{:else}
						<div
							class="bg-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
						>
							{(
								authStore.profile?.display_name?.[0] ||
								authStore.profile?.email?.[0] ||
								'?'
							).toUpperCase()}
						</div>
					{/if}

					<span class="hidden text-sm text-white/70 md:block">
						{authStore.profile?.display_name || authStore.profile?.email}
					</span>

					<!-- Dropdown arrow -->
					<svg
						class="h-4 w-4 text-white/70 transition-transform {showMenu ? 'rotate-180' : ''}"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</button>

				{#if showMenu}
					<div
						bind:this={menuRef}
						class="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border border-white/10 bg-black/90 shadow-lg backdrop-blur"
					>
						<a
							href="/settings"
							class="flex items-center gap-2 px-4 py-3 text-white/70 transition hover:bg-white/5 hover:text-white"
							onclick={() => (showMenu = false)}
						>
							<Settings class="h-4 w-4" />
							Settings
						</a>

						<button
							onclick={() => {
								handleSignOut();
								showMenu = false;
							}}
							class="flex w-full items-center gap-2 px-4 py-3 text-left text-white/70 transition hover:bg-white/5 hover:text-white"
						>
							<LogOut class="h-4 w-4" />
							Sign Out
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</nav>
