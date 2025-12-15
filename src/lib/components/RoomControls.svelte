<script lang="ts">
  import { playerStore } from '$lib/stores/player.svelte';
  import { Youtube, Link } from 'lucide-svelte';

  let videoUrl = $state('');
  let videoType = $state<'youtube' | 'direct'>('youtube');

  function extractYouTubeId(url: string): string | null {
    url = url.trim();
    
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})(?:[&?]|$)/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[&?]|$)/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[&?]|$)/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})(?:[&?]|$)/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})(?:[&?]|$)/,
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
      console.log('✅ Processed YouTube URL:', processedUrl);
      
    } else {
      detectedType = 'direct';
      
      if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
        processedUrl = 'https://' + processedUrl;
      }
      console.log('✅ Processed Direct URL:', processedUrl);
    }

    try {
      console.log('📤 Sending video to playerStore:', { url: processedUrl, type: detectedType });
      await playerStore.changeVideo(processedUrl, detectedType);
      
      // ⭐ KEY CHANGE: Wait a bit to ensure database update completes
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('✅ Video loaded successfully');
      videoUrl = '';
    } catch (error) {
      console.error('❌ Failed to load video:', error);
      alert('Failed to load video. Please try again.');
    }
  }
</script>

<div class="bg-surface border border-border rounded-xl p-6">
  <h3 class="text-text-primary font-semibold text-lg mb-4">Load Video</h3>

  <div class="space-y-4">
    <div class="flex gap-2">
      <button
        type="button"
        onclick={() => (videoType = 'youtube')}
        class={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
          videoType === 'youtube'
            ? 'bg-primary text-white'
            : 'bg-surface-hover text-text-secondary'
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
            ? 'bg-primary text-white'
            : 'bg-surface-hover text-text-secondary'
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
        class="w-full bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary"
        onkeydown={(e) => e.key === 'Enter' && handleLoadVideo()}
      />

      <button
        onclick={handleLoadVideo}
        type="button"
        class="w-full bg-primary hover:opacity-90 text-white px-4 py-3 rounded-lg transition font-medium"
      >
        Load Video
      </button>
    </div>

    <div class="text-xs text-text-muted space-y-1">
      {#if videoType === 'youtube'}
        <p>✓ Full URL: https://www.youtube.com/watch?v=VIDEO_ID</p>
        <p>✓ Short URL: https://youtu.be/VIDEO_ID</p>
        <p>✓ Just the ID: VIDEO_ID (11 characters)</p>
        <p class="mt-2 text-text-secondary">Note: Use YouTube's native controls for quality & settings</p>
      {:else}
        <p>• Direct links to video files (.mp4, .webm, .ogg)</p>
        <p>• Must be publicly accessible (no login required)</p>
        <p>• Includes Google Drive preview links</p>
      {/if}
    </div>
  </div>
</div>
