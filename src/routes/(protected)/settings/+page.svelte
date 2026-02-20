<script lang="ts">
	import { onMount } from 'svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { Palette, MessageSquare, Eye, EyeOff } from 'lucide-svelte';

	onMount(() => {
		themeStore.applyTheme();
	});

	const themes = themeStore.getThemes();
</script>

<div class="mx-auto max-w-4xl px-4 py-8">
	<div class="mb-8">
		<h1 class="text-text-primary mb-2 text-4xl font-bold">Settings</h1>
		<p class="text-text-secondary">Customize your SyncWatch experience</p>
	</div>

	<!-- Theme Selection -->
	<div class="bg-surface border-border mb-6 rounded-xl border p-6 backdrop-blur-sm">
		<div class="mb-6 flex items-center gap-3">
			<Palette class="text-primary h-6 w-6" />
			<h2 class="text-text-primary text-2xl font-bold">Theme</h2>
		</div>

		<div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
			{#each themes as theme}
				{@const isSelected = themeStore.currentTheme === theme}
				<button
					onclick={() => themeStore.setTheme(theme)}
					class="relative transform rounded-lg border-2 p-4 transition-all hover:scale-105 {isSelected
						? 'border-primary bg-primary/10'
						: 'border-border bg-surface-hover'}"
				>
					<div class="text-text-primary mb-2 font-medium">
						{themeStore.getThemeName(theme)}
					</div>

					<!-- Theme Preview -->
					<div class="mb-3 flex gap-1">
						{#if theme === 'default'}
							<div class="h-6 w-6 rounded-full bg-purple-500"></div>
							<div class="h-6 w-6 rounded-full bg-pink-500"></div>
						{:else if theme === 'soft'}
							<div class="h-6 w-6 rounded-full bg-pink-400"></div>
							<div class="h-6 w-6 rounded-full bg-orange-400"></div>
						{:else if theme === 'cyan'}
							<div class="h-6 w-6 rounded-full bg-cyan-500"></div>
							<div class="h-6 w-6 rounded-full bg-sky-500"></div>
						{:else if theme === 'ocean'}
							<div class="h-6 w-6 rounded-full bg-blue-500"></div>
							<div class="h-6 w-6 rounded-full bg-teal-500"></div>
						{:else if theme === 'sunset'}
							<div class="h-6 w-6 rounded-full bg-amber-500"></div>
							<div class="h-6 w-6 rounded-full bg-red-500"></div>
						{:else if theme === 'forest'}
							<div class="h-6 w-6 rounded-full bg-emerald-500"></div>
							<div class="h-6 w-6 rounded-full bg-lime-500"></div>
						{:else if theme === 'zebra'}
							<div class="h-6 w-6 rounded-full bg-white"></div>
							<div class="h-6 w-6 rounded-full bg-gray-300"></div>
						{/if}
					</div>

					{#if isSelected}
						<div class="bg-primary absolute top-2 right-2 rounded-full p-1 text-white">
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- Video Call Settings -->
	<!-- <div class="bg-surface border-border mb-6 rounded-xl border p-6 backdrop-blur-sm">
		<div class="mb-6 flex items-center gap-3">
			<MessageSquare class="text-primary h-6 w-6" />
			<h2 class="text-text-primary text-2xl font-bold">Fullscreen Settings</h2>
		</div>

		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<div class="text-text-primary mb-1 font-medium">Show Chat in Fullscreen</div>
					<div class="text-text-muted text-sm">
						Display recent chat messages in top-right corner when video is in fullscreen mode
					</div>
				</div>
				<button
					onclick={() => settingsStore.toggleChatInFullscreen()}
					aria-label="Toggle chat in fullscreen"
					class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {settingsStore.showChatInFullscreen
						? 'bg-primary'
						: 'bg-surface-hover'}"
				>
					<span
						class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {settingsStore.showChatInFullscreen
							? 'translate-x-6'
							: 'translate-x-1'}"
					></span>
				</button>
			</div>

			{#if settingsStore.showChatInFullscreen}
				<div>
					<div class="mb-2 flex items-center justify-between">
						<div class="text-text-primary font-medium">Chat Overlay Opacity</div>
						<div class="text-text-secondary text-sm">
							{Math.round(settingsStore.chatOpacityInFullscreen * 100)}%
						</div>
					</div>
					<input
						type="range"
						min="0.1"
						max="1"
						step="0.1"
						value={settingsStore.chatOpacityInFullscreen}
						oninput={(e) =>
							settingsStore.setChatOpacity(parseFloat((e.target as HTMLInputElement).value))}
						class="accent-primary w-full"
					/>
					<div class="text-text-muted mt-1 flex justify-between text-xs">
						<span>10% (Subtle)</span>
						<span>100% (Opaque)</span>
					</div>
					<p class="text-text-muted mt-2 text-xs">
						💡 Adjust opacity to balance visibility with video viewing. Lower values are less
						distracting.
					</p>
				</div>
			{/if}
		</div>
	</div> -->

	<!-- Preview Section -->
	<div class="bg-surface border-border rounded-xl border p-6 backdrop-blur-sm">
		<h2 class="text-text-primary mb-4 text-2xl font-bold">Preview</h2>
		<div class="space-y-4">
			<div class="bg-surface-hover rounded-lg p-4">
				<div class="text-text-primary mb-2 font-medium">Primary Text</div>
				<div class="text-text-secondary mb-2">Secondary Text</div>
				<div class="text-text-muted">Muted Text</div>
			</div>

			<div class="flex gap-2">
				<button class="bg-primary hover:bg-primary/90 rounded-lg px-4 py-2 text-white transition">
					Primary Button
				</button>
				<button
					class="bg-secondary hover:bg-secondary/90 rounded-lg px-4 py-2 text-white transition"
				>
					Secondary Button
				</button>
			</div>
		</div>
	</div>
</div>
