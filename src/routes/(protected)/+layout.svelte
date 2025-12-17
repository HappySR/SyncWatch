<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const { children } = $props();

	onMount(() => {
		// Check auth on mount
		if (!authStore.loading && !authStore.user) {
			goto('/');
		}
	});

	// Reactive check
	$effect(() => {
		if (!authStore.loading && !authStore.user) {
			goto('/');
		}
	});
</script>

{#if authStore.loading}
	<div class="flex min-h-screen items-center justify-center">
		<div class="text-xl text-white">Loading...</div>
	</div>
{:else if authStore.user}
	{@render children()}
{:else}
	<div class="flex min-h-screen items-center justify-center">
		<div class="text-xl text-white">Redirecting...</div>
	</div>
{/if}
