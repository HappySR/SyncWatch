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
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-white text-xl">Loading...</div>
  </div>
{:else if authStore.user}
  {@render children()}
{:else}
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-white text-xl">Redirecting...</div>
  </div>
{/if}
