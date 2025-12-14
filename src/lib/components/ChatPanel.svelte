<script lang="ts">
  import { roomStore } from '$lib/stores/room.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { supabase } from '$lib/supabase';
  import { onMount, onDestroy } from 'svelte';
  import { Send, Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Minimize2 } from 'lucide-svelte';

  let { isFullscreen = false } = $props<{ isFullscreen?: boolean }>();

  interface ChatMessage {
    id: string;
    room_id: string;
    user_id: string;
    message: string;
    created_at: string;
    profiles?: {
      display_name: string;
      avatar_url: string;
    };
  }

  let messages = $state<ChatMessage[]>([]);
  let newMessage = $state('');
  let chatContainer: HTMLDivElement | undefined;
  let channel: any;

  // WebRTC state
  let localStream: MediaStream | null = null;
  let peerConnections = $state<Map<string, RTCPeerConnection>>(new Map());
  let remoteStreams = $state<Map<string, MediaStream>>(new Map());
  let isMicOn = $state(false);
  let isVideoOn = $state(false);
  let isInCall = $state(false);
  let localVideoElement: HTMLVideoElement | undefined;
  let remoteVideosContainer: HTMLDivElement | undefined;
  let activeSpeaker = $state<string | null>(null);
  let isMinimized = $state(false);

  onMount(async () => {
    await loadMessages();
    subscribeToChat();
  });

  onDestroy(() => {
    if (channel) {
      supabase.removeChannel(channel);
    }
    endCall();
  });

  async function loadMessages() {
    if (!roomStore.currentRoom) return;

    const { data, error } = await supabase
      .from('chat_messages')
      .select(`
        *,
        profiles (
          display_name,
          avatar_url
        )
      `)
      .eq('room_id', roomStore.currentRoom.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) {
      messages = data as ChatMessage[];
      setTimeout(scrollToBottom, 100);
    }
  }

  function subscribeToChat() {
    if (!roomStore.currentRoom) return;

    channel = supabase
      .channel(`chat:${roomStore.currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomStore.currentRoom.id}`
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', newMsg.user_id)
            .single();

          if (profile) {
            newMsg.profiles = profile;
          }

          messages = [...messages, newMsg];
          setTimeout(scrollToBottom, 100);
        }
      )
      .on('broadcast', { event: 'webrtc-signal' }, handleWebRTCSignal)
      .subscribe();
  }

  async function sendMessage() {
    if (!newMessage.trim() || !roomStore.currentRoom || !authStore.user) return;

    const { error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: roomStore.currentRoom.id,
        user_id: authStore.user.id,
        message: newMessage.trim()
      });

    if (!error) {
      newMessage = '';
    }
  }

  function scrollToBottom() {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }

  async function startCall() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      isMicOn = true;
      isVideoOn = true;
      isInCall = true;

      // Wait for the next tick to ensure DOM is updated
      await new Promise(resolve => setTimeout(resolve, 100));

      if (localVideoElement && localStream) {
        localVideoElement.srcObject = localStream;
        localVideoElement.muted = true;
        try {
          await localVideoElement.play();
          console.log('Local video started successfully');
        } catch (playError) {
          console.error('Error playing local video:', playError);
        }
      }

      // Monitor audio levels for active speaker detection
      monitorAudioLevels(localStream, authStore.user?.id || '');

      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'user-joined',
            userId: authStore.user?.id
          }
        });
      }

      roomStore.members.forEach(member => {
        if (member.user_id !== authStore.user?.id) {
          createPeerConnection(member.user_id);
        }
      });
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Could not access camera/microphone. Please check permissions.');
    }
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

    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: {
          type: 'user-left',
          userId: authStore.user?.id
        }
      });
    }
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
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;
    microphone.connect(analyser);

    function checkAudioLevel() {
      if (!isInCall) return;

      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      if (average > 30) {
        activeSpeaker = userId;
      }

      requestAnimationFrame(checkAudioLevel);
    }

    checkAudioLevel();
  }

  async function createPeerConnection(userId: string) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream!);
      });
    }

    pc.ontrack = (event) => {
      remoteStreams.set(userId, event.streams[0]);
      monitorAudioLevels(event.streams[0], userId);
      
      const remoteVideo = document.createElement('video');
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.muted = false;
      remoteVideo.className = 'w-full h-32 object-cover rounded-lg bg-black';
      remoteVideo.id = `remote-${userId}`;
      
      // Ensure video plays
      remoteVideo.play().catch(e => console.log('Remote video play error:', e));
      
      if (remoteVideosContainer) {
        const existing = document.getElementById(`remote-${userId}`);
        if (existing) existing.remove();
        
        remoteVideosContainer.appendChild(remoteVideo);
      }
    };

    pc.onicecandidate = (event) => {
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

    peerConnections.set(userId, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: {
          type: 'offer',
          offer,
          to: userId,
          from: authStore.user?.id
        }
      });
    }
  }

  async function handleWebRTCSignal(payload: any) {
    const { type, userId, to, from, offer, answer, candidate } = payload.payload;

    if (from === authStore.user?.id) return;
    if (to && to !== authStore.user?.id) return;

    switch (type) {
      case 'user-joined':
        if (isInCall && userId !== authStore.user?.id) {
          createPeerConnection(userId);
        }
        break;

      case 'user-left':
        const pc = peerConnections.get(userId);
        if (pc) {
          pc.close();
          peerConnections.delete(userId);
          remoteStreams.delete(userId);
          const videoEl = document.getElementById(`remote-${userId}`);
          if (videoEl) videoEl.remove();
        }
        break;

      case 'offer':
        if (!peerConnections.has(from)) {
          const pc = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          });

          if (localStream) {
            localStream.getTracks().forEach(track => {
              pc.addTrack(track, localStream!);
            });
          }

          pc.ontrack = (event) => {
            remoteStreams.set(userId, event.streams[0]);
            monitorAudioLevels(event.streams[0], userId);
            
            const remoteVideo = document.createElement('video');
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.muted = false;
            remoteVideo.className = 'w-full h-32 object-cover rounded-lg bg-black';
            remoteVideo.id = `remote-${from}`;
            
            // Ensure video plays
            remoteVideo.play().catch(e => console.log('Remote video play error:', e));
            
            if (remoteVideosContainer) {
              const existing = document.getElementById(`remote-${from}`);
              if (existing) existing.remove();
              remoteVideosContainer.appendChild(remoteVideo);
            }
          };

          pc.onicecandidate = (event) => {
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

          peerConnections.set(from, pc);

          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (channel) {
            channel.send({
              type: 'broadcast',
              event: 'webrtc-signal',
              payload: {
                type: 'answer',
                answer,
                to: from,
                from: authStore.user?.id
              }
            });
          }
        }
        break;

      case 'answer':
        const existingPc = peerConnections.get(from);
        if (existingPc) {
          await existingPc.setRemoteDescription(new RTCSessionDescription(answer));
        }
        break;

      case 'ice-candidate':
        const targetPc = peerConnections.get(from);
        if (targetPc && candidate) {
          await targetPc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        break;
    }
  }
