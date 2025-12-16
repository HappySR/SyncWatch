<script lang="ts">
  import { PhoneIncoming } from 'lucide-svelte';

  let {
    callerName,
    onJoin,
    onDecline
  } = $props<{
    callerName: string;
    onJoin: () => void;
    onDecline: () => void;
  }>();
</script>

<div class="fixed top-20 right-4 z-50 bg-surface border-2 border-primary rounded-xl p-4 shadow-2xl animate-bounce">
  <div class="flex items-center gap-3 mb-3">
    <div class="bg-primary rounded-full p-2">
      <PhoneIncoming class="w-5 h-5 text-black" />
    </div>
    <div>
      <div class="text-text-primary font-semibold">Incoming Video Call</div>
      <div class="text-text-secondary text-sm">{callerName}</div>
    </div>
  </div>
  <div class="flex gap-2">
    <button
      onclick={onJoin}
      class="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg transition text-sm font-medium"
    >
      Join
    </button>
    <button
      onclick={onDecline}
      class="flex-1 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition text-sm font-medium"
    >
      Decline
    </button>
  </div>
</div>
