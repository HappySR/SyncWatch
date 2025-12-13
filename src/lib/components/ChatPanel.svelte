<script lang="ts">
  import { roomStore } from '$lib/stores/room.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { supabase } from '$lib/supabase';
  import { onMount, onDestroy } from 'svelte';
  import { Send, Mic, MicOff, Video, VideoOff, Phone, PhoneOff } from 'lucide-svelte';

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
  let chatContainer: HTMLDivElement;
  let channel: any;

  // WebRTC state
  let localStream: MediaStream | null = null;
  let peerConnections = $state<Map<string, RTCPeerConnection>>(new Map());
  let isMicOn = $state(false);
  let isVideoOn = $state(false);
  let isInCall = $state(false);
  let localVideoElement: HTMLVideoElement;
  let remoteVideosContainer: HTMLDivElement;

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
        video: true
      });

      if (localVideoElement) {
        localVideoElement.srcObject = localStream;
      }

      isMicOn = true;
      isVideoOn = true;
      isInCall = true;

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

    isMicOn = false;
    isVideoOn = false;
    isInCall = false;

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
      const remoteVideo = document.createElement('video');
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.className = 'w-full h-32 object-cover rounded-lg bg-black';
      remoteVideo.id = `remote-${userId}`;
      
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
            const remoteVideo = document.createElement('video');
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.className = 'w-full h-32 object-cover rounded-lg bg-black';
            remoteVideo.id = `remote-${from}`;
            
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

<div class="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden flex flex-col h-full">
  <div class="p-4 border-b border-white/10">
    <h3 class="text-white font-semibold text-lg">Chat & Video</h3>
  </div>

  <div class="p-4 border-b border-white/10 space-y-3">
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
          ></video>
          <div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs">
            You
          </div>
        </div>

        <div bind:this={remoteVideosContainer} class="space-y-2"></div>

        <div class="flex gap-2">
          <button
            onclick={toggleMic}
            class="flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 text-white"
            class:bg-red-500={!isMicOn}
            class:bg-green-500={isMicOn}
          >
            {#if isMicOn}
              <Mic class="w-4 h-4" />
            {:else}
              <MicOff class="w-4 h-4" />
            {/if}
          </button>

          <button
            onclick={toggleVideo}
            class="flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 text-white"
            class:bg-red-500={!isVideoOn}
            class:bg-green-500={isVideoOn}
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
      <div class="text-white/40 text-sm text-center py-8">
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
              <div class="w-8 h-8 rounded-full bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                {(message.profiles?.display_name?.[0] || '?').toUpperCase()}
              </div>
            {/if}
          </div>

          <div class="flex-1 max-w-[70%]">
            <div class="flex items-center gap-2 mb-1" class:flex-row-reverse={isOwnMessage}>
              <span class="text-white/80 text-xs font-medium">
                {isOwnMessage ? 'You' : message.profiles?.display_name || 'Unknown'}
              </span>
              <span class="text-white/40 text-xs">
                {formatTime(message.created_at)}
              </span>
            </div>
            <div 
              class="px-3 py-2 rounded-lg text-sm
                {isOwnMessage
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/10 text-white/90'}"
            >
              {message.message}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="p-4 border-t border-white/10">
    <form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="flex gap-2">
      <input
        type="text"
        bind:value={newMessage}
        placeholder="Type a message..."
        class="flex-1 bg-black/30 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-purple-500 text-sm"
      />
      <button
        type="submit"
        class="bg-purple-500 hover:bg-purple-600 text-white p-2 rounded-lg transition"
      >
        <Send class="w-5 h-5" />
      </button>
    </form>
  </div>
</div>
