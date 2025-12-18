<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { signInWithGoogle } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { Play, Users, Wifi, Sparkles, Loader } from 'lucide-svelte';

	let isSigningIn = $state(false);

	$effect(() => {
		if (authStore.user) {
			goto('/dashboard');
		}
	});

	async function handleGoogleSignIn() {
		if (isSigningIn) return;

		isSigningIn = true;
		try {
			await signInWithGoogle();
		} catch (error) {
			console.error('Sign in error:', error);
			alert('Failed to sign in. Please try again.');
			isSigningIn = false;
		}
	}
</script>

<div class="flex min-h-screen flex-col items-center justify-center px-4 py-8">
	<div class="w-full max-w-4xl space-y-8 text-center">
		<!-- Hero Section -->
		<div class="space-y-6">
			<div class="flex justify-center">
				<img
					src="/SyncWatch-nobg1.png"
					alt="SyncWatch"
					class="animate-pulse-slow h-24 w-auto drop-shadow-2xl md:h-32"
				/>
			</div>

			<p class="mx-auto max-w-2xl px-4 text-base text-white/70 sm:text-lg md:text-xl lg:text-2xl">
				Experience movies and shows with friends in perfect sync. Zero latency, infinite fun.
			</p>
		</div>

		<!-- CTA Button - Centered and Prominent -->
		<div class="flex justify-center py-8">
			<button
				onclick={handleGoogleSignIn}
				disabled={isSigningIn}
				class="group relative flex w-full max-w-sm items-center gap-3 rounded-xl bg-white px-6 py-4 text-base font-semibold text-gray-900 shadow-2xl transition-all hover:scale-105 hover:bg-gray-100 hover:shadow-purple-500/50 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 sm:w-auto sm:px-8 sm:py-5 sm:text-lg"
			>
				{#if isSigningIn}
					<Loader class="h-6 w-6 animate-spin" />
					<span>Signing in...</span>
				{:else}
					<svg class="h-6 w-6 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
						<path
							fill="#4285F4"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="#34A853"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						/>
						<path
							fill="#FBBC05"
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						/>
						<path
							fill="#EA4335"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						/>
					</svg>
					<span>Continue with Google</span>
				{/if}
			</button>
		</div>

		<p class="text-xs text-white/40 sm:text-sm">Free forever • No credit card required</p>

		<!-- Features -->
		<div class="grid grid-cols-1 gap-4 py-8 sm:grid-cols-2 sm:gap-6 md:grid-cols-3">
			<div
				class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:scale-105 hover:border-purple-500/30 sm:p-6"
			>
				<Wifi class="mx-auto mb-3 h-10 w-10 text-purple-400 sm:mb-4 sm:h-12 sm:w-12" />
				<h3 class="mb-2 text-base font-semibold text-white sm:text-lg">Zero Latency Sync</h3>
				<p class="text-xs text-white/60 sm:text-sm">
					Real-time synchronization keeps everyone perfectly in sync
				</p>
			</div>

			<div
				class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:scale-105 hover:border-pink-500/30 sm:p-6"
			>
				<Users class="mx-auto mb-3 h-10 w-10 text-pink-400 sm:mb-4 sm:h-12 sm:w-12" />
				<h3 class="mb-2 text-base font-semibold text-white sm:text-lg">Watch With Friends</h3>
				<p class="text-xs text-white/60 sm:text-sm">
					Create rooms and invite anyone to watch together
				</p>
			</div>

			<div
				class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:scale-105 hover:border-blue-500/30 sm:col-span-2 sm:p-6 md:col-span-1"
			>
				<Sparkles class="mx-auto mb-3 h-10 w-10 text-blue-400 sm:mb-4 sm:h-12 sm:w-12" />
				<h3 class="mb-2 text-base font-semibold text-white sm:text-lg">Universal Support</h3>
				<p class="text-xs text-white/60 sm:text-sm">
					YouTube, direct links, and more - all in one place
				</p>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes gradient {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}

	@keyframes pulse-slow {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.8;
		}
	}

	.animate-pulse-slow {
		animation: pulse-slow 3s ease-in-out infinite;
	}
</style>
