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
  let channel: any;

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
          setTimeout(scrollToBottom, 100);
        }
      )
      .subscribe();
  }

  async function sendMessage() {
    if (!newMessage.trim() || !roomStore.currentRoom || !authStore.user) return;

    const { error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: roomStore.currentRoom.id,
        user_id: authStore.user.id,
        message: newMessage.trim()
      });

    if (!error) {
      newMessage = '';
    }
  }

  function scrollToBottom() {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
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
</script>

<!-- Fullscreen Chat Overlay -->
{#if isFullscreen && settingsStore.showChatInFullscreen && messages.length > 0}
  <div 
    class="fixed bottom-4 left-4 w-96 max-h-96 z-50"
    style="opacity: {settingsStore.chatOpacityInFullscreen}"
  >
    <div class="bg-black/80 backdrop-blur-md rounded-xl overflow-hidden border border-white/20">
      <div class="p-3 space-y-2 max-h-80 overflow-y-auto">
        {#each messages.slice(-5) as message}
          {@const isOwnMessage = message.user_id === authStore.user?.id}
          <div class="bg-white/10 rounded-lg p-2">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-white/90 text-xs font-medium">
                {isOwnMessage ? 'You' : message.profiles?.display_name || 'Unknown'}
              </span>
              <span class="text-white/50 text-xs">
                {formatTime(message.created_at)}
              </span>
            </div>
            <div class="text-white/90 text-sm">
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
  <div class="bg-surface backdrop-blur-sm border border-border rounded-xl overflow-hidden flex flex-col h-full">
    <div class="p-4 border-b border-border">
      <h3 class="text-text-primary font-semibold text-lg">Chat & Video</h3>
    </div>

    <!-- Video Call Section -->
    <div class="p-4 border-b border-border">
      <VideoCallContainer {isFullscreen} />
    </div>

    <!-- Chat Messages -->
    <ChatMessages {messages} containerRef={chatContainer} />

    <!-- Message Input -->
    <div class="p-4 border-t border-border">
      <form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="flex gap-2">
        <input
          type="text"
          bind:value={newMessage}
          placeholder="Type a message..."
          class="flex-1 bg-input border border-border rounded-lg px-4 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary text-sm"
        />
        <button
          type="submit"
          class="bg-primary hover:bg-primary/90 text-white p-2 rounded-lg transition"
        >
          <Send class="w-5 h-5" />
        </button>
      </form>
    </div>
  </div>
{/if}
