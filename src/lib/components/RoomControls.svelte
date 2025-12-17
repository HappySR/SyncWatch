<script lang="ts">
	import { playerStore } from '$lib/stores/player.svelte';
	import { Youtube, Link, Info } from 'lucide-svelte';

	let videoUrl = $state('');
	let videoType = $state<'youtube' | 'direct'>('youtube');
	let showHelp = $state(false);

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
				console.log('✅ Extracted YouTube ID:', match[1]);
				return match[1];
			}
		}

		console.error('❌ Could not extract YouTube ID from:', url);
		return null;
	}

	function processDropboxUrl(url: string): string {
		// Convert Dropbox sharing link to direct download link
		// www.dropbox.com/... → dl.dropboxusercontent.com/...
		let processed = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');

		// Remove ?dl=0 if present and add ?raw=1
		processed = processed.replace(/\?dl=0/, '');
		processed = processed.includes('?') ? `${processed}&raw=1` : `${processed}?raw=1`;

		return processed;
	}

	async function handleLoadVideo() {
		if (!videoUrl.trim()) {
			alert('Please enter a video URL');
			return;
		}

		let processedUrl = videoUrl.trim();
		let detectedType: typeof videoType = 'direct';

		// YouTube URLs
		if (processedUrl.includes('youtube.com') || processedUrl.includes('youtu.be')) {
			detectedType = 'youtube';

			const videoId = extractYouTubeId(processedUrl);
			if (!videoId) {
				alert(
					'❌ Invalid YouTube URL\n\nPlease use a URL like:\nhttps://www.youtube.com/watch?v=VIDEO_ID'
				);
				return;
			}

			processedUrl = `https://www.youtube.com/watch?v=${videoId}`;
			console.log('✅ Processed YouTube URL:', processedUrl);
		}
		// Google Drive - NOT SUPPORTED
		else if (processedUrl.includes('drive.google.com')) {
			alert(
				'❌ Google Drive is not supported\n\nGoogle Drive blocks video streaming for shared files.\n\nPlease use one of these instead:\n\n✅ YouTube (upload as unlisted)\n✅ Dropbox (share link)\n✅ Direct .mp4/.webm URL\n✅ Vimeo, Cloudinary, or other video CDN'
			);
			return;
		}
		// Dropbox URLs
		else if (processedUrl.includes('dropbox.com')) {
			detectedType = 'direct';
			processedUrl = processDropboxUrl(processedUrl);
			console.log('✅ Converted Dropbox URL:', processedUrl);
		}
		// Direct URLs
		else {
			detectedType = 'direct';

			// Add https:// if missing
			if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
				processedUrl = 'https://' + processedUrl;
			}

			// Validate that it's a video file
			const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v'];
			const hasVideoExtension = videoExtensions.some((ext) =>
				processedUrl.toLowerCase().includes(ext)
			);

			if (
				!hasVideoExtension &&
				!processedUrl.includes('cloudinary') &&
				!processedUrl.includes('vimeo')
			) {
				const confirmLoad = confirm(
					"⚠️ This URL doesn't look like a video file\n\n" +
						'Video files usually end with: .mp4, .webm, .ogg\n\n' +
						'Do you want to try loading it anyway?'
				);

				if (!confirmLoad) {
					return;
				}
			}

			console.log('✅ Processed Direct URL:', processedUrl);
		}

		try {
			console.log('📤 Sending video to playerStore:', { url: processedUrl, type: detectedType });
			await playerStore.changeVideo(processedUrl, detectedType);

			console.log('✅ Video loaded successfully');
			videoUrl = '';
			showHelp = false;
		} catch (error) {
			console.error('❌ Failed to load video:', error);
			alert('Failed to load video. Please try again or use a different URL.');
		}
	}
</script>

