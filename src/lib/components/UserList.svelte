<script lang="ts">
  import { roomStore } from '$lib/stores/room.svelte';
  import { Users, Crown, Eye, Video } from 'lucide-svelte';

  let { isHost } = $props<{ isHost: boolean }>();

  async function toggleControls(memberId: string, currentState: boolean) {
    await roomStore.toggleMemberControls(memberId, !currentState);
  }
</script>

<div class="bg-surface backdrop-blur-sm border border-border rounded-xl p-6">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-text-primary font-semibold text-lg flex items-center gap-2">
      <Users class="w-5 h-5" />
      Room Members ({roomStore.members.length})
    </h3>
  </div>

  <div class="space-y-2">
    {#each roomStore.members as member}
      {@const isRoomHost = member.user_id === roomStore.currentRoom?.host_id}
      <div class="bg-surface-hover rounded-lg p-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          {#if member.profiles?.avatar_url}
            <img 
              src={member.profiles.avatar_url} 
              alt={member.profiles.display_name || 'User'}
              class="w-8 h-8 rounded-full"
            />
          {:else}
            <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
              {(member.profiles?.display_name?.[0] || member.profiles?.email?.[0] || '?').toUpperCase()}
            </div>
          {/if}

          <div>
            <div class="text-text-primary text-sm font-medium flex items-center gap-2">
              {member.profiles?.display_name || member.profiles?.email || 'Unknown'}
              {#if isRoomHost}
                <Crown class="w-3 h-3 text-yellow-400" />
              {/if}
            </div>
            <div class="text-text-muted text-xs">
              {#if member.has_controls}
                <span class="flex items-center gap-1">
                  <Video class="w-3 h-3" />
                  Can control
                </span>
              {:else}
                <span class="flex items-center gap-1">
                  <Eye class="w-3 h-3" />
                  View only
                </span>
              {/if}
            </div>
          </div>
        </div>

        {#if isHost && !isRoomHost}
          <button
            onclick={() => toggleControls(member.id, member.has_controls)}
            class="text-xs px-3 py-1 rounded transition
              {member.has_controls
                ? 'bg-green-500/20 text-green-400'
                : 'bg-orange-500/20 text-orange-400'}"
          >
            {member.has_controls ? 'Revoke' : 'Grant'}
          </button>
        {/if}
      </div>
    {/each}
  </div>

  {#if isHost}
    <div class="mt-4 pt-4 border-t border-border">
      <p class="text-text-muted text-xs">
        As the host, you can grant or revoke video controls for other members.
      </p>
    </div>
  {/if}
</div>
