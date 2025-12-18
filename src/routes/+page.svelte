<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { signInWithGoogle } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { Play, Users, Wifi, Sparkles, Loader, Video, Zap, Shield } from 'lucide-svelte';

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

<div class="relative min-h-screen overflow-hidden bg-black">
	<!-- Background pattern overlay -->
	<div class="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_80%_50%_at_50%_0%,#000,transparent)]"></div>

	<div class="relative flex min-h-screen flex-col">
		<!-- Header -->
		<header class="px-4 py-6 sm:px-6 lg:px-8">
			<div class="mx-auto flex max-w-7xl items-center justify-between">
				<div class="flex items-center gap-3">
					<img
						src="/SyncWatch-nobg1.png"
						alt="SyncWatch"
						class="h-10 w-auto drop-shadow-lg sm:h-12"
					/>
				</div>
				<button
					onclick={handleGoogleSignIn}
					disabled={isSigningIn}
					class="rounded-full border border-white/20 bg-white/5 px-6 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/10 disabled:opacity-50 sm:block"
				>
					Sign In
				</button>
			</div>
		</header>

		<!-- Hero Section -->
		<main class="flex flex-1 items-center px-4 py-12 sm:px-6 lg:px-8">
			<div class="mx-auto w-full max-w-7xl">
				<div class="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
					<!-- Left column - Content -->
					<div class="space-y-8 text-center lg:text-left">
						<!-- Logo for mobile -->
						<div class="flex justify-center lg:hidden">
							<img
								src="/SyncWatch-nobg1.png"
								alt="SyncWatch"
								class="h-20 w-auto drop-shadow-2xl sm:h-24"
							/>
						</div>

						<div class="space-y-4">
							<h1 class="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl">
								Watch Together,
								<span class="text-primary">
									Stay Synced
								</span>
							</h1>
							<p class="mx-auto max-w-2xl text-lg text-white/70 sm:text-xl lg:mx-0">
								Experience movies and shows with friends in perfect harmony. Real-time sync, video calls, and instant chat—all in one place.
							</p>
						</div>

						<!-- CTA Button -->
						<div class="flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
							<button
								onclick={handleGoogleSignIn}
								disabled={isSigningIn}
								class="group relative flex items-center justify-center gap-3 rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-white shadow-2xl shadow-primary/50 transition-all hover:scale-105 hover:bg-primary/90 hover:shadow-primary/80 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
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
									<span>Get Started Free</span>
								{/if}
							</button>
						</div>

						<div class="flex items-center justify-center gap-6 text-sm text-white/50 lg:justify-start">
							<div class="flex items-center gap-2">
								<Shield class="h-4 w-4" />
								<span>Free Forever</span>
							</div>
							<div class="flex items-center gap-2">
								<Zap class="h-4 w-4" />
								<span>No Credit Card</span>
							</div>
						</div>
					</div>

					<!-- Right column - Feature Cards -->
					<div class="grid gap-4 sm:grid-cols-2 lg:gap-6">
						<div class="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface p-6 backdrop-blur-sm transition-all hover:scale-105 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20">
							<div class="absolute inset-0 bg-primary/5 opacity-0 transition-opacity group-hover:opacity-100"></div>
							<div class="relative space-y-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
									<Wifi class="h-6 w-6 text-primary" />
								</div>
								<h3 class="text-xl font-semibold text-white">Perfect Sync</h3>
								<p class="text-sm text-white/60">
									Real-time synchronization keeps everyone watching at the exact same moment
								</p>
							</div>
						</div>

						<div class="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface p-6 backdrop-blur-sm transition-all hover:scale-105 hover:border-secondary/50 hover:shadow-xl hover:shadow-secondary/20">
							<div class="absolute inset-0 bg-secondary/5 opacity-0 transition-opacity group-hover:opacity-100"></div>
							<div class="relative space-y-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
									<Users class="h-6 w-6 text-primary" />
								</div>
								<h3 class="text-xl font-semibold text-white">Video Calls</h3>
								<p class="text-sm text-white/60">
									See your friends' reactions in real-time with built-in video chat
								</p>
							</div>
						</div>

						<div class="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface p-6 backdrop-blur-sm transition-all hover:scale-105 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20">
							<div class="absolute inset-0 bg-primary/5 opacity-0 transition-opacity group-hover:opacity-100"></div>
							<div class="relative space-y-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
									<Video class="h-6 w-6 text-primary" />
								</div>
								<h3 class="text-xl font-semibold text-white">Any Platform</h3>
								<p class="text-sm text-white/60">
									YouTube, direct links, and more—watch from anywhere
								</p>
							</div>
						</div>

						<div class="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface p-6 backdrop-blur-sm transition-all hover:scale-105 hover:border-secondary/50 hover:shadow-xl hover:shadow-secondary/20">
							<div class="absolute inset-0 bg-secondary/5 opacity-0 transition-opacity group-hover:opacity-100"></div>
							<div class="relative space-y-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
									<Sparkles class="h-6 w-6 text-primary" />
								</div>
								<h3 class="text-xl font-semibold text-white">Live Chat</h3>
								<p class="text-sm text-white/60">
									Share reactions and jokes with instant messaging
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</main>

		<!-- Footer -->
		<footer class="px-4 py-6 text-center text-sm text-white/40 sm:px-6 lg:px-8">
			<p>© 2024 SyncWatch. Watch together, wherever you are.</p>
		</footer>
	</div>
</div>
