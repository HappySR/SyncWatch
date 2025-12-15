<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { roomStore } from '$lib/stores/room.svelte';
  import { supabase } from '$lib/supabase';
  import VideoGrid from './VideoGrid.svelte';
  import VideoControls from './VideoControls.svelte';
  import IncomingCallNotification from './IncomingCallNotification.svelte';
  import { Phone, Minimize2 } from 'lucide-svelte';

  let { isFullscreen = false } = $props<{ isFullscreen?: boolean }>();

  interface CallInvitation {
    from: string;
    fromName: string;
    timestamp: number;
  }

  let localStream: MediaStream | null = $state(null);
  let peerConnections = $state<Map<string, RTCPeerConnection>>(new Map());
  let remoteStreams = $state<Map<string, MediaStream>>(new Map());
  let isMicOn = $state(false);
  let isVideoOn = $state(false);
  let isInCall = $state(false);
  let activeSpeaker = $state<string | null>(null);
  let isMinimized = $state(false);
  let incomingCall = $state<CallInvitation | null>(null);
  let usersInCall = $state<Set<string>>(new Set());
  let channel: any;

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  let audioContexts = $state<Map<string, AudioContext>>(new Map());

  onMount(() => {
    setupCallChannel();
  });

  onDestroy(() => {
    endCall();
    if (channel) {
      channel.unsubscribe();
    }
  });

  function setupCallChannel() {
    if (!roomStore.currentRoom) return;

    channel = supabase
      .channel(`call:${roomStore.currentRoom.id}`)
      .on('broadcast', { event: 'webrtc-signal' }, handleWebRTCSignal)
      .on('broadcast', { event: 'call-invitation' }, handleCallInvitation)
      .on('broadcast', { event: 'call-status' }, handleCallStatus)
      .on('broadcast', { event: 'request-call-status' }, handleCallStatusRequest)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel?.send({
            type: 'broadcast',
            event: 'request-call-status',
            payload: { requesterId: authStore.user?.id }
          });
        }
      });
  }

  async function startCall() {
    try {
      if (channel) {
        await channel.send({
          type: 'broadcast',
          event: 'call-invitation',
          payload: {
            from: authStore.user?.id,
            fromName: authStore.profile?.display_name || authStore.user?.email || 'Someone',
            timestamp: Date.now()
          }
        });
      }
      await joinCall();
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Could not start call. Please check permissions.');
    }
  }

  async function joinCall() {
    try {
      // Request with fallback for background
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      });

      isMicOn = true;
      isVideoOn = true;
      isInCall = true;
      incomingCall = null;
      usersInCall.add(authStore.user?.id || '');

      monitorAudioLevels(localStream, authStore.user?.id || '');

      if (channel) {
        await channel.send({
          type: 'broadcast',
          event: 'call-status',
          payload: {
            type: 'user-joined-call',
            userId: authStore.user?.id,
            userName: authStore.profile?.display_name || authStore.user?.email
          }
        });

        await channel.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'user-joined',
            userId: authStore.user?.id
          }
        });
      }

      usersInCall.forEach(userId => {
        if (userId !== authStore.user?.id) {
          createPeerConnection(userId);
        }
      });
    } catch (error) {
      console.error('Error joining call:', error);
      alert('Could not access camera/microphone. Please check permissions.');
      isInCall = false;
    }
  }

  function handleCallInvitation(payload: any) {
    const invitation = payload.payload as CallInvitation;
    if (invitation.from === authStore.user?.id || isInCall) return;
    
    incomingCall = invitation;
    setTimeout(() => {
      if (incomingCall?.timestamp === invitation.timestamp) {
        incomingCall = null;
      }
    }, 30000);
  }

  function handleCallStatus(payload: any) {
    const status = payload.payload;

    switch (status.type) {
      case 'user-joined-call':
        if (status.userId !== authStore.user?.id) {
          usersInCall.add(status.userId);
          usersInCall = new Set(usersInCall);
          if (isInCall) createPeerConnection(status.userId);
        }
        break;

      case 'user-left-call':
        usersInCall.delete(status.userId);
        usersInCall = new Set(usersInCall);
        const existingPc = peerConnections.get(status.userId);
        if (existingPc) {
          existingPc.close();
          peerConnections.delete(status.userId);
        }
        remoteStreams.delete(status.userId);
        remoteStreams = new Map(remoteStreams);
        break;
    }
  }

  function handleCallStatusRequest(payload: any) {
    const request = payload.payload;
    if (isInCall && request.requesterId !== authStore.user?.id && channel) {
      channel.send({
        type: 'broadcast',
        event: 'call-invitation',
        payload: {
          from: authStore.user?.id,
          fromName: authStore.profile?.display_name || authStore.user?.email || 'Someone',
          timestamp: Date.now()
        }
      });
    }
  }

  function declineCall() {
    incomingCall = null;
  }

  function endCall() {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
    remoteStreams.clear();

    isMicOn = false;
    isVideoOn = false;
    isInCall = false;
    activeSpeaker = null;
    usersInCall.delete(authStore.user?.id || '');

    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'call-status',
        payload: { type: 'user-left-call', userId: authStore.user?.id }
      });

      channel.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: { type: 'user-left', userId: authStore.user?.id }
      });
    }

    audioContexts.forEach(context => context.close());
    audioContexts.clear();
  }

  function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      isMicOn = audioTrack.enabled;
    }
  }

  function toggleVideo() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      isVideoOn = videoTrack.enabled;
    }
  }

  function monitorAudioLevels(stream: MediaStream, userId: string) {
    try {
      const existingContext = audioContexts.get(userId);
      if (existingContext) existingContext.close();

      const audioContext = new AudioContext();
      audioContexts.set(userId, audioContext);
      
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;
      microphone.connect(analyser);

      function checkAudioLevel() {
        if (!isInCall) {
          audioContext.close();
          audioContexts.delete(userId);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        if (average > 30) activeSpeaker = userId;
        requestAnimationFrame(checkAudioLevel);
      }

      checkAudioLevel();
    } catch (error) {
      console.error('Error monitoring audio:', error);
    }
  }

  async function createPeerConnection(userId: string) {
    if (peerConnections.has(userId) || !localStream) return;

    const peerConnection = new RTCPeerConnection({ iceServers });

    peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStreams.set(userId, event.streams[0]);
        remoteStreams = new Map(remoteStreams);
        monitorAudioLevels(event.streams[0], userId);
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && channel) {
        channel.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'ice-candidate',
            candidate: event.candidate,
            to: userId,
            from: authStore.user?.id
          }
        });
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${userId}:`, peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'failed') {
        console.log('ICE connection failed, restarting...');
        peerConnection.restartIce();
      } else if (peerConnection.iceConnectionState === 'disconnected') {
        console.log('ICE connection disconnected');
      }
    };

    peerConnection.onnegotiationneeded = async () => {
      console.log('Negotiation needed for', userId);
    };

    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
      console.log(`Adding ${track.kind} track to peer connection for ${userId}`);
      const sender = peerConnection.addTrack(track, localStream!);
      console.log('Track added:', sender);
    });

    peerConnections.set(userId, peerConnection);

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.setLocalDescription(offer);

      if (channel) {
        await channel.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'offer',
            offer: peerConnection.localDescription,
            to: userId,
            from: authStore.user?.id
          }
        });
      }
    } catch (error) {
      console.error('Error creating offer:', error);
      peerConnection.close();
      peerConnections.delete(userId);
    }
  }
  
  async function handleWebRTCSignal(payload: any) {
    const { type, userId, to, from, offer, answer, candidate } = payload.payload;
    if (from === authStore.user?.id || (to && to !== authStore.user?.id)) return;

    try {
      switch (type) {
        case 'user-joined':
          if (isInCall && userId !== authStore.user?.id) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for other peer to be ready
            createPeerConnection(userId);
          }
          break;

        case 'user-left':
          const leftPc = peerConnections.get(userId);
          if (leftPc) {
            leftPc.close();
            peerConnections.delete(userId);
          }
          remoteStreams.delete(userId);
          remoteStreams = new Map(remoteStreams);
          break;

        case 'offer':
          if (!isInCall) return;
          
          console.log('Received offer from:', from);
          
          let existingOfferPc = peerConnections.get(from);
          if (existingOfferPc) {
            existingOfferPc.close();
            peerConnections.delete(from);
          }

          const newPeerConnection = new RTCPeerConnection({ iceServers });

          // Add local tracks FIRST before setting remote description
          if (localStream) {
            localStream.getTracks().forEach(track => {
              console.log(`Adding ${track.kind} track to answer peer connection for ${from}`);
              newPeerConnection.addTrack(track, localStream!);
            });
          }

          newPeerConnection.ontrack = (event) => {
            console.log('Received track from:', from, event.track.kind);
            if (event.streams && event.streams[0]) {
              remoteStreams.set(from, event.streams[0]);
              remoteStreams = new Map(remoteStreams);
              monitorAudioLevels(event.streams[0], from);
            }
          };

          newPeerConnection.onicecandidate = (event) => {
            if (event.candidate && channel) {
              channel.send({
                type: 'broadcast',
                event: 'webrtc-signal',
                payload: {
                  type: 'ice-candidate',
                  candidate: event.candidate,
                  to: from,
                  from: authStore.user?.id
                }
              });
            }
          };

          newPeerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state for ${from}:`, newPeerConnection.iceConnectionState);
            if (newPeerConnection.iceConnectionState === 'failed') {
              newPeerConnection.restartIce();
            }
          };

          peerConnections.set(from, newPeerConnection);

          await newPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          const answerDesc = await newPeerConnection.createAnswer();
          await newPeerConnection.setLocalDescription(answerDesc);

          console.log('Sending answer to:', from);
          if (channel) {
            await channel.send({
              type: 'broadcast',
              event: 'webrtc-signal',
              payload: {
                type: 'answer',
                answer: answerDesc,
                to: from,
                from: authStore.user?.id
              }
            });
          }
          break;

        case 'answer':
          console.log('Received answer from:', from);
          const answerPc = peerConnections.get(from);
          if (answerPc && answerPc.signalingState !== 'stable') {
            await answerPc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Answer applied for:', from);
          }
          break;

        case 'ice-candidate':
          const candidatePc = peerConnections.get(from);
          if (candidatePc && candidate) {
            if (candidatePc.remoteDescription) {
              await candidatePc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log('ICE candidate added for:', from);
            } else {
              console.log('Waiting for remote description before adding ICE candidate');
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error handling WebRTC signal:', error);
    }
  }
