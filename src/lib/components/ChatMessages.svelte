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

<div bind:this={containerRef} class="flex-1 overflow-y-auto p-4 space-y-3">
  {#if messages.length === 0}
    <div class="text-text-muted text-sm text-center py-8">
      No messages yet. Start the conversation!
    </div>
  {:else}
    {#each messages as message}
      {@const isOwnMessage = message.user_id === authStore.user?.id}
      <div class="flex gap-2" class:flex-row-reverse={isOwnMessage}>
        <div class="shrink-0">
          {#if message.profiles?.avatar_url}
            <img 
              src={message.profiles.avatar_url} 
              alt={message.profiles.display_name}
              class="w-8 h-8 rounded-full"
            />
          {:else}
            <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
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
            class="px-3 py-2 rounded-lg text-sm {isOwnMessage
            ? 'bg-primary text-white'
            : 'bg-surface-hover text-text-primary'}"
          >
            {message.message}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>
