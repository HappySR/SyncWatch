<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';

	onMount(async () => {
		const {
			data: { session },
			error
		} = await supabase.auth.getSession();

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

<div class="flex min-h-screen items-center justify-center">
	<div class="space-y-4 text-center">
		<div
			class="inline-block h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-purple-500"
		></div>
		<p class="text-lg text-white">Completing sign in...</p>
	</div>
</div>
