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
				<div class="bg-linear-to-br from-purple-500 to-pink-500 rounded-2xl p-4 shadow-2xl shadow-purple-500/50 animate-pulse-slow">
					<Play class="h-12 w-12 md:h-16 md:w-16 text-white" fill="white" />
				</div>
			</div>

			<h1 class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight">
				Watch
				<span class="bg-linear-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-gradient">
					Together
				</span>
			</h1>

			<p class="mx-auto max-w-2xl text-base sm:text-lg md:text-xl lg:text-2xl text-white/70 px-4">
				Experience movies and shows with friends in perfect sync. Zero latency, infinite fun.
			</p>
		</div>

		<!-- CTA Button - Centered and Prominent -->
		<div class="flex justify-center py-8">
			<button
				onclick={handleGoogleSignIn}
				disabled={isSigningIn}
				class="group relative flex items-center gap-3 rounded-xl bg-white px-6 py-4 sm:px-8 sm:py-5 text-base sm:text-lg font-semibold text-gray-900 shadow-2xl transition-all hover:scale-105 hover:bg-gray-100 hover:shadow-purple-500/50 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100 w-full sm:w-auto max-w-sm"
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

		<p class="text-xs sm:text-sm text-white/40">Free forever • No credit card required</p>

		<!-- Features -->
		<div class="grid gap-4 sm:gap-6 py-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6 backdrop-blur-sm hover:border-purple-500/30 transition-all hover:scale-105">
				<Wifi class="mx-auto mb-3 sm:mb-4 h-10 w-10 sm:h-12 sm:w-12 text-purple-400" />
				<h3 class="mb-2 text-base sm:text-lg font-semibold text-white">Zero Latency Sync</h3>
				<p class="text-xs sm:text-sm text-white/60">
					Real-time synchronization keeps everyone perfectly in sync
				</p>
			</div>

			<div class="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6 backdrop-blur-sm hover:border-pink-500/30 transition-all hover:scale-105">
				<Users class="mx-auto mb-3 sm:mb-4 h-10 w-10 sm:h-12 sm:w-12 text-pink-400" />
				<h3 class="mb-2 text-base sm:text-lg font-semibold text-white">Watch With Friends</h3>
				<p class="text-xs sm:text-sm text-white/60">Create rooms and invite anyone to watch together</p>
			</div>

			<div class="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6 backdrop-blur-sm hover:border-blue-500/30 transition-all hover:scale-105 sm:col-span-2 md:col-span-1">
				<Sparkles class="mx-auto mb-3 sm:mb-4 h-10 w-10 sm:h-12 sm:w-12 text-blue-400" />
				<h3 class="mb-2 text-base sm:text-lg font-semibold text-white">Universal Support</h3>
				<p class="text-xs sm:text-sm text-white/60">YouTube, direct links, and more - all in one place</p>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes gradient {
		0%, 100% { background-position: 0% 50%; }
		50% { background-position: 100% 50%; }
	}
	
	.animate-gradient {
		background-size: 200% auto;
		animation: gradient 3s linear infinite;
	}
	
	@keyframes pulse-slow {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.8; }
	}
	
	.animate-pulse-slow {
		animation: pulse-slow 2s ease-in-out infinite;
	}
</style>