</script>

<IncomingCallNotification 
  {incomingCall}
  {isInCall}
  onJoin={joinCall}
  onDecline={declineCall}
/>

{#if isFullscreen && isInCall}
  {#if !isMinimized}
    <div class="fixed bottom-4 right-4 z-50 w-96 transition-all duration-300">
      <div class="bg-black/90 backdrop-blur-md rounded-xl overflow-hidden border border-white/20 shadow-2xl">
        <div class="p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-white text-sm font-medium">Call ({usersInCall.size})</span>
            <div class="flex gap-2">
              <button 
                onclick={() => isMinimized = true} 
                class="text-white/60 hover:text-white transition p-1"
                title="Minimize"
              >
                <Minimize2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <VideoGrid 
            {localStream}
            {remoteStreams}
            {activeSpeaker}
            currentUserId={authStore.user?.id || ''}
            compact={true}
            isDraggable={false}
          />

          <VideoControls
            {isMicOn}
            {isVideoOn}
            onToggleMic={toggleMic}
            onToggleVideo={toggleVideo}
            onEndCall={endCall}
          />
        </div>
      </div>
    </div>
  {:else}
    <!-- Minimized video call - draggable -->
    <VideoGrid 
      {localStream}
      {remoteStreams}
      {activeSpeaker}
      currentUserId={authStore.user?.id || ''}
      compact={true}
      isDraggable={true}
      onMaximize={() => isMinimized = false}
    />
  {/if}
{:else if !isFullscreen && isInCall}
  <div class="space-y-3">
    <div class="text-text-secondary text-sm text-center">
      {usersInCall.size} {usersInCall.size === 1 ? 'person' : 'people'} in call
    </div>

    <VideoGrid 
      {localStream}
      {remoteStreams}
      {activeSpeaker}
      currentUserId={authStore.user?.id || ''}
    />

    <VideoControls
      {isMicOn}
      {isVideoOn}
      onToggleMic={toggleMic}
      onToggleVideo={toggleVideo}
      onEndCall={endCall}
    />
  </div>
{:else if !isInCall}
  <button
    onclick={startCall}
    class="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition flex items-center justify-center gap-2"
  >
    <Phone class="w-4 h-4" />
    Start Video Call
  </button>
{/if}
