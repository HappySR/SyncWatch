<script lang="ts">
	import { roomStore } from '$lib/stores/room.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { supabase } from '$lib/supabase';
	import { onMount, onDestroy } from 'svelte';
	import { Send, SlidersHorizontal } from 'lucide-svelte';
	import ChatMessages from './ChatMessages.svelte';

	let { isFullscreen = false } = $props<{ isFullscreen?: boolean }>();

	interface ChatMessage {
		id: string;
		room_id: string;
		user_id: string;
		message: string;
		created_at: string;
		profiles?: {
			display_name: string;
			avatar_url: string;
		};
	}

	let messages = $state<ChatMessage[]>([]);
	let newMessage = $state('');
	let chatContainer: HTMLDivElement | undefined = $state(undefined);
	let messageInput: HTMLInputElement | undefined = $state(undefined);
	let channel: any;
	let isTyping = $state(false);
	let isSending = $state(false);
	let showOpacitySlider = $state(false);
	let recentMessages = $state<ChatMessage[]>([]);
	let messageTimers = new Map<string, ReturnType<typeof setTimeout>>();

	onMount(async () => {
		await loadMessages();
		subscribeToChat();
	});

	onDestroy(() => {
		if (channel) {
			supabase.removeChannel(channel);
		}
	});

	async function loadMessages() {
		if (!roomStore.currentRoom) return;

		const { data, error } = await supabase
			.from('chat_messages')
			.select(
				`
        *,
        profiles (
          display_name,
          avatar_url
        )
      `
			)
			.eq('room_id', roomStore.currentRoom.id)
			.order('created_at', { ascending: true })
			.limit(100);

		if (data) {
			messages = data as ChatMessage[];
		}
	}

	function subscribeToChat() {
		if (!roomStore.currentRoom) return;

		channel = supabase
			.channel(`chat:${roomStore.currentRoom.id}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'chat_messages',
					filter: `room_id=eq.${roomStore.currentRoom.id}`
				},
				async (payload) => {
					const newMsg = payload.new as ChatMessage;

					const { data: profile } = await supabase
						.from('profiles')
						.select('display_name, avatar_url')
						.eq('id', newMsg.user_id)
						.single();

					if (profile) {
						newMsg.profiles = profile;
					}

					messages = [...messages, newMsg];

					// Add to recent messages for fullscreen overlay
					recentMessages = [...recentMessages, newMsg].slice(-3);
					const msgId = newMsg.id;
					// Remove after 5 seconds
					const timer = setTimeout(() => {
						recentMessages = recentMessages.filter((m) => m.id !== msgId);
						messageTimers.delete(msgId);
					}, 5000);
					messageTimers.set(msgId, timer);
				}
			)
			.subscribe();
	}

	async function sendMessage() {
		if (!newMessage.trim() || !roomStore.currentRoom || !authStore.user || isSending) return;

		isSending = true;
		const messageToSend = newMessage.trim();
		newMessage = '';

		try {
			const { error } = await supabase.from('chat_messages').insert({
				room_id: roomStore.currentRoom.id,
				user_id: authStore.user.id,
				message: messageToSend
			});

			if (error) throw error;

			messageInput?.focus();
		} catch (error) {
			console.error('Failed to send message:', error);
			newMessage = messageToSend;
		} finally {
			isSending = false;
		}
	}

	function formatTime(timestamp: string) {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		isTyping = target.value.length > 0;
	}
</script>

<!-- Fullscreen Chat Overlay — top-right, last 3 messages, 5s TTL -->
{#if isFullscreen && settingsStore.showChatInFullscreen && recentMessages.length > 0}
	<div
		class="fixed top-4 right-4 z-50 w-80 space-y-2 transition-all duration-300 ease-in-out"
		style="opacity: {settingsStore.chatOpacityInFullscreen}"
	>
		{#each recentMessages as message (message.id)}
			{@const isOwnMessage = message.user_id === authStore.user?.id}
			<div
				class="animate-fadeIn overflow-hidden rounded-xl border border-white/20 bg-black/80 p-3 shadow-2xl backdrop-blur-md"
			>
				<div class="mb-1 flex items-center gap-2">
					<span class="text-xs font-medium text-white/90">
						{isOwnMessage ? 'You' : message.profiles?.display_name || 'Unknown'}
					</span>
					<span class="text-xs text-white/50">
						{formatTime(message.created_at)}
					</span>
				</div>
				<div class="text-sm wrap-break-word text-white/90">
					{message.message}
				</div>
			</div>
		{/each}
	</div>
{/if}

<!-- Regular Chat Panel (Non-Fullscreen) -->
{#if !isFullscreen}
	<div
		class="bg-surface border-border flex h-full min-h-125 flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm"
	>
		<!-- Chat Header -->
		<div class="border-border bg-surface-hover/30 shrink-0 border-b p-3">
			<div class="flex items-center justify-between">
				<h3 class="text-text-primary text-lg font-semibold">Chat</h3>
				<button
					onclick={() => (showOpacitySlider = !showOpacitySlider)}
					class="text-text-muted hover:text-text-primary p-1 transition"
					title="Fullscreen overlay settings"
				>
					<SlidersHorizontal class="h-4 w-4" />
				</button>
			</div>
			<p class="text-text-muted mt-1 text-xs">
				{messages.length} message{messages.length !== 1 ? 's' : ''}
			</p>
			{#if showOpacitySlider}
				<div class="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
					<div class="flex items-center justify-between">
						<label for="chat-overlay-toggle" class="text-text-muted text-xs"
							>Overlay visibility</label
						>
						<button
							id="chat-overlay-toggle"
							onclick={settingsStore.toggleChatInFullscreen}
							class="rounded px-2 py-0.5 text-xs transition {settingsStore.showChatInFullscreen
								? 'bg-primary/20 text-primary'
								: 'text-text-muted bg-white/10'}"
						>
							{settingsStore.showChatInFullscreen ? 'On' : 'Off'}
						</button>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-text-muted w-16 text-xs">Opacity</span>
						<input
							type="range"
							min="0.1"
							max="1"
							step="0.05"
							value={settingsStore.chatOpacityInFullscreen}
							oninput={(e) =>
								settingsStore.setChatOpacity(parseFloat((e.target as HTMLInputElement).value))}
							class="accent-primary flex-1"
						/>
						<span class="text-text-muted w-8 text-right text-xs">
							{Math.round(settingsStore.chatOpacityInFullscreen * 100)}%
						</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Message Input — shown on TOP for desktop, BOTTOM for mobile -->
		<div class="border-border bg-surface-hover/30 hidden shrink-0 border-b p-4 md:block">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					sendMessage();
				}}
				class="flex gap-2"
			>
				<div class="relative flex-1">
					<input
						bind:this={messageInput}
						type="text"
						bind:value={newMessage}
						oninput={handleInput}
						placeholder="Type a message..."
						disabled={isSending}
						class="bg-input border-border text-text-primary placeholder-text-muted focus:border-primary focus:ring-primary/20 w-full rounded-lg border px-4 py-2.5 text-sm transition-all focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						maxlength="500"
					/>
					{#if isTyping}
						<div class="text-text-muted absolute top-1/2 right-3 -translate-y-1/2 text-xs">
							{newMessage.length}/500
						</div>
					{/if}
				</div>
				<button
					type="submit"
					disabled={!newMessage.trim() || isSending}
					class="bg-primary hover:bg-primary/90 hover:shadow-primary/50 transform rounded-lg p-2.5 text-white shadow-lg transition-all hover:scale-105 active:scale-95 disabled:transform-none disabled:cursor-not-allowed disabled:bg-gray-500"
				>
					{#if isSending}
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
						></div>
					{:else}
						<Send class="h-5 w-5" />
					{/if}
				</button>
			</form>
			<p class="text-text-muted mt-2 text-xs">Press Enter to send</p>
		</div>

		<!-- Chat Messages - Scrollable container -->
		<div
			bind:this={chatContainer}
			class="relative flex-1 overflow-x-hidden overflow-y-auto scroll-smooth"
		>
			<ChatMessages {messages} containerRef={chatContainer} isDesktop={true} />
		</div>

		<!-- Message Input — shown on BOTTOM for mobile only -->
		<div class="border-border bg-surface-hover/30 shrink-0 border-t p-4 md:hidden">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					sendMessage();
				}}
				class="flex gap-2"
			>
				<div class="relative flex-1">
					<input
						type="text"
						bind:value={newMessage}
						oninput={handleInput}
						placeholder="Type a message..."
						disabled={isSending}
						class="bg-input border-border text-text-primary placeholder-text-muted focus:border-primary focus:ring-primary/20 w-full rounded-lg border px-4 py-2.5 text-sm transition-all focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						maxlength="500"
					/>
					{#if isTyping}
						<div class="text-text-muted absolute top-1/2 right-3 -translate-y-1/2 text-xs">
							{newMessage.length}/500
						</div>
					{/if}
				</div>
				<button
					type="submit"
					disabled={!newMessage.trim() || isSending}
					class="bg-primary hover:bg-primary/90 hover:shadow-primary/50 transform rounded-lg p-2.5 text-white shadow-lg transition-all hover:scale-105 active:scale-95 disabled:transform-none disabled:cursor-not-allowed disabled:bg-gray-500"
				>
					{#if isSending}
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
						></div>
					{:else}
						<Send class="h-5 w-5" />
					{/if}
				</button>
			</form>
			<p class="text-text-muted mt-2 text-xs">Press Enter to send</p>
		</div>
	</div>
{/if}

<style>
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fadeIn {
		animation: fadeIn 0.3s ease-out;
	}
</style>
