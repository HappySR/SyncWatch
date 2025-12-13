<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';

  onMount(async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Auth error:', error);
      goto('/?error=auth_failed');
      return;
    }

    if (session) {
      // Successful authentication
      goto('/dashboard');
    } else {
      // No session found
      goto('/');
    }
  });
</script>

<div class="min-h-screen flex items-center justify-center">
  <div class="text-center space-y-4">
    <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-purple-500"></div>
    <p class="text-white text-lg">Completing sign in...</p>
  </div>
</div>