<div class="bg-surface border-border rounded-xl border p-6">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-text-primary text-lg font-semibold">Load Video</h3>
		<button
			onclick={() => (showHelp = !showHelp)}
			class="text-text-secondary hover:text-text-primary p-1 transition"
			title="Show help"
		>
			<Info class="h-5 w-5" />
		</button>
	</div>

	{#if showHelp}
		<div class="mb-4 space-y-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm">
			<div class="font-semibold text-blue-400">✅ Supported Platforms:</div>
			<div class="text-text-secondary space-y-1">
				<div><strong class="text-text-primary">YouTube:</strong> Paste any YouTube URL</div>
				<div>
					<strong class="text-text-primary">Dropbox:</strong> Share link (auto-converted to direct stream)
				</div>
				<div>
					<strong class="text-text-primary">Direct Links:</strong> Any .mp4, .webm, .ogg file URL
				</div>
				<div>
					<strong class="text-text-primary">CDNs:</strong> Cloudinary, Vimeo, or other video hosting
				</div>
			</div>

			<div class="mt-3 border-t border-blue-500/20 pt-3">
				<div class="font-semibold text-red-400">❌ Not Supported:</div>
				<div class="text-text-secondary">
					<strong class="text-text-primary">Google Drive</strong> - Blocks video streaming. Upload to
					YouTube instead (as unlisted).
				</div>
			</div>
		</div>
	{/if}

	<div class="space-y-4">
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => (videoType = 'youtube')}
				class={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 transition ${
					videoType === 'youtube' ? 'bg-primary text-white' : 'bg-surface-hover text-text-secondary'
				}`}
			>
				<Youtube class="h-4 w-4" />
				<span class="text-sm">YouTube</span>
			</button>

			<button
				type="button"
				onclick={() => (videoType = 'direct')}
				class={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 transition ${
					videoType === 'direct' ? 'bg-primary text-white' : 'bg-surface-hover text-text-secondary'
				}`}
			>
				<Link class="h-4 w-4" />
				<span class="text-sm">Direct Link</span>
			</button>
		</div>

		<div class="space-y-2">
			<input
				type="text"
				bind:value={videoUrl}
				placeholder={videoType === 'youtube'
					? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
					: 'https://www.dropbox.com/s/abc123/video.mp4 or direct .mp4 URL'}
				class="bg-input border-border text-text-primary placeholder-text-muted focus:border-primary w-full rounded-lg border px-4 py-3 focus:outline-none"
				onkeydown={(e) => e.key === 'Enter' && handleLoadVideo()}
			/>

			<button
				onclick={handleLoadVideo}
				type="button"
				class="bg-primary w-full rounded-lg px-4 py-3 font-medium text-white transition hover:opacity-90"
			>
				Load Video
			</button>
		</div>

		<div class="text-text-muted space-y-2 text-xs">
			{#if videoType === 'youtube'}
				<div class="space-y-1">
					<p class="text-text-primary font-medium">YouTube Examples:</p>
					<p>✓ https://www.youtube.com/watch?v=VIDEO_ID</p>
					<p>✓ https://youtu.be/VIDEO_ID</p>
					<p>✓ Just the ID: VIDEO_ID</p>
				</div>
				<div class="mt-2 rounded border border-green-500/20 bg-green-500/10 p-2 text-green-400">
					⚡ Best sync performance with full controls
				</div>
			{:else}
				<div class="space-y-1">
					<p class="text-text-primary font-medium">Direct Link Examples:</p>
					<p>✓ Dropbox: https://www.dropbox.com/s/.../video.mp4</p>
					<p>✓ Direct URL: https://example.com/video.mp4</p>
					<p>✓ Supported formats: .mp4, .webm, .ogg, .mov</p>
				</div>

				<div class="mt-2 rounded border border-blue-500/20 bg-blue-500/10 p-2 text-blue-400">
					<p class="font-semibold">💡 Dropbox Tips:</p>
					<p class="mt-1">1. Share your video file in Dropbox</p>
					<p>2. Copy the share link</p>
					<p>3. Paste it here - we'll auto-convert it!</p>
				</div>

				<div class="mt-2 rounded border border-orange-500/20 bg-orange-500/10 p-2 text-orange-400">
					<p class="font-semibold">⚠️ Important:</p>
					<p class="mt-1">• File must be publicly accessible</p>
					<p>• Sync quality depends on file hosting</p>
					<p>• Large files may buffer more</p>
				</div>
			{/if}
		</div>
	</div>
</div>