</script>

{#if isFullscreen && isInCall}
  <!-- Fullscreen Video Call Overlay -->
  <div class="fixed bottom-4 right-4 z-50 transition-all duration-300 {isMinimized ? 'w-20' : 'w-80'}">
    <div class="bg-black/80 backdrop-blur-md rounded-xl overflow-hidden border border-white/20">
      {#if !isMinimized}
        <div class="p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-white text-sm font-medium">Video Call</span>
            <button
              onclick={() => isMinimized = true}
              class="text-white/60 hover:text-white transition"
            >
              <Minimize2 class="w-4 h-4" />
            </button>
          </div>

          <!-- Active Speaker or First Remote Video -->
          {#if activeSpeaker && activeSpeaker !== authStore.user?.id}
            {@const activeStream = remoteStreams.get(activeSpeaker)}
            {#if activeStream}
              <video
                srcObject={activeStream}
                autoplay
                playsinline
                class="w-full h-40 object-cover rounded-lg bg-black mb-2"
              ></video>
            {/if}
          {:else if remoteStreams.size > 0}
            {@const firstRemote = Array.from(remoteStreams.values())[0]}
            <video
              srcObject={firstRemote}
              autoplay
              playsinline
              class="w-full h-40 object-cover rounded-lg bg-black mb-2"
            ></video>
          {:else}
            <!-- Show local video if no remotes -->
            <video
              bind:this={localVideoElement}
              autoplay
              muted
              playsinline
              class="w-full h-40 object-cover rounded-lg bg-black mb-2"
            ></video>
          {/if}

          <!-- Controls -->
          <div class="flex gap-2">
            <button
              onclick={toggleMic}
              class="flex-1 px-3 py-2 rounded-lg transition flex items-center justify-center gap-2 text-white text-sm {isMicOn ? 'bg-green-500' : 'bg-red-500'}"
            >
              {#if isMicOn}
                <Mic class="w-4 h-4" />
              {:else}
                <MicOff class="w-4 h-4" />
              {/if}
            </button>

            <button
              onclick={toggleVideo}
              class="flex-1 px-3 py-2 rounded-lg transition flex items-center justify-center gap-2 text-white text-sm {isVideoOn ? 'bg-green-500' : 'bg-red-500'}"
            >
              {#if isVideoOn}
                <Video class="w-4 h-4" />
              {:else}
                <VideoOff class="w-4 h-4" />
              {/if}
            </button>

            <button
              onclick={endCall}
              class="flex-1 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition flex items-center justify-center gap-2 text-sm"
            >
              <PhoneOff class="w-4 h-4" />
            </button>
          </div>
        </div>
      {:else}
        <!-- Minimized State -->
        <button
          onclick={() => isMinimized = false}
          class="p-4 w-full flex items-center justify-center"
        >
          <Video class="w-6 h-6 text-white" />
        </button>
      {/if}
    </div>
  </div>
{/if}

{#if isFullscreen && settingsStore.showChatInFullscreen && messages.length > 0}
  <!-- Fullscreen Chat Overlay -->
  <div 
    class="fixed bottom-4 left-4 w-96 max-h-96 z-50"
    style="opacity: {settingsStore.chatOpacityInFullscreen}"
  >
    <div class="bg-black/80 backdrop-blur-md rounded-xl overflow-hidden border border-white/20">
      <div class="p-3 space-y-2 max-h-80 overflow-y-auto">
        {#each messages.slice(-5) as message}
          {@const isOwnMessage = message.user_id === authStore.user?.id}
          <div class="bg-white/10 rounded-lg p-2">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-white/90 text-xs font-medium">
                {isOwnMessage ? 'You' : message.profiles?.display_name || 'Unknown'}
              </span>
              <span class="text-white/50 text-xs">
                {formatTime(message.created_at)}
              </span>
            </div>
            <div class="text-white/90 text-sm">
              {message.message}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Regular Chat Panel (Non-Fullscreen) -->
{#if !isFullscreen}
  <div class="bg-surface backdrop-blur-sm border border-border rounded-xl overflow-hidden flex flex-col h-full">
    <div class="p-4 border-b border-border">
      <h3 class="text-text-primary font-semibold text-lg">Chat & Video</h3>
    </div>

    <div class="p-4 border-b border-border space-y-3">
      {#if !isInCall}
        <button
          onclick={startCall}
          class="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition flex items-center justify-center gap-2"
        >
          <Phone class="w-4 h-4" />
          Start Video Call
        </button>
      {:else}
        <div class="space-y-3">
          <div class="relative">
            <video
              bind:this={localVideoElement}
              autoplay
              muted
              playsinline
              class="w-full h-48 object-cover rounded-lg bg-black"
              style="transform: scaleX(-1);"
              onloadedmetadata={(e) => {
                console.log('Local video metadata loaded');
                e.currentTarget.play().catch(err => console.log('Play error:', err));
              }}
            ></video>
            <div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs">
              You
            </div>
          </div>

          <div bind:this={remoteVideosContainer} class="space-y-2"></div>

          <div class="flex gap-2">
            <button
              onclick={toggleMic}
              class="flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 text-white {isMicOn ? 'bg-green-500' : 'bg-red-500'}"
            >
              {#if isMicOn}
                <Mic class="w-4 h-4" />
              {:else}
                <MicOff class="w-4 h-4" />
              {/if}
            </button>

            <button
              onclick={toggleVideo}
              class="flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 text-white {isVideoOn ? 'bg-green-500' : 'bg-red-500'}"
            >
              {#if isVideoOn}
                <Video class="w-4 h-4" />
              {:else}
                <VideoOff class="w-4 h-4" />
              {/if}
            </button>

            <button
              onclick={endCall}
              class="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition flex items-center justify-center gap-2"
            >
              <PhoneOff class="w-4 h-4" />
            </button>
          </div>
        </div>
      {/if}
    </div>

    <div bind:this={chatContainer} class="flex-1 overflow-y-auto p-4 space-y-3">
      {#if messages.length === 0}
        <div class="text-text-muted text-sm text-center py-8">
          No messages yet. Start the conversation!
        </div>
      {:else}
        {#each messages as message}
          {@const isOwnMessage = message.user_id === authStore.user?.id}
          <div class="flex gap-2" class:flex-row-reverse={isOwnMessage}>
            <div class="shrink-0">
              {#if message.profiles?.avatar_url}
                <img 
                  src={message.profiles.avatar_url} 
                  alt={message.profiles.display_name}
                  class="w-8 h-8 rounded-full"
                />
              {:else}
                <div class="w-8 h-8 rounded-full bg-linear-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-bold">
                  {(message.profiles?.display_name?.[0] || '?').toUpperCase()}
                </div>
              {/if}
            </div>

            <div class="flex-1 max-w-[70%]">
              <div class="flex items-center gap-2 mb-1" class:flex-row-reverse={isOwnMessage}>
                <span class="text-text-secondary text-xs font-medium">
                  {isOwnMessage ? 'You' : message.profiles?.display_name || 'Unknown'}
                </span>
                <span class="text-text-muted text-xs">
                  {formatTime(message.created_at)}
                </span>
              </div>
              <div 
                class="px-3 py-2 rounded-lg text-sm {isOwnMessage
                  ? 'bg-primary text-white'
                  : 'bg-surface-hover text-text-primary'}"
              >
                {message.message}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <div class="p-4 border-t border-border">
      <form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="flex gap-2">
        <input
          type="text"
          bind:value={newMessage}
          placeholder="Type a message..."
          class="flex-1 bg-input border border-border rounded-lg px-4 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary text-sm"
        />
        <button
          type="submit"
          class="bg-primary hover:bg-primary/90 text-white p-2 rounded-lg transition"
        >
          <Send class="w-5 h-5" />
        </button>
      </form>
    </div>
  </div>
{/if}
