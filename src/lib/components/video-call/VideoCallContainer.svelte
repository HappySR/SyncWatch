<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { roomStore } from '$lib/stores/room.svelte';
  import { Phone, Minimize2, Maximize2, X } from 'lucide-svelte';

  let { isFullscreen = false } = $props<{ isFullscreen?: boolean }>();

  let isInCall = $state(false);
  let isMinimized = $state(false);
  let jitsiContainer: HTMLDivElement | undefined = $state(undefined);
  let jitsiApi: any = null;

  const roomName = $derived(`syncwatch-${roomStore.currentRoom?.id || 'default'}`);
  const displayName = $derived(
    authStore.profile?.display_name || 
    authStore.user?.email?.split('@')[0] || 
    'Guest'
  );

  onMount(() => {
    loadJitsiScript();
  });

  onDestroy(() => {
    if (jitsiApi) {
      jitsiApi.dispose();
      jitsiApi = null;
    }
  });

  function loadJitsiScript() {
    if ((window as any).JitsiMeetExternalAPI) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    document.head.appendChild(script);
  }

  function startCall() {
    if (!jitsiContainer || isInCall) return;

    const domain = 'meet.jit.si';
    
    const options = {
      roomName: roomName,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainer,
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        enableWelcomePage: false,
        prejoinPageEnabled: false,
        disableDeepLinking: true,
        hideConferenceSubject: true,
        hideConferenceTimer: false,
        enableNoisyMicDetection: true,
        resolution: 720,
        constraints: {
          video: {
            height: { ideal: 720, max: 1080, min: 360 }
          }
        }
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
          'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
          'videoquality', 'filmstrip', 'stats', 'shortcuts',
          'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone'
        ],
        SETTINGS_SECTIONS: ['devices', 'language', 'moderator', 'profile', 'calendar'],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        DEFAULT_REMOTE_DISPLAY_NAME: 'Participant',
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
        FILM_STRIP_MAX_HEIGHT: 120,
        MOBILE_APP_PROMO: false
      },
      userInfo: {
        displayName: displayName
      }
    };

    jitsiApi = new (window as any).JitsiMeetExternalAPI(domain, options);

    jitsiApi.addEventListener('videoConferenceJoined', () => {
      console.log('✅ Joined video call');
      isInCall = true;
    });

    jitsiApi.addEventListener('videoConferenceLeft', () => {
      console.log('👋 Left video call');
      endCall();
    });

    jitsiApi.addEventListener('readyToClose', () => {
      endCall();
    });
  }

  function endCall() {
    if (jitsiApi) {
      jitsiApi.dispose();
      jitsiApi = null;
    }
    isInCall = false;
    isMinimized = false;
  }

  function toggleMinimize() {
    isMinimized = !isMinimized;
  }
</script>

{#if isFullscreen && isInCall}
  <!-- Fullscreen mode - show in corner -->
  {#if !isMinimized}
    <div class="fixed bottom-4 right-4 z-50 w-100 h-75 transition-all duration-300">
      <div class="bg-black rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl h-full flex flex-col">
        <div class="bg-black/90 px-3 py-2 flex items-center justify-between border-b border-white/10">
          <span class="text-white text-sm font-medium">Video Call</span>
          <div class="flex gap-2">
            <button 
              onclick={toggleMinimize} 
              class="text-white/60 hover:text-white transition p-1 rounded hover:bg-white/10"
              title="Minimize"
            >
              <Minimize2 class="w-4 h-4" />
            </button>
            <button 
              onclick={endCall} 
              class="text-red-400 hover:text-red-300 transition p-1 rounded hover:bg-red-500/10"
              title="End call"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>
        <div bind:this={jitsiContainer} class="flex-1 bg-black"></div>
      </div>
    </div>
  {:else}
    <!-- Minimized in fullscreen -->
    <div class="fixed bottom-4 right-4 z-50">
      <button
        onclick={toggleMinimize}
        class="bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-2xl transition-all hover:scale-110 border-2 border-white/20"
        title="Show video call"
      >
        <Maximize2 class="w-6 h-6" />
      </button>
    </div>
  {/if}
{:else if !isFullscreen && isInCall}
  <!-- Non-fullscreen mode - show normally -->
  <div class="space-y-3">
    <div class="text-text-secondary text-sm text-center flex items-center justify-between">
      <span>Video Call Active</span>
      <button
        onclick={endCall}
        class="text-red-400 hover:text-red-300 text-sm transition"
      >
        End Call
      </button>
    </div>

    <div class="bg-black rounded-xl overflow-hidden border border-border" style="height: 400px;">
      <div bind:this={jitsiContainer} class="w-full h-full"></div>
    </div>
  </div>
{:else if !isInCall}
  <!-- Not in call - show start button -->
  <button
    onclick={startCall}
    class="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 font-medium"
  >
    <Phone class="w-4 h-4" />
    Start Video Call
  </button>
{/if}
