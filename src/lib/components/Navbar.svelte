<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import { signOut } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { LogOut, Home, Video } from 'lucide-svelte';

  async function handleSignOut() {
    await signOut();
    goto('/');
  }
</script>

<nav class="bg-black/30 backdrop-blur-md border-b border-white/10">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <div class="flex items-center gap-8">
        <a href="/dashboard" class="flex items-center gap-2 text-white font-bold text-xl">
          <Video class="w-6 h-6" />
          SyncWatch
        </a>
        
        <div class="hidden md:flex gap-4">
          <a href="/dashboard" class="text-white/70 hover:text-white transition flex items-center gap-2">
            <Home class="w-4 h-4" />
            Dashboard
          </a>
        </div>
      </div>

      <div class="flex items-center gap-4">
        {#if authStore.profile}
          <div class="text-white/70 text-sm hidden md:block">
            {authStore.profile.display_name || authStore.profile.email}
          </div>
          {#if authStore.profile.avatar_url}
            <img src={authStore.profile.avatar_url} alt="Avatar" class="w-8 h-8 rounded-full" />
          {/if}
        {/if}
        
        <button 
          onclick={handleSignOut}
          class="flex items-center gap-2 px-4 py-2 text-white/70 hover:text-white transition"
        >
          <LogOut class="w-4 h-4" />
          <span class="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </div>
  </div>
</nav>
