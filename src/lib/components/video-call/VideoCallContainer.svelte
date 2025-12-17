<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { roomStore } from '$lib/stores/room.svelte';
  import { supabase } from '$lib/supabase';
  import IncomingCallNotification from '../video-call/IncomingCallNotification.svelte';
  import { 
    Phone, 
    Minimize2, 
    Maximize2, 
    X, 
    Mic, 
    MicOff, 
    Video, 
    VideoOff,
    Monitor,
    MonitorOff,
    Users,
    Settings
  } from 'lucide-svelte';
  import AgoraRTC, { 
    type IAgoraRTCClient, 
    type ICameraVideoTrack, 
    type IMicrophoneAudioTrack,
    type IRemoteVideoTrack,
    type IRemoteAudioTrack
  } from 'agora-rtc-sdk-ng';
  import { PUBLIC_AGORA_APP_ID } from '$env/static/public';

  let { isFullscreen = false } = $props<{ isFullscreen?: boolean }>();

  interface CallInvitation {
    from: string;
    fromName: string;
    timestamp: number;
  }

  interface RemoteUser {
    uid: string;
    videoTrack?: IRemoteVideoTrack;
    audioTrack?: IRemoteAudioTrack;
    displayName?: string;
  }

  let isInCall = $state(false);
  let isMinimized = $state(false);
  let isLoading = $state(false);
  let incomingCall = $state<CallInvitation | null>(null);
  let callChannel: any;

  // Agora states
  let agoraClient: IAgoraRTCClient | null = null;
  let localVideoTrack: ICameraVideoTrack | null = null;
  let localAudioTrack: IMicrophoneAudioTrack | null = null;
  let remoteUsers = $state<Map<string, RemoteUser>>(new Map());

  // UI states
  let isMuted = $state(false);
  let isVideoOff = $state(false);
  let isSharingScreen = $state(false);
  let showSettings = $state(false);
  let localVideoContainer: HTMLDivElement | undefined = $state(undefined);

  // Settings
  let selectedCamera = $state<string>('');
  let selectedMicrophone = $state<string>('');
  let cameras = $state<MediaDeviceInfo[]>([]);
  let microphones = $state<MediaDeviceInfo[]>([]);

  const channelName = $derived(`syncwatch-${roomStore.currentRoom?.id || 'default'}`);
  const displayName = $derived(
    authStore.profile?.display_name || 
    authStore.user?.email?.split('@')[0] || 
    'Guest'
  );

  onMount(async () => {
    setupCallChannel();
    await loadDevices();
  });

  onDestroy(async () => {
    await cleanup();
    if (callChannel) {
      supabase.removeChannel(callChannel);
    }
  });

  async function loadDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const devices = await AgoraRTC.getDevices();
      cameras = devices.filter(d => d.kind === 'videoinput');
      microphones = devices.filter(d => d.kind === 'audioinput');
      
      if (cameras.length > 0) selectedCamera = cameras[0].deviceId;
      if (microphones.length > 0) selectedMicrophone = microphones[0].deviceId;
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  }

  function setupCallChannel() {
    if (!roomStore.currentRoom) return;

    callChannel = supabase
      .channel(`call:${roomStore.currentRoom.id}`)
      .on('broadcast', { event: 'call-invitation' }, (payload) => {
        handleCallInvitation(payload.payload);
      })
      .on('broadcast', { event: 'user-display-name' }, (payload) => {
        const { uid, displayName: name } = payload.payload;
        const user = remoteUsers.get(uid);
        if (user) {
          user.displayName = name;
          remoteUsers.set(uid, user);
          remoteUsers = new Map(remoteUsers);
        }
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

  async function startCall() {
    if (callChannel) {
      await callChannel.send({
        type: 'broadcast',
        event: 'call-invitation',
        payload: {
          from: authStore.user?.id,
          fromName: displayName,
          timestamp: Date.now()
        }
      });
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    await joinCall();
  }

  async function getAgoraToken(channelName: string, uid: string): Promise<string> {
    try {
      console.log('🔑 Fetching Agora token from server...');
      const response = await fetch('/api/agora-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: Send cookies
        body: JSON.stringify({ channelName, uid })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get token');
      }

      const data = await response.json();
      console.log('✅ Token received');
      return data.token;
    } catch (error) {
      console.error('❌ Token fetch error:', error);
      throw new Error('Failed to get authentication token. Please try again.');
    }
  }

  async function joinCall() {
    if (isInCall || isLoading) return;

    isInCall = true;
    isLoading = true;
    incomingCall = null;

    try {
      // Initialize Agora client
      agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      // Set up event listeners
      agoraClient.on('user-published', handleUserPublished);
      agoraClient.on('user-unpublished', handleUserUnpublished);
      agoraClient.on('user-left', handleUserLeft);

      // Generate a numeric UID
      const numericUid = Math.floor(Math.random() * 1000000);
      
      // Get token from server
      const token = await getAgoraToken(channelName, String(numericUid));

      console.log('🎯 Joining channel:', channelName, 'with UID:', numericUid);

      // Join channel with token
      const uid = await agoraClient.join(
        PUBLIC_AGORA_APP_ID,
        channelName,
        token,
        numericUid
      );

      console.log('✅ Joined channel with UID:', uid);

      // Create and publish local tracks
      [localAudioTrack, localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
        {
          microphoneId: selectedMicrophone || undefined,
          encoderConfig: 'music_standard',
        },
        {
          cameraId: selectedCamera || undefined,
          encoderConfig: '720p_2',
        }
      );

      // Play local video
      if (localVideoContainer && localVideoTrack) {
        localVideoTrack.play(localVideoContainer);
      }

      // Publish tracks
      await agoraClient.publish([localAudioTrack, localVideoTrack]);

      // Broadcast display name
      if (callChannel) {
        await callChannel.send({
          type: 'broadcast',
          event: 'user-display-name',
          payload: {
            uid: String(uid),
            displayName: displayName
          }
        });
      }

      isLoading = false;
      console.log('✅ Successfully joined call');
    } catch (error: any) {
      console.error('❌ Error joining call:', error);
      const errorMessage = error.message || 'Failed to join call';
      alert(`Failed to join call: ${errorMessage}. Please check your permissions and try again.`);
      await cleanup();
      isInCall = false;
      isLoading = false;
    }
  }

  async function handleUserPublished(user: any, mediaType: 'audio' | 'video') {
    console.log('👤 User published:', user.uid, mediaType);
    
    await agoraClient?.subscribe(user, mediaType);

    const remoteUser = remoteUsers.get(String(user.uid)) || { uid: String(user.uid) };

    if (mediaType === 'video') {
      remoteUser.videoTrack = user.videoTrack;
      
      // Auto-play video in container
      setTimeout(() => {
        const container = document.getElementById(`remote-video-${user.uid}`);
        if (container && user.videoTrack) {
          user.videoTrack.play(container);
        }
      }, 100);
    }

    if (mediaType === 'audio') {
      remoteUser.audioTrack = user.audioTrack;
      user.audioTrack?.play();
    }

    remoteUsers.set(String(user.uid), remoteUser);
    remoteUsers = new Map(remoteUsers);
  }

  function handleUserUnpublished(user: any, mediaType: 'audio' | 'video') {
    console.log('👤 User unpublished:', user.uid, mediaType);
    
    const remoteUser = remoteUsers.get(String(user.uid));
    if (!remoteUser) return;

    if (mediaType === 'video') {
      remoteUser.videoTrack = undefined;
    }
    if (mediaType === 'audio') {
      remoteUser.audioTrack = undefined;
    }

    remoteUsers.set(String(user.uid), remoteUser);
    remoteUsers = new Map(remoteUsers);
  }

  function handleUserLeft(user: any) {
    console.log('👋 User left:', user.uid);
    remoteUsers.delete(String(user.uid));
    remoteUsers = new Map(remoteUsers);
  }

  async function toggleMute() {
    if (!localAudioTrack) return;
    
    if (isMuted) {
      await localAudioTrack.setEnabled(true);
      isMuted = false;
    } else {
      await localAudioTrack.setEnabled(false);
      isMuted = true;
    }
  }

  async function toggleVideo() {
    if (!localVideoTrack) return;
    
    if (isVideoOff) {
      await localVideoTrack.setEnabled(true);
      isVideoOff = false;
    } else {
      await localVideoTrack.setEnabled(false);
      isVideoOff = true;
    }
  }

  async function toggleScreenShare() {
    if (!agoraClient) return;

    try {
      if (!isSharingScreen) {
        // Start screen sharing
        const screenTrack = await AgoraRTC.createScreenVideoTrack({
          encoderConfig: '1080p_1',
        }, 'auto');

        // If screenTrack is an array (includes audio), handle it
        const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;

        // Unpublish camera
        if (localVideoTrack) {
          await agoraClient.unpublish(localVideoTrack);
          localVideoTrack.close();
        }

        // Publish screen
        await agoraClient.publish(videoTrack);
        
        if (localVideoContainer) {
          videoTrack.play(localVideoContainer);
        }

        // Handle screen share stop
        videoTrack.on('track-ended', async () => {
          await stopScreenShare();
        });

        localVideoTrack = videoTrack as ICameraVideoTrack;
        isSharingScreen = true;
      } else {
        await stopScreenShare();
      }
    } catch (error) {
      console.error('Screen share error:', error);
      alert('Failed to share screen. Please try again.');
    }
  }

  async function stopScreenShare() {
    if (!agoraClient || !localVideoTrack) return;

    // Stop screen track
    await agoraClient.unpublish(localVideoTrack);
    localVideoTrack.close();

    // Restart camera
    localVideoTrack = await AgoraRTC.createCameraVideoTrack({
      cameraId: selectedCamera || undefined,
      encoderConfig: '720p_2',
    });

    if (localVideoContainer) {
      localVideoTrack.play(localVideoContainer);
    }

    await agoraClient.publish(localVideoTrack);
    isSharingScreen = false;
  }

  async function changeCamera() {
    if (!localVideoTrack || !selectedCamera) return;
    await localVideoTrack.setDevice(selectedCamera);
  }

  async function changeMicrophone() {
    if (!localAudioTrack || !selectedMicrophone) return;
    await localAudioTrack.setDevice(selectedMicrophone);
  }

  function declineCall() {
    console.log('❌ Call declined');
    incomingCall = null;
  }

  async function endCall() {
    await cleanup();
    isInCall = false;
    isMinimized = false;
    isLoading = false;
  }

  async function cleanup() {
    // Close local tracks
    localAudioTrack?.close();
    localVideoTrack?.close();
    localAudioTrack = null;
    localVideoTrack = null;

    // Leave channel
    if (agoraClient) {
      await agoraClient.leave();
      agoraClient = null;
    }

    remoteUsers.clear();
    remoteUsers = new Map();
  }

  function toggleMinimize() {
    isMinimized = !isMinimized;
  }

  function toggleSettings() {
    showSettings = !showSettings;
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
      <div class="fixed bottom-4 right-4 z-50 w-100 transition-all duration-300" style="height: 500px;">
        <div class="bg-black rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl h-full flex flex-col">
          <!-- Header -->
          <div class="bg-black/90 px-3 py-2 flex items-center justify-between border-b border-white/10">
            <span class="text-white text-sm font-medium flex items-center gap-2">
              <Users class="w-4 h-4" />
              Video Call ({remoteUsers.size + 1})
            </span>
            <div class="flex gap-2">
              <button 
                onclick={toggleSettings}
                class="text-white/60 hover:text-white transition p-1 rounded hover:bg-white/10"
                title="Settings"
              >
                <Settings class="w-4 h-4" />
              </button>
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

          <!-- Video Grid -->
          <div class="flex-1 bg-black p-2 overflow-y-auto">
            <div class="grid grid-cols-2 gap-2 h-full">
              <!-- Local Video -->
              <div class="relative bg-gray-900 rounded-lg overflow-hidden">
                <div bind:this={localVideoContainer} class="w-full h-full"></div>
                <div class="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  You {isVideoOff ? '(Video Off)' : ''}
                </div>
              </div>

              <!-- Remote Videos -->
              {#each Array.from(remoteUsers.values()) as user (user.uid)}
                <div class="relative bg-gray-900 rounded-lg overflow-hidden">
                  <div id="remote-video-{user.uid}" class="w-full h-full"></div>
                  <div class="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                    {user.displayName || `User ${user.uid}`}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Controls -->
          <div class="bg-black/90 px-4 py-3 flex items-center justify-center gap-2 border-t border-white/10">
            <button
              onclick={toggleMute}
              class="p-3 rounded-full transition {isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/10 hover:bg-white/20'} text-white"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {#if isMuted}
                <MicOff class="w-5 h-5" />
              {:else}
                <Mic class="w-5 h-5" />
              {/if}
            </button>

            <button
              onclick={toggleVideo}
              class="p-3 rounded-full transition {isVideoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-white/10 hover:bg-white/20'} text-white"
              title={isVideoOff ? 'Turn on video' : 'Turn off video'}
            >
              {#if isVideoOff}
                <VideoOff class="w-5 h-5" />
              {:else}
                <Video class="w-5 h-5" />
              {/if}
            </button>

            <button
              onclick={toggleScreenShare}
              class="p-3 rounded-full transition {isSharingScreen ? 'bg-primary hover:bg-primary/90' : 'bg-white/10 hover:bg-white/20'} text-white"
              title={isSharingScreen ? 'Stop sharing' : 'Share screen'}
            >
              {#if isSharingScreen}
                <MonitorOff class="w-5 h-5" />
              {:else}
                <Monitor class="w-5 h-5" />
              {/if}
            </button>
          </div>

          <!-- Settings Panel -->
          {#if showSettings}
            <div class="absolute inset-0 bg-black/95 z-10 flex items-center justify-center p-4">
              <div class="bg-gray-900 rounded-xl p-6 max-w-md w-full space-y-4">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-white font-semibold">Call Settings</h3>
                  <button onclick={toggleSettings} class="text-white/60 hover:text-white">
                    <X class="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <label class="text-white text-sm mb-2 block">Camera</label>
                  <select 
                    bind:value={selectedCamera}
                    onchange={changeCamera}
                    class="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm"
                  >
                    {#each cameras as camera}
                      <option value={camera.deviceId}>{camera.label || `Camera ${camera.deviceId.slice(0, 8)}`}</option>
                    {/each}
                  </select>
                </div>

                <div>
                  <label class="text-white text-sm mb-2 block">Microphone</label>
                  <select 
                    bind:value={selectedMicrophone}
                    onchange={changeMicrophone}
                    class="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm"
                  >
                    {#each microphones as mic}
                      <option value={mic.deviceId}>{mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`}</option>
                    {/each}
                  </select>
                </div>
              </div>
            </div>
          {/if}
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
        <div bind:this={localVideoContainer}></div>
      </div>
    {/if}
  {:else}
    <!-- Non-fullscreen view -->
    <div class="space-y-3">
      <div class="text-text-secondary text-sm text-center flex items-center justify-between">
        <span class="flex items-center gap-2">
          <Users class="w-4 h-4" />
          Video Call Active ({remoteUsers.size + 1})
        </span>
        <button
          onclick={endCall}
          class="text-red-400 hover:text-red-300 text-sm transition font-medium px-3 py-1 rounded bg-red-500/10 hover:bg-red-500/20"
        >
          End Call
        </button>
      </div>

      <div class="bg-black rounded-xl overflow-hidden border border-border" style="height: 400px;">
        <!-- Video Grid -->
        <div class="p-2 h-full overflow-y-auto">
          <div class="grid grid-cols-2 gap-2">
            <!-- Local Video -->
            <div class="relative bg-gray-900 rounded-lg overflow-hidden h-48">
              <div bind:this={localVideoContainer} class="w-full h-full"></div>
              <div class="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                You {isVideoOff ? '(Video Off)' : ''}
              </div>
            </div>

            <!-- Remote Videos -->
            {#each Array.from(remoteUsers.values()) as user (user.uid)}
              <div class="relative bg-gray-900 rounded-lg overflow-hidden h-48">
                <div id="remote-video-{user.uid}" class="w-full h-full"></div>
                <div class="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  {user.displayName || `User ${user.uid}`}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center justify-center gap-2">
        <button
          onclick={toggleMute}
          class="p-2 rounded-lg transition {isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-surface-hover hover:bg-surface'} text-white"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {#if isMuted}
            <MicOff class="w-4 h-4" />
          {:else}
            <Mic class="w-4 h-4" />
          {/if}
        </button>

        <button
          onclick={toggleVideo}
          class="p-2 rounded-lg transition {isVideoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-surface-hover hover:bg-surface'} text-white"
          title={isVideoOff ? 'Turn on video' : 'Turn off video'}
        >
          {#if isVideoOff}
            <VideoOff class="w-4 h-4" />
          {:else}
            <Video class="w-4 h-4" />
          {/if}
        </button>

        <button
          onclick={toggleScreenShare}
          class="p-2 rounded-lg transition {isSharingScreen ? 'bg-primary hover:bg-primary/90' : 'bg-surface-hover hover:bg-surface'} text-white"
          title={isSharingScreen ? 'Stop sharing' : 'Share screen'}
        >
          {#if isSharingScreen}
            <MonitorOff class="w-4 h-4" />
          {:else}
            <Monitor class="w-4 h-4" />
          {/if}
        </button>

        <button
          onclick={toggleSettings}
          class="p-2 rounded-lg transition bg-surface-hover hover:bg-surface text-white"
          title="Settings"
        >
          <Settings class="w-4 h-4" />
        </button>
      </div>

      <!-- Settings Panel -->
      {#if showSettings}
        <div class="bg-surface-hover rounded-lg p-4 space-y-3">
          <div>
            <label class="text-text-secondary text-xs mb-1 block">Camera</label>
            <select 
              bind:value={selectedCamera}
              onchange={changeCamera}
              class="w-full bg-input text-text-primary rounded px-2 py-1 text-sm"
            >
              {#each cameras as camera}
                <option value={camera.deviceId}>{camera.label || `Camera ${camera.deviceId.slice(0, 8)}`}</option>
              {/each}
            </select>
          </div>

          <div>
            <label class="text-text-secondary text-xs mb-1 block">Microphone</label>
            <select 
              bind:value={selectedMicrophone}
              onchange={changeMicrophone}
              class="w-full bg-input text-text-primary rounded px-2 py-1 text-sm"
            >
              {#each microphones as mic}
                <option value={mic.deviceId}>{mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`}</option>
              {/each}
            </select>
          </div>
        </div>
      {/if}
    </div>
  {/if}
{:else}
  <button
    onclick={startCall}
    disabled={isLoading}
    class="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg transition flex items-center justify-center gap-2 font-medium shadow-lg hover:shadow-green-500/50"
  >
    {#if isLoading}
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Starting...</span>
    {:else}
      <Phone class="w-4 h-4" />
      <span>Start Video Call</span>
    {/if}
  </button>
{/if}
