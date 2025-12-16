<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { roomStore } from '$lib/stores/room.svelte';
  import { supabase } from '$lib/supabase';
  import IncomingCallNotification from '../video-call/IncomingCallNotification.svelte';
  import { Phone, Minimize2, Maximize2, X } from 'lucide-svelte';

  let { isFullscreen = false } = $props<{ isFullscreen?: boolean }>();

  interface CallInvitation {
    from: string;
    fromName: string;
    timestamp: number;
  }

  let isInCall = $state(false);
  let isMinimized = $state(false);
  let jitsiContainer: HTMLDivElement | undefined = $state(undefined);
  let jitsiApi: any = null;
  let isJitsiLoaded = $state(false);
  let isLoading = $state(false);
  let incomingCall = $state<CallInvitation | null>(null);
  let callChannel: any;

  const roomName = $derived(`syncwatch-${roomStore.currentRoom?.id || 'default'}`);
  const displayName = $derived(
    authStore.profile?.display_name || 
    authStore.user?.email?.split('@')[0] || 
    'Guest'
  );

  onMount(() => {
    loadJitsiScript();
    setupCallChannel();
  });

  onDestroy(() => {
    if (jitsiApi) {
      try {
        jitsiApi.dispose();
      } catch (e) {
        console.log('Jitsi already disposed');
      }
      jitsiApi = null;
    }
    if (callChannel) {
      supabase.removeChannel(callChannel);
    }
  });

  function setupCallChannel() {
    if (!roomStore.currentRoom) return;

    callChannel = supabase
      .channel(`call:${roomStore.currentRoom.id}`)
      .on('broadcast', { event: 'call-invitation' }, (payload) => {
        handleCallInvitation(payload.payload);
      })
      .subscribe();
  }

  function handleCallInvitation(invitation: CallInvitation) {
    if (invitation.from === authStore.user?.id) return;
    if (isInCall) return;
    
    console.log('📞 Incoming call from:', invitation.fromName);
    incomingCall = invitation;
    
    setTimeout(() => {
      if (incomingCall?.timestamp === invitation.timestamp) {
        incomingCall = null;
      }
    }, 30000);
  }

  function loadJitsiScript() {
    if ((window as any).JitsiMeetExternalAPI) {
      console.log('✅ Jitsi API already loaded');
      isJitsiLoaded = true;
      return;
    }

    console.log('📦 Loading Jitsi script...');
    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => {
      console.log('✅ Jitsi script loaded');
      isJitsiLoaded = true;
    };
    script.onerror = () => {
      console.error('❌ Failed to load Jitsi script');
      alert('Failed to load video call. Please check your internet connection.');
    };
    document.head.appendChild(script);
  }

  async function startCall() {
    if (callChannel) {
      await callChannel.send({
        type: 'broadcast',
        event: 'call-invitation',
        payload: {
          from: authStore.user?.id,
          fromName: authStore.profile?.display_name || authStore.user?.email || 'Someone',
          timestamp: Date.now()
        }
      });
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    await joinCall();
  }

  async function joinCall() {
    if (isInCall || isLoading) {
      console.log('Already in call or loading');
      return;
    }

    if (!isJitsiLoaded) {
      alert('Video call is still loading. Please wait a moment and try again.');
      return;
    }

    isInCall = true;
    isLoading = true;
    incomingCall = null;

    await new Promise(resolve => setTimeout(resolve, 100));

    if (!jitsiContainer) {
      console.error('❌ Jitsi container not ready after waiting');
      alert('Video call container not ready. Please try again.');
      isInCall = false;
      isLoading = false;
      return;
    }

    console.log('🎥 Starting video call...');

    try {
      const domain = 'meet.jit.si';
      
      const options = {
        roomName: roomName,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainer,
        configOverwrite: {
          // Basic video settings
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          enableWelcomePage: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          
          // Conference settings
          hideConferenceSubject: false,
          hideConferenceTimer: false,
          enableNoisyMicDetection: true,
          resolution: 720,
          constraints: {
            video: {
              height: { ideal: 720, max: 1080, min: 360 }
            }
          },
          
          // CRITICAL: Disable ALL authentication and moderation features
          enableUserRolesBasedOnToken: true,
          enableLobby: false,
          enableLobbyChat: false,
          hideAddRoomButton: false,
          
          // Disable self-view options that might trigger auth
          disableSelfView: false,
          disableSelfViewSettings: false,
          
          // Guest mode settings
          startAudioOnly: false,
          requireDisplayName: false,
          enableInsecureRoomNameWarning: false,
          
          // ENABLE authentication dialogs
          disableInviteFunctions: false,
          doNotStoreRoom: false,
          enableForcedReload: true,
          
          // Features that require authentication
          disableProfile: false,
          hideLobbyButton: false,
          hideParticipantsStats: false,
          
          // Audio detection
          enableNoAudioDetection: true,
          
          // Disable recording (requires auth)
          fileRecordingsEnabled: false,
          liveStreamingEnabled: false,
          
          // P2P mode (no server moderation)
          p2p: {
            enabled: true,
            preferH264: true,
            disableH264: false,
            useStunTurn: true
          }
        },
        interfaceConfigOverwrite: {
          // Toolbar with only basic controls
          TOOLBAR_BUTTONS: [
            'microphone', 
            'camera', 
            'desktop', 
            'fullscreen',
            'fodeviceselection', 
            'hangup', 
            'chat',
            'raisehand', 
            'videoquality', 
            'filmstrip',
            'tileview', 
            'videobackgroundblur', 
            'settings'
          ],
          
          SETTINGS_SECTIONS: ['devices', 'language'],
          
          // Hide branding and watermarks
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          
          // Display settings
          DEFAULT_REMOTE_DISPLAY_NAME: 'Participant',
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
          FILM_STRIP_MAX_HEIGHT: 120,
          
          // Disable promotional content
          MOBILE_APP_PROMO: false,
          DISABLE_PRESENCE_STATUS: false,
          
          // Hide invite features (can trigger auth)
          HIDE_INVITE_MORE_HEADER: true,
          
          // Disable ringing
          DISABLE_RINGING: true,
          
          // Audio level colors
          AUDIO_LEVEL_PRIMARY_COLOR: 'rgba(167, 139, 250, 0.8)',
          AUDIO_LEVEL_SECONDARY_COLOR: 'rgba(167, 139, 250, 0.4)',
          
          // Branding
          POLICY_LOGO: null,
          PROVIDER_NAME: 'SyncWatch',
          
          // Toolbar settings
          TOOLBAR_ALWAYS_VISIBLE: false,
          DEFAULT_BACKGROUND: '#1a1a1a',
          DISABLE_VIDEO_BACKGROUND: false,
          INITIAL_TOOLBAR_TIMEOUT: 20000,
          TOOLBAR_TIMEOUT: 4000,
          VERTICAL_FILMSTRIP: false,
          
          // Disable all login/auth buttons
          HIDE_DEEP_LINKING_LOGO: false,
          DISABLE_TRANSCRIPTION_SUBTITLES: true,
          
          // Video layout
          VIDEO_LAYOUT_FIT: 'both'
        },
        userInfo: {
          displayName: displayName
        }
      };

      console.log('🔧 Initializing Jitsi with options:', { roomName, displayName });
      jitsiApi = new (window as any).JitsiMeetExternalAPI(domain, options);

      // Event listeners
      jitsiApi.addEventListener('videoConferenceJoined', (data: any) => {
        console.log('✅ Joined video call:', data);
        isLoading = false;
      });

      jitsiApi.addEventListener('videoConferenceLeft', () => {
        console.log('👋 Left video call');
        endCall();
      });

      jitsiApi.addEventListener('readyToClose', () => {
        console.log('🚪 Ready to close');
        endCall();
      });

      jitsiApi.addEventListener('participantJoined', (data: any) => {
        console.log('👤 Participant joined:', data);
      });

      // Handle errors
      jitsiApi.addEventListener('errorOccurred', (error: any) => {
        console.error('Jitsi error:', error);
        if (error.error === 'conference.connectionError') {
          alert('Connection error. Please check your internet and try again.');
          endCall();
        }
      });

      setTimeout(() => {
        if (isLoading) {
          console.log('⏰ Timeout - assuming call started');
          isLoading = false;
        }
      }, 5000);

    } catch (error) {
      console.error('❌ Error starting call:', error);
      alert('Failed to start video call. Please try again.');
      isLoading = false;
      endCall();
    }
  }

  function declineCall() {
    console.log('❌ Call declined');
    incomingCall = null;
  }

  function endCall() {
    if (jitsiApi) {
      try {
        jitsiApi.dispose();
      } catch (e) {
        console.log('Error disposing Jitsi:', e);
      }
      jitsiApi = null;
    }
    isInCall = false;
    isMinimized = false;
    isLoading = false;
  }

  function toggleMinimize() {
    isMinimized = !isMinimized;
  }
</script>

<!-- Incoming Call Notification -->
{#if incomingCall && !isInCall}
  <IncomingCallNotification 
    callerName={incomingCall.fromName}
    onJoin={joinCall}
    onDecline={declineCall}
  />
{/if}

{#if isInCall}
  {#if isFullscreen}
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
          <div bind:this={jitsiContainer} class="flex-1 bg-black">
            {#if isLoading}
              <div class="w-full h-full flex items-center justify-center">
                <div class="text-white text-sm flex flex-col items-center gap-2">
                  <div class="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Connecting...</span>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <div class="fixed bottom-4 right-4 z-50">
        <button
          onclick={toggleMinimize}
          class="bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-2xl transition-all hover:scale-110 border-2 border-white/20"
          title="Show video call"
        >
          <Maximize2 class="w-6 h-6" />
        </button>
      </div>
      <div class="hidden">
        <div bind:this={jitsiContainer}></div>
      </div>
    {/if}
  {:else}
    <div class="space-y-3">
      <div class="text-text-secondary text-sm text-center flex items-center justify-between">
        <span>Video Call Active</span>
        <button
          onclick={endCall}
          class="text-red-400 hover:text-red-300 text-sm transition font-medium px-3 py-1 rounded bg-red-500/10 hover:bg-red-500/20"
        >
          End Call
        </button>
      </div>

      <div class="bg-black rounded-xl overflow-hidden border border-border" style="height: 500px;">
        <div bind:this={jitsiContainer} class="w-full h-full">
          {#if isLoading}
            <div class="w-full h-full flex items-center justify-center">
              <div class="text-white text-sm flex flex-col items-center gap-2">
                <div class="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Connecting...</span>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
{:else}
  <button
    onclick={startCall}
    disabled={isLoading || !isJitsiLoaded}
    class="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg transition flex items-center justify-center gap-2 font-medium shadow-lg hover:shadow-green-500/50"
  >
    {#if isLoading}
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Starting...</span>
    {:else if !isJitsiLoaded}
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Loading...</span>
    {:else}
      <Phone class="w-4 h-4" />
      <span>Start Video Call</span>
    {/if}
  </button>
{/if}
