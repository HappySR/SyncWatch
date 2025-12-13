<script lang="ts">
  import { playerStore } from '$lib/stores/player.svelte';
  import { Youtube, Link } from 'lucide-svelte';

  let videoUrl = $state('');
  let videoType = $state<'youtube' | 'direct'>('youtube');

  function extractYouTubeId(url: string): string | null {
    url = url.trim();
    
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        console.log('Extracted YouTube ID:', match[1]);
        return match[1];
      }
    }
    
    console.error('Could not extract YouTube ID from:', url);
    return null;
  }

  async function handleLoadVideo() {
    if (!videoUrl.trim()) {
      alert('Please enter a video URL');
      return;
    }

    let processedUrl = videoUrl.trim();
    let detectedType: typeof videoType = 'direct';
    
    if (processedUrl.includes('youtube.com') || processedUrl.includes('youtu.be')) {
      detectedType = 'youtube';
      
      const videoId = extractYouTubeId(processedUrl);
      if (!videoId) {
        alert('Invalid YouTube URL. Please use a URL like: https://www.youtube.com/watch?v=VIDEO_ID');
        return;
      }
      
      processedUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log('Processed YouTube URL:', processedUrl);
      
    } else {
      detectedType = 'direct';
      
      if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
        processedUrl = 'https://' + processedUrl;
      }
    }

    try {
      await playerStore.changeVideo(processedUrl, detectedType);
      videoUrl = '';
      console.log('Video loaded successfully:', { url: processedUrl, type: detectedType });
    } catch (error) {
      console.error('Failed to load video:', error);
      alert('Failed to load video. Please try again.');
    }
  }
</script>

<div class="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
  <h3 class="text-white font-semibold text-lg mb-4">Load Video</h3>

  <div class="space-y-4">
    <div class="flex gap-2">
      <button
        type="button"
        onclick={() => (videoType = 'youtube')}
        class={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
          videoType === 'youtube'
            ? 'bg-purple-500 text-white'
            : 'bg-white/10 text-white/60'
        }`}
      >
        <Youtube class="w-4 h-4" />
        <span class="text-sm">YouTube</span>
      </button>

      <button
        type="button"
        onclick={() => (videoType = 'direct')}
        class={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
          videoType === 'direct'
            ? 'bg-purple-500 text-white'
            : 'bg-white/10 text-white/60'
        }`}
      >
        <Link class="w-4 h-4" />
        <span class="text-sm">Direct Link</span>
      </button>
    </div>

    <div class="space-y-2">
      <input
        type="text"
        bind:value={videoUrl}
        placeholder={
          videoType === 'youtube' ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' :
          'https://example.com/video.mp4'
        }
        class="w-full bg-black/30 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-purple-500"
        onkeydown={(e) => e.key === 'Enter' && handleLoadVideo()}
      />

      <button
        onclick={handleLoadVideo}
        type="button"
        class="w-full bg-linear-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-4 py-3 rounded-lg transition font-medium"
      >
        Load Video
      </button>
    </div>

    <div class="text-xs text-white/40 space-y-1">
      {#if videoType === 'youtube'}
        <p>✓ Full URL: https://www.youtube.com/watch?v=VIDEO_ID</p>
        <p>✓ Short URL: https://youtu.be/VIDEO_ID</p>
        <p>✓ Just the ID: VIDEO_ID (11 characters)</p>
        <p class="mt-2 text-white/60">Note: YouTube quality settings available in player controls</p>
      {:else}
        <p>• Direct links to video files (.mp4, .webm, .ogg)</p>
        <p>• Must be publicly accessible (no login required)</p>
        <p>• Includes Google Drive preview links</p>
      {/if}
    </div>
  </div>
</div>
