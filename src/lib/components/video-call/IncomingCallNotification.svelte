<script lang="ts">
	import { PhoneIncoming } from 'lucide-svelte';

	let { callerName, onJoin, onDecline } = $props<{
		callerName: string;
		onJoin: () => void;
		onDecline: () => void;
	}>();
</script>

<div
	class="bg-surface border-primary fixed top-20 right-4 z-50 animate-bounce rounded-xl border-2 p-4 shadow-2xl"
>
	<div class="mb-3 flex items-center gap-3">
		<div class="bg-primary rounded-full p-2">
			<PhoneIncoming class="h-5 w-5 text-black" />
		</div>
		<div>
			<div class="text-text-primary font-semibold">Incoming Video Call</div>
			<div class="text-text-secondary text-sm">{callerName}</div>
		</div>
	</div>
	<div class="flex gap-2">
		<button
			onclick={onJoin}
			class="flex-1 rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-green-600"
		>
			Join
		</button>
		<button
			onclick={onDecline}
			class="flex-1 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600"
		>
			Decline
		</button>
	</div>
</div>
