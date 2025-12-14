<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import { signOut } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { LogOut, Video, Settings } from 'lucide-svelte';
  import { onMount, onDestroy } from 'svelte';

  let showMenu = false;
  let menuRef: HTMLDivElement | undefined;

  function handleClickOutside(event: MouseEvent) {
    if (!menuRef?.contains(event.target as Node)) {
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
      </div>

      <div class="relative">
        <button
          onclick={toggleMenu}
          class="flex items-center gap-3 focus:outline-none"
        >
          {#if authStore.profile?.avatar_url}
            <img
              src={authStore.profile.avatar_url}
              alt="Avatar"
              class="w-8 h-8 rounded-full"
            />
          {:else}
            <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
              {(authStore.profile?.display_name?.[0] || authStore.profile?.email?.[0] || '?').toUpperCase()}
            </div>
          {/if}

          <span class="hidden md:block text-white/70 text-sm">
            {authStore.profile?.display_name || authStore.profile?.email}
          </span>
        </button>

        {#if showMenu}
          <div
            class="absolute right-0 mt-2 w-40 bg-black/80 backdrop-blur border border-white/10 rounded-lg shadow-lg z-50"
          >
            <a
              href="/settings"
              class="flex items-center gap-2 px-4 py-2 text-white/70 hover:text-white"
            >
              <Settings class="w-4 h-4" />
              Settings
            </a>

            <button
              onclick={handleSignOut}
              class="w-full flex items-center gap-2 px-4 py-2 text-white/70 hover:text-white"
            >
              <LogOut class="w-4 h-4" />
              Sign Out
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</nav>
