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

<div class="max-w-4xl mx-auto px-4 py-8">
  <div class="mb-8">
    <h1 class="text-4xl font-bold text-text-primary mb-2">Settings</h1>
    <p class="text-text-secondary">Customize your SyncWatch experience</p>
  </div>

  <!-- Theme Selection -->
  <div class="bg-surface backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
    <div class="flex items-center gap-3 mb-6">
      <Palette class="w-6 h-6 text-primary" />
      <h2 class="text-2xl font-bold text-text-primary">Theme</h2>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {#each themes as theme}
        {@const isSelected = themeStore.currentTheme === theme}
        <button
          onclick={() => themeStore.setTheme(theme)}
          class="relative p-4 rounded-lg border-2 transition-all transform hover:scale-105 {isSelected
            ? 'border-primary bg-primary/10'
            : 'border-border bg-surface-hover'}"
        >
          <div class="text-text-primary font-medium mb-2">
            {themeStore.getThemeName(theme)}
          </div>
          
          <!-- Theme Preview -->
          <div class="flex gap-1 mb-3">
            {#if theme === 'default'}
              <div class="w-6 h-6 rounded-full bg-purple-500"></div>
              <div class="w-6 h-6 rounded-full bg-pink-500"></div>
            {:else if theme === 'soft'}
              <div class="w-6 h-6 rounded-full bg-pink-400"></div>
              <div class="w-6 h-6 rounded-full bg-orange-400"></div>
            {:else if theme === 'cyan'}
              <div class="w-6 h-6 rounded-full bg-cyan-500"></div>
              <div class="w-6 h-6 rounded-full bg-sky-500"></div>
            {:else if theme === 'ocean'}
              <div class="w-6 h-6 rounded-full bg-blue-500"></div>
              <div class="w-6 h-6 rounded-full bg-teal-500"></div>
            {:else if theme === 'sunset'}
              <div class="w-6 h-6 rounded-full bg-amber-500"></div>
              <div class="w-6 h-6 rounded-full bg-red-500"></div>
            {:else if theme === 'forest'}
              <div class="w-6 h-6 rounded-full bg-emerald-500"></div>
              <div class="w-6 h-6 rounded-full bg-lime-500"></div>
            {:else if theme === 'sunishka'}
              <div class="w-6 h-6 rounded-full bg-white"></div>
              <div class="w-6 h-6 rounded-full bg-gray-300"></div>
            {/if}
          </div>

          {#if isSelected}
            <div class="absolute top-2 right-2 bg-primary text-white rounded-full p-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Video Call Settings -->
  <div class="bg-surface backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
    <div class="flex items-center gap-3 mb-6">
      <MessageSquare class="w-6 h-6 text-primary" />
      <h2 class="text-2xl font-bold text-text-primary">Fullscreen Settings</h2>
    </div>

    <div class="space-y-6">
      <!-- Show Chat in Fullscreen -->
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <div class="text-text-primary font-medium mb-1">Show Chat in Fullscreen</div>
          <div class="text-text-muted text-sm">Display chat messages when video is in fullscreen mode</div>
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

      <!-- Chat Opacity -->
      {#if settingsStore.showChatInFullscreen}
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="text-text-primary font-medium">Chat Opacity in Fullscreen</div>
            <div class="text-text-secondary text-sm">{Math.round(settingsStore.chatOpacityInFullscreen * 100)}%</div>
          </div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={settingsStore.chatOpacityInFullscreen}
            oninput={(e) => settingsStore.setChatOpacity(parseFloat((e.target as HTMLInputElement).value))}
            class="w-full accent-primary"
          />
          <div class="flex justify-between text-xs text-text-muted mt-1">
            <span>10%</span>
            <span>100%</span>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Preview Section -->
  <div class="bg-surface backdrop-blur-sm border border-border rounded-xl p-6">
    <h2 class="text-2xl font-bold text-text-primary mb-4">Preview</h2>
    <div class="space-y-4">
      <div class="bg-surface-hover rounded-lg p-4">
        <div class="text-text-primary font-medium mb-2">Primary Text</div>
        <div class="text-text-secondary mb-2">Secondary Text</div>
        <div class="text-text-muted">Muted Text</div>
      </div>
      
      <div class="flex gap-2">
        <button class="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg transition">
          Primary Button
        </button>
        <button class="bg-secondary hover:bg-secondary/90 text-white px-4 py-2 rounded-lg transition">
          Secondary Button
        </button>
      </div>
    </div>
  </div>
</div>
