<script lang="ts">
  import '../app.css';
  import { authStore } from '$lib/stores/auth.svelte';
  import Navbar from '$lib/components/Navbar.svelte';

  const { children } = $props();
</script>

<svelte:head>
  <title>SyncWatch - Watch Together</title>
</svelte:head>

<div class="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900">
  {#if !authStore.loading}
    {#if authStore.user}
      <Navbar />
    {/if}
    <main>
      {@render children()}
    </main>
  {:else}
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-white text-xl">Loading...</div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }
</style>
