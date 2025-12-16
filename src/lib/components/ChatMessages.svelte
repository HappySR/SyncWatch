<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';

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

  let {
    messages,
    containerRef
  } = $props<{
    messages: ChatMessage[];
    containerRef?: HTMLDivElement;
  }>();

  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }
</script>

<div bind:this={containerRef} class="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
  {#if messages.length === 0}
    <div class="text-text-muted text-sm text-center py-8">
      <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <p>No messages yet.</p>
      <p class="text-xs mt-1">Start the conversation!</p>
    </div>
  {:else}
    {#each messages as message (message.id)}
      {@const isOwnMessage = message.user_id === authStore.user?.id}
      <div 
        class="flex gap-2 animate-in slide-in-from-bottom-4 duration-300" 
        class:flex-row-reverse={isOwnMessage}
      >
        <div class="shrink-0">
          {#if message.profiles?.avatar_url}
            <img 
              src={message.profiles.avatar_url} 
              alt={message.profiles.display_name}
              class="w-8 h-8 rounded-full ring-2 ring-border"
            />
          {:else}
            <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold ring-2 ring-border">
              {(message.profiles?.display_name?.[0] || '?').toUpperCase()}
            </div>
          {/if}
        </div>

        <div class="flex-1 max-w-[70%]">
          <div class="flex items-center gap-2 mb-1" class:flex-row-reverse={isOwnMessage}>
            <span class="text-text-secondary text-xs font-medium">
              {isOwnMessage ? 'You' : message.profiles?.display_name || 'Unknown'}
            </span>
            <span class="text-text-muted text-xs">
              {formatTime(message.created_at)}
            </span>
          </div>
          <div 
            class="px-3 py-2 rounded-lg text-sm wrap-break-words transition-all hover:shadow-md {isOwnMessage
            ? 'bg-primary text-white rounded-br-none'
            : 'bg-surface-hover text-text-primary rounded-bl-none'}"
          >
            {message.message}
          </div>
        </div>
      </div>
    {/each}
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
