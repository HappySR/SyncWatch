<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { toastStore } from '$lib/stores/room.svelte';
	import { signOut } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { LogOut, Settings, ShieldOff, ShieldCheck, Ban, Info } from 'lucide-svelte';
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

	const toastIcons: Record<string, any> = {
		ban: Ban,
		unban: ShieldCheck,
		revoke: ShieldOff,
		grant: ShieldCheck,
		info: Info
	};

	const toastColors: Record<string, string> = {
		ban: 'border-red-500/50 bg-red-950/90 text-red-200',
		unban: 'border-green-500/50 bg-green-950/90 text-green-200',
		revoke: 'border-orange-500/50 bg-orange-950/90 text-orange-200',
		grant: 'border-green-500/50 bg-green-950/90 text-green-200',
		info: 'border-white/20 bg-black/90 text-white/80'
	};

	const toastIconColors: Record<string, string> = {
		ban: 'text-red-400',
		unban: 'text-green-400',
		revoke: 'text-orange-400',
		grant: 'text-green-400',
		info: 'text-white/60'
	};
</script>

<!-- Toast Notifications — fixed top-right, above everything -->
<div class="fixed top-4 right-4 z-9999 flex flex-col gap-2 pointer-events-none">
	{#each toastStore.toasts as toast (toast.id)}
		{@const Icon = toastIcons[toast.type] ?? Info}
		{@const colorClass = toastColors[toast.type] ?? toastColors.info}
		{@const iconColor = toastIconColors[toast.type] ?? toastIconColors.info}
		<div
			class="pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md max-w-sm animate-in slide-in-from-right-4 fade-in duration-300 {colorClass}"
		>
			<Icon class="mt-0.5 h-4 w-4 shrink-0 {iconColor}" />
			<p class="flex-1 text-sm leading-snug">{toast.message}</p>
			<button
				onclick={() => toastStore.dismiss(toast.id)}
				class="shrink-0 opacity-50 hover:opacity-100 transition text-current text-lg leading-none"
			>
				×
			</button>
		</div>
	{/each}
</div>

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
						
						<a href="/settings"
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
