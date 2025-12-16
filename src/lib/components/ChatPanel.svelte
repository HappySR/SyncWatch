<script lang="ts">
  import { roomStore } from '$lib/stores/room.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { supabase } from '$lib/supabase';
  import { onMount, onDestroy } from 'svelte';
  import { Send } from 'lucide-svelte';
  import VideoCallContainer from './video-call/VideoCallContainer.svelte';
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
      .select(`
        *,
        profiles (
          display_name,
          avatar_url
        )
      `)
      .eq('room_id', roomStore.currentRoom.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) {
      messages = data as ChatMessage[];
      setTimeout(scrollToBottom, 100);
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
          setTimeout(scrollToBottom, 50);
        }
      )
      .subscribe();
  }

  async function sendMessage() {
    if (!newMessage.trim() || !roomStore.currentRoom || !authStore.user || isSending) return;

    isSending = true;
    const messageToSend = newMessage.trim();
    newMessage = ''; // Clear immediately for better UX

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          room_id: roomStore.currentRoom.id,
          user_id: authStore.user.id,
          message: messageToSend
        });

      if (error) throw error;
      
      // Focus back on input
      messageInput?.focus();
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore message if failed
      newMessage = messageToSend;
    } finally {
      isSending = false;
    }
  }

  function scrollToBottom() {
    if (chatContainer) {
      chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
      });
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
    class="fixed bottom-4 left-4 w-96 max-h-96 z-50 transition-all duration-300 ease-in-out"
    style="opacity: {settingsStore.chatOpacityInFullscreen}"
  >
    <div class="bg-black/80 backdrop-blur-md rounded-xl overflow-hidden border border-white/20 shadow-2xl">
      <div class="p-3 space-y-2 max-h-80 overflow-y-auto">
        {#each messages.slice(-5) as message (message.id)}
          {@const isOwnMessage = message.user_id === authStore.user?.id}
          <div class="bg-white/10 rounded-lg p-2 animate-in slide-in-from-bottom-2 duration-200">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-white/90 text-xs font-medium">
                {isOwnMessage ? 'You' : message.profiles?.display_name || 'Unknown'}
              </span>
              <span class="text-white/50 text-xs">
                {formatTime(message.created_at)}
              </span>
            </div>
            <div class="text-white/90 text-sm wrap-break-words">
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
  <div class="bg-surface backdrop-blur-sm border border-border rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
    <!-- Video Call Section -->
    <div class="p-4 border-b border-border bg-surface-hover/50">
      <VideoCallContainer {isFullscreen} />
    </div>

    <!-- Chat Header -->
    <div class="p-4 border-b border-border bg-surface-hover/30">
      <h3 class="text-text-primary font-semibold text-lg">Chat</h3>
      <p class="text-text-muted text-xs mt-1">{messages.length} message{messages.length !== 1 ? 's' : ''}</p>
    </div>

    <!-- Chat Messages -->
    <div class="flex-1 overflow-hidden relative">
      <ChatMessages {messages} containerRef={chatContainer} />
      
      <!-- Scroll to bottom indicator -->
      {#if messages.length > 0}
        <div class="absolute bottom-2 right-2 opacity-0 hover:opacity-100 transition-opacity">
          <button
            onclick={scrollToBottom}
            class="bg-primary/80 hover:bg-primary text-white p-2 rounded-full shadow-lg"
            title="Scroll to bottom"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <!-- Message Input -->
    <div class="p-4 border-t border-border bg-surface-hover/30">
      <form 
        onsubmit={(e) => { e.preventDefault(); sendMessage(); }} 
        class="flex gap-2"
      >
        <div class="flex-1 relative">
          <input
            bind:this={messageInput}
            type="text"
            bind:value={newMessage}
            oninput={handleInput}
            placeholder="Type a message..."
            disabled={isSending}
            class="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            maxlength="500"
          />
          {#if isTyping}
            <div class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-xs">
              {newMessage.length}/500
            </div>
          {/if}
        </div>
        <button
          type="submit"
          disabled={!newMessage.trim() || isSending}
          class="bg-primary hover:bg-primary/90 disabled:bg-gray-500 disabled:cursor-not-allowed text-white p-2.5 rounded-lg transition-all transform hover:scale-105 active:scale-95 disabled:transform-none shadow-lg hover:shadow-primary/50"
        >
          {#if isSending}
            <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          {:else}
            <Send class="w-5 h-5" />
          {/if}
        </button>
      </form>
      <p class="text-text-muted text-xs mt-2">Press Enter to send</p>
    </div>
  </div>
{/if}

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
    animation: slide-in-from-bottom 0.2s ease-out;
  }
</style>
