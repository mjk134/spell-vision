import { db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
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
          if (message.to === this.peerId || message.to === 'all') {
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
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream = new MediaStream();
  private onRemoteStream: (stream: MediaStream) => void;

  constructor(roomId: string, peerId: string, onRemoteStream: (stream: MediaStream) => void) {
    this.onRemoteStream = onRemoteStream;
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    this.signaling = new WebRTCSignaling(roomId, peerId, this.handleSignalingMessage.bind(this));

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendMessage({
          type: 'ice-candidate',
          data: event.candidate,
          from: peerId,
          to: 'other'
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      this.remoteStream.addTrack(event.track);
      this.onRemoteStream(this.remoteStream);
    };
  }

  async addLocalStream(stream: MediaStream) {
    this.localStream = stream;
    stream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, stream);
    });
  }

  async createOffer() {
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.signaling.sendMessage({
      type: 'offer',
      data: offer,
      from: 'caller',
      to: 'callee'
    });
  }

  async createAnswer() {
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    this.signaling.sendMessage({
      type: 'answer',
      data: answer,
      from: 'callee',
      to: 'caller'
    });
  }

  private async handleSignalingMessage(message: SignalingMessage) {
    switch (message.type) {
      case 'offer':
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
        await this.createAnswer();
        break;
      case 'answer':
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
        break;
      case 'ice-candidate':
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
        break;
    }
  }

  close() {
    this.peerConnection.close();
  }
}
