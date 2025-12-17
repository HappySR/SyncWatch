import { goto } from '$app/navigation';
import { authStore } from '$lib/stores/auth.svelte';
// import { get } from 'svelte/store';

export function requireAuth() {
	// Wait for auth to initialize
	if (authStore.loading) {
		return new Promise<void>((resolve) => {
			const checkInterval = setInterval(() => {
				if (!authStore.loading) {
					clearInterval(checkInterval);
					if (!authStore.user) {
						goto('/');
					}
					resolve();
				}
			}, 100);
		});
	}

	if (!authStore.user) {
		goto('/');
		throw new Error('Not authenticated');
	}
}
