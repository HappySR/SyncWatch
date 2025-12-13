<script lang="ts">
  import { playerStore } from '$lib/stores/player.svelte';
  import { Youtube, Link, HardDrive } from 'lucide-svelte';

  let videoUrl = $state('');
  let videoType = $state<'youtube' | 'direct' | 'drive'>('youtube');

  async function handleLoadVideo() {
    if (!videoUrl.trim()) return;

    let detectedType: typeof videoType = 'direct';
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      detectedType = 'youtube';
    } else if (videoUrl.includes('drive.google.com')) {
      detectedType = 'drive';
      const fileIdMatch = videoUrl.match(/\/d\/([^/]+)/);
      if (fileIdMatch) {
        videoUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
      }
    }

    await playerStore.changeVideo(videoUrl, detectedType);
    videoUrl = '';
  }
</script>

<div class="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
  <h3 class="text-white font-semibold text-lg mb-4">Load Video</h3>
  
  <div class="space-y-4">
    <div class="flex gap-2">
      <button
        onclick={() => videoType = 'youtube'}
        class="flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2
          {videoType === 'youtube'
            ? 'bg-purple-500 text-white'
            : 'bg-white/10 text-white/60'}"
      >
        <Youtube class="w-4 h-4" />
        <span class="text-sm">YouTube</span>
      </button>

      <button
        onclick={() => videoType = 'direct'}
        class="flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2
          {videoType === 'direct'
            ? 'bg-purple-500 text-white'
            : 'bg-white/10 text-white/60'}"
      >
        <Link class="w-4 h-4" />
        <span class="text-sm">Direct Link</span>
      </button>

      <button
        onclick={() => videoType = 'drive'}
        class="flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2
          {videoType === 'drive'
            ? 'bg-purple-500 text-white'
            : 'bg-white/10 text-white/60'}"
      >
        <HardDrive class="w-4 h-4" />
        <span class="text-sm">Google Drive</span>
      </button>
    </div>

    <div class="space-y-2">
      <input
        type="text"
        bind:value={videoUrl}
        placeholder={
          videoType === 'youtube' ? 'Paste YouTube URL...' :
          videoType === 'drive' ? 'Paste Google Drive link...' :
          'Paste video URL (mp4, webm, etc.)...'
        }
        class="w-full bg-black/30 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-purple-500"
        onkeydown={(e) => e.key === 'Enter' && handleLoadVideo()}
      />
      
      <button
        onclick={handleLoadVideo}
        class="w-full bg-linear-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-4 py-3 rounded-lg transition font-medium"
      >
        Load Video
      </button>
    </div>

    <div class="text-xs text-white/40 space-y-1">
      {#if videoType === 'youtube'}
        <p>• Supports standard YouTube URLs and shortened youtu.be links</p>
        <p>• Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ</p>
      {:else if videoType === 'drive'}
        <p>• Paste any Google Drive video link</p>
        <p>• Make sure the file is set to "Anyone with the link can view"</p>
      {:else}
        <p>• Direct links to video files (.mp4, .webm, .ogg)</p>
        <p>• Must be publicly accessible</p>
      {/if}
    </div>
  </div>
</div>
