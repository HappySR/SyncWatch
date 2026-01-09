<script lang="ts">
	import { roomStore } from '$lib/stores/room.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { supabase } from '$lib/supabase';
	import { onMount, onDestroy } from 'svelte';
	import { Send } from 'lucide-svelte';
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

<!-- Fullscreen Chat Overlay -->
{#if isFullscreen && settingsStore.showChatInFullscreen && messages.length > 0}
	<div
		class="fixed bottom-4 left-4 z-50 max-h-96 w-96 transition-all duration-300 ease-in-out"
		style="opacity: {settingsStore.chatOpacityInFullscreen}"
	>
		<div class="overflow-hidden rounded-xl border border-white/20 bg-black/80 shadow-2xl backdrop-blur-md">
			<div class="max-h-80 space-y-2 overflow-y-auto scroll-smooth p-3">
				{#each messages.slice(-5) as message (message.id)}
					{@const isOwnMessage = message.user_id === authStore.user?.id}
					<div class="animate-fadeIn rounded-lg bg-white/10 p-2">
						<div class="mb-1 flex items-center gap-2">
							<span class="text-xs font-medium text-white/90">
								{isOwnMessage ? 'You' : message.profiles?.display_name || 'Unknown'}
							</span>
							<span class="text-xs text-white/50">
								{formatTime(message.created_at)}
							</span>
						</div>
						<div class="wrap-break-words text-sm text-white/90">
							{message.message}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<!-- Regular Chat Panel (Non-Fullscreen) -->
{#if !isFullscreen}
	<div class="bg-surface border-border flex h-full flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm">
		<!-- Chat Header -->
		<div class="border-border bg-surface-hover/30 shrink-0 border-b p-3">
			<h3 class="text-text-primary text-lg font-semibold">Chat</h3>
			<p class="text-text-muted mt-1 text-xs">
				{messages.length} message{messages.length !== 1 ? 's' : ''}
			</p>
		</div>

		<!-- Chat Messages - Scrollable container -->
		<div 
			bind:this={chatContainer}
			class="relative flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
		>
			<ChatMessages {messages} containerRef={chatContainer} />
		</div>

		<!-- Message Input -->
		<div class="border-border bg-surface-hover/30 shrink-0 border-t p-4">
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
						<div class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
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
