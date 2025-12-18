<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';

	interface ChatMessage {
		id: string;
		user_id: string;
		message: string;
		created_at: string;
		profiles?: {
			display_name: string;
			avatar_url: string;
		};
	}

	let { messages, containerRef } = $props<{
		messages: ChatMessage[];
		containerRef?: HTMLDivElement;
	}>();

	let showScrollButton = $state(false);
	let isUserScrolling = $state(false);
	let scrollTimeout: any;

	function formatTime(timestamp: string) {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	function scrollToBottom(smooth = true) {
		if (containerRef) {
			containerRef.scrollTo({
				top: containerRef.scrollHeight,
				behavior: smooth ? 'smooth' : 'auto'
			});
			showScrollButton = false;
		}
	}

	function handleScroll() {
		if (!containerRef) return;

		const { scrollTop, scrollHeight, clientHeight } = containerRef;
		const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

		// Show button if user scrolled up more than 100px from bottom
		showScrollButton = distanceFromBottom > 100;

		// User is manually scrolling
		isUserScrolling = true;
		clearTimeout(scrollTimeout);
		scrollTimeout = setTimeout(() => {
			isUserScrolling = false;
		}, 1000);
	}

	// Auto-scroll when new messages arrive (only if user is near bottom)
	$effect(() => {
		if (messages.length > 0 && containerRef && !isUserScrolling) {
			const { scrollTop, scrollHeight, clientHeight } = containerRef;
			const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

			// Auto-scroll if user is within 150px of bottom
			if (distanceFromBottom < 150) {
				setTimeout(() => scrollToBottom(true), 50);
			}
		}
	});

	onMount(() => {
		if (containerRef) {
			containerRef.addEventListener('scroll', handleScroll);
			// Initial scroll to bottom
			setTimeout(() => scrollToBottom(false), 100);
		}

		return () => {
			if (containerRef) {
				containerRef.removeEventListener('scroll', handleScroll);
			}
			clearTimeout(scrollTimeout);
		};
	});
</script>

<div class="relative flex-1">
	<div bind:this={containerRef} class="h-full flex-1 space-y-3 overflow-y-auto scroll-smooth p-4">
		{#if messages.length === 0}
			<div class="text-text-muted py-8 text-center text-sm">
				<svg
					class="mx-auto mb-3 h-12 w-12 opacity-30"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
					/>
				</svg>
				<p>No messages yet.</p>
				<p class="mt-1 text-xs">Start the conversation!</p>
			</div>
		{:else}
			{#each messages as message (message.id)}
				{@const isOwnMessage = message.user_id === authStore.user?.id}
				<div
					class="animate-in slide-in-from-bottom-4 flex gap-2 duration-300"
					class:flex-row-reverse={isOwnMessage}
				>
					<div class="shrink-0">
						{#if message.profiles?.avatar_url}
							<img
								src={message.profiles.avatar_url}
								alt={message.profiles.display_name}
								class="ring-border h-8 w-8 rounded-full ring-2"
							/>
						{:else}
							<div
								class="bg-primary ring-border flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ring-2"
							>
								{(message.profiles?.display_name?.[0] || '?').toUpperCase()}
							</div>
						{/if}
					</div>

					<div class="max-w-[70%] flex-1">
						<div class="mb-1 flex items-center gap-2" class:flex-row-reverse={isOwnMessage}>
							<span class="text-text-secondary text-xs font-medium">
								{isOwnMessage ? 'You' : message.profiles?.display_name || 'Unknown'}
							</span>
							<span class="text-text-muted text-xs">
								{formatTime(message.created_at)}
							</span>
						</div>
						<div
							class="wrap-break-words rounded-lg px-3 py-2 text-sm transition-all hover:shadow-md {isOwnMessage
								? 'bg-primary rounded-br-none text-white'
								: 'bg-surface-hover text-text-primary rounded-bl-none'}"
						>
							{message.message}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Scroll to Bottom Button -->
	{#if showScrollButton}
		<button
			onclick={() => scrollToBottom(true)}
			class="bg-primary absolute right-4 bottom-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-black shadow-2xl transition-all hover:scale-110 hover:shadow-purple-500/50 active:scale-95"
			title="Scroll to bottom"
			aria-label="Scroll to bottom"
		>
			<ChevronDown class="h-5 w-5" />
		</button>
	{/if}
</div>

<style>
	@keyframes slide-in-from-bottom {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-in {
		animation: slide-in-from-bottom 0.3s ease-out;
	}

	/* Custom scrollbar */
	div::-webkit-scrollbar {
		width: 6px;
	}

	div::-webkit-scrollbar-track {
		background: transparent;
	}

	div::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}

	div::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.2);
	}
</style>
