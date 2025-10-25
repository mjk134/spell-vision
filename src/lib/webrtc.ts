import { db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'ready';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  from: string;
  to: string;
}

export class WebRTCSignaling {
  private roomId: string;
  private peerId: string;
  private onMessage: (message: SignalingMessage) => void;

  constructor(roomId: string, peerId: string, onMessage: (message: SignalingMessage) => void) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.onMessage = onMessage;
    this.listenForMessages();
  }

  async sendMessage(message: SignalingMessage) {
    await addDoc(collection(db, 'rooms', this.roomId, 'messages'), {
      ...message,
      timestamp: Date.now()
    });
  }

  private listenForMessages() {
    const messagesRef = collection(db, 'rooms', this.roomId, 'messages');
    onSnapshot(messagesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const message = change.doc.data() as SignalingMessage;
          // Accept messages addressed to this peer, 'all', or 'other' (when not from self)
          if (message.to === this.peerId || message.to === 'all' || (message.to === 'other' && message.from !== this.peerId)) {
            this.onMessage(message);
            // Clean up message after processing
            deleteDoc(change.doc.ref);
          }
        }
      });
    });
  }
}

export class WebRTCPeer {
  private peerConnection: RTCPeerConnection;
  private signaling: WebRTCSignaling;
  private peerId: string;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream = new MediaStream();
  private onRemoteStream: (stream: MediaStream) => void;
  private dataChannel: RTCDataChannel | null = null;
  private onDataReceived?: (data: unknown) => void;

  constructor(roomId: string, peerId: string, onRemoteStream: (stream: MediaStream) => void, onDataReceived?: (data: unknown) => void) {
    this.peerId = peerId;
    this.onRemoteStream = onRemoteStream;
    this.onDataReceived = onDataReceived;
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    this.signaling = new WebRTCSignaling(roomId, peerId, this.handleSignalingMessage.bind(this));

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const targetPeer = peerId === 'caller' ? 'callee' : 'caller';
        this.signaling.sendMessage({
          type: 'ice-candidate',
          data: event.candidate.toJSON(),
          from: peerId,
          to: targetPeer
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log(`[${this.peerId}] Received remote track`);
      this.remoteStream.addTrack(event.track);
      this.onRemoteStream(this.remoteStream);
    };

    // Handle incoming data channels
    this.peerConnection.ondatachannel = (event) => {
      console.log(`[${this.peerId}] Received data channel`);
      this.dataChannel = event.channel;
      this.setupDataChannelListeners();
    };

    // Monitor connection state
    this.peerConnection.onconnectionstatechange = () => {
      console.log(`[${this.peerId}] Connection state changed to:`, this.peerConnection.connectionState);
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(`[${this.peerId}] ICE connection state changed to:`, this.peerConnection.iceConnectionState);
    };

    this.peerConnection.onsignalingstatechange = () => {
      console.log(`[${this.peerId}] Signaling state changed to:`, this.peerConnection.signalingState);
    };
  }

  async addLocalStream(stream: MediaStream) {
    this.localStream = stream;
    stream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, stream);
    });
  }

  private setupDataChannelListeners() {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (this.onDataReceived) {
          this.onDataReceived(data);
        }
      } catch (error) {
        console.error('Failed to parse data channel message:', error);
      }
    };
  }

  createDataChannel(label = 'data'): RTCDataChannel {
    if (this.dataChannel) {
      return this.dataChannel;
    }
    this.dataChannel = this.peerConnection.createDataChannel(label);
    this.setupDataChannelListeners();
    return this.dataChannel;
  }

  sendData(data: unknown): void {
    if (!this.dataChannel) {
      console.error('Data channel not initialized');
      return;
    }
    if (this.dataChannel.readyState !== 'open') {
      console.error('Data channel is not open');
      return;
    }
    try {
      const jsonString = JSON.stringify(data);
      this.dataChannel.send(jsonString);
    } catch (error) {
      console.error('Failed to send data:', error);
    }
  }

  getDataChannelState(): RTCDataChannelState | null {
    return this.dataChannel?.readyState ?? null;
  }

  async createOffer() {
    console.log(`[${this.peerId}] Creating offer, connection state:`, this.peerConnection.connectionState, 'signaling state:', this.peerConnection.signalingState);
    if (this.peerConnection.connectionState === 'closed' || this.peerConnection.connectionState === 'failed') {
      console.error('Cannot create offer: peer connection is closed or failed');
      return;
    }
    if (this.peerConnection.signalingState !== 'stable') {
      console.warn('Cannot create offer: signaling state is', this.peerConnection.signalingState);
      return;
    }
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    console.log(`[${this.peerId}] Offer created and set as local description`);
    this.signaling.sendMessage({
      type: 'offer',
      data: { type: offer.type, sdp: offer.sdp },
      from: 'caller',
      to: 'callee'
    });
  }

  async createAnswer() {
    console.log(`[${this.peerId}] Creating answer`);
    if (this.peerConnection.connectionState === 'closed' || this.peerConnection.connectionState === 'failed') {
      console.error('Cannot create answer: peer connection is closed or failed');
      return;
    }
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    console.log(`[${this.peerId}] Answer created and set as local description`);
    this.signaling.sendMessage({
      type: 'answer',
      data: { type: answer.type, sdp: answer.sdp },
      from: 'callee',
      to: 'caller'
    });
  }

  sendReady() {
    this.signaling.sendMessage({
      type: 'ready',
      data: null,
      from: this.peerId,
      to: 'caller'
    });
  }

  private async handleSignalingMessage(message: SignalingMessage) {
    console.log(`[${this.peerId}] Received signaling message:`, message.type, 'from', message.from);

    // Ignore messages if connection is closed or failed
    if (this.peerConnection.connectionState === 'closed' || this.peerConnection.connectionState === 'failed') {
      console.warn('Ignoring signaling message: peer connection is closed or failed');
      return;
    }

    switch (message.type) {
      case 'offer':
        console.log(`[${this.peerId}] Processing offer, current signaling state:`, this.peerConnection.signalingState);
        if (this.peerConnection.signalingState === 'stable') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
          await this.createAnswer();
        }
        break;
      case 'answer':
        console.log(`[${this.peerId}] Processing answer, current signaling state:`, this.peerConnection.signalingState);
        if (this.peerConnection.signalingState === 'have-local-offer') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
        }
        break;
      case 'ice-candidate':
        console.log(`[${this.peerId}] Adding ICE candidate`);
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
        break;
      case 'ready':
        console.log(`[${this.peerId}] Received ready signal, current signaling state:`, this.peerConnection.signalingState);
        if (this.peerId === 'caller' && this.peerConnection.signalingState === 'stable') {
          this.createOffer();
        }
        break;
    }
  }

  close() {
    this.peerConnection.close();
  }
}

