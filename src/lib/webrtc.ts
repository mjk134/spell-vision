import { db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc, query, getDocs } from 'firebase/firestore';

/**
 * SignalingMessage: The format of messages sent between peers via Firestore
 * - type: What kind of message (ready/offer/answer/ice-candidate)
 * - data: The payload (SDP for offer/answer, ICE candidate info, etc.)
 * - from: Who sent it ('caller' or 'callee')
 * - to: Who should receive it ('caller' or 'callee')
 */
export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'ready';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  from: string;
  to: string;
}

/**
 * WebRTCSignaling: Manages sending and receiving signaling messages via Firestore
 *
 * Why we need this:
 * WebRTC peers need to exchange connection information before they can connect directly.
 * This class uses Firestore as a "middleman" to pass messages between peers.
 *
 * Flow:
 * 1. Both peers connect to the same Firestore "room"
 * 2. They send messages (offers, answers, ICE candidates) to this room
 * 3. The other peer receives these messages and responds accordingly
 * 4. Once connection info is exchanged, WebRTC connects them directly (peer-to-peer)
 */
export class WebRTCSignaling {
  private roomId: string;                              // The room ID both peers share
  private peerId: string;                              // This peer's ID ('caller' or 'callee')
  private onMessage: (message: SignalingMessage) => void; // Callback when we receive a message
  private unsubscribe: (() => void) | null = null;     // Function to stop listening to Firestore

  constructor(roomId: string, peerId: string, onMessage: (message: SignalingMessage) => void) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.onMessage = onMessage;  // Save callback to call when messages arrive
  }

  /**
   * init(): Prepare for messaging
   *
   * Step 1: Start listening for messages FIRST
   * - We start the listener immediately to avoid missing any messages
   *
   * Step 2: Clean up any old messages from previous sessions
   * - If you reconnect to the same room, old messages might still exist in Firestore
   * - These old messages would confuse the new connection attempt
   * - So we delete ALL existing messages after we start listening
   * - The listener will ignore the delete operations (only cares about 'added')
   */
  async init() {
    console.log(`[${this.peerId}] Starting listener first...`);

    // Start listening BEFORE cleanup to avoid race conditions
    this.listenForMessages();

    console.log(`[${this.peerId}] Cleaning up old messages...`);

    // Get reference to this room's message collection in Firestore
    const messagesRef = collection(db, 'rooms', this.roomId, 'messages');

    // Fetch all existing messages (one-time read, not a listener)
    const snapshot = await getDocs(query(messagesRef));

    // Delete each old message
    const deletePromises = snapshot.docs.map(doc => {
      console.log(`[${this.peerId}] Deleting old message:`, doc.data().type);
      return deleteDoc(doc.ref);
    });

    // Wait for all deletions to complete
    await Promise.all(deletePromises);
    console.log(`[${this.peerId}] Cleanup done, listener active`);
  }

  /**
   * sendMessage(): Send a message to the other peer via Firestore
   *
   * How it works:
   * 1. We add a document to Firestore with the message data
   * 2. The other peer's listener will immediately see this new document
   * 3. They'll process it and respond with their own message
   */
  async sendMessage(message: SignalingMessage) {
    console.log(`[${this.peerId}] 📤 SENDING:`, message.type, 'to:', message.to);

    // Add the message as a new document in Firestore
    // This triggers the other peer's onSnapshot listener
    await addDoc(collection(db, 'rooms', this.roomId, 'messages'), message);
  }

  /**
   * listenForMessages(): Watch Firestore for new messages
   *
   * How it works:
   * - onSnapshot() creates a real-time listener
   * - Whenever a document is added/changed/removed, the callback fires
   * - We check if the new message is for us, and if so, process it
   * - After processing, we delete the message to keep Firestore clean
   */
  private listenForMessages() {
    const messagesRef = collection(db, 'rooms', this.roomId, 'messages');

    // Set up real-time listener for this collection
    this.unsubscribe = onSnapshot(messagesRef, (snapshot) => {
      // docChanges() tells us what changed since last snapshot
      snapshot.docChanges().forEach((change) => {
        // We only care about newly added documents (not modified or removed)
        if (change.type === 'added') {
          const message = change.doc.data() as SignalingMessage;

          console.log(`[${this.peerId}] 📥 RECEIVED:`, message.type, 'from:', message.from, 'to:', message.to);

          // Check if this message is addressed to us
          if (message.to === this.peerId) {
            console.log(`[${this.peerId}] ✅ Processing message:`, message.type);

            // Call the callback to handle this message (defined in WebRTCPeer)
            this.onMessage(message);

            // Delete the message after processing to keep Firestore clean
            // This prevents the message from being processed again on reconnect
            deleteDoc(change.doc.ref);
          } else {
            // Message is for someone else (shouldn't happen in a 2-peer room)
            console.log(`[${this.peerId}] ⏭️  Skipping (not for us)`);
          }
        }
      });
    });
  }

  /**
   * close(): Stop listening and clean up
   * Called when disconnecting or unmounting the component
   */
  close() {
    if (this.unsubscribe) {
      this.unsubscribe();  // Stop the Firestore listener
    }
  }
}

/**
 * WebRTCPeer: Manages the actual peer-to-peer WebRTC connection
 *
 * What is WebRTC?
 * WebRTC allows two browsers to connect DIRECTLY to each other for video/audio/data.
 * Normally, browsers can only talk to servers, not to each other.
 * WebRTC breaks this limitation!
 *
 * The Connection Process (called "signaling"):
 * 1. Caller creates an "offer" (their connection info)
 * 2. Callee receives offer and creates an "answer" (their connection info)
 * 3. Both exchange ICE candidates (possible network paths to reach each other)
 * 4. WebRTC tries all the paths until it finds one that works
 * 5. Direct peer-to-peer connection established!
 *
 * This class handles all of that complexity.
 */
export class WebRTCPeer {
  private peerConnection: RTCPeerConnection;  // The WebRTC connection object (built into browsers)
  private signaling: WebRTCSignaling;         // Our Firestore messaging system
  private peerId: string;                     // Are we 'caller' or 'callee'?
  private remoteStream: MediaStream = new MediaStream();  // The other peer's video/audio
  private onRemoteStream: (stream: MediaStream) => void;  // Callback to display remote video
  private dataChannel: RTCDataChannel | null = null;      // For sending text/data (not video)
  private onDataReceived?: (data: unknown) => void;       // Callback when data arrives

  constructor(roomId: string, peerId: string, onRemoteStream: (stream: MediaStream) => void, onDataReceived?: (data: unknown) => void) {
    this.peerId = peerId;
    this.onRemoteStream = onRemoteStream;
    this.onDataReceived = onDataReceived;

    console.log(`[${this.peerId}] 🚀 Creating WebRTCPeer`);

    // Create the RTCPeerConnection - this is THE core WebRTC object
    // iceServers: STUN server helps us find our public IP address
    // (Needed because we're usually behind a router/NAT)
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Create our signaling system (Firestore messaging)
    // Pass handleSignalingMessage as callback - it'll be called when messages arrive
    this.signaling = new WebRTCSignaling(roomId, peerId, this.handleSignalingMessage.bind(this));

    // === Set up WebRTC event handlers ===

    /**
     * onicecandidate: Fires when WebRTC finds a possible network path to us
     *
     * ICE Candidates = possible ways the other peer can reach us
     * Could be: direct local network, public IP, relay server, etc.
     *
     * What we do: Send each candidate to the other peer via Firestore
     * They'll try all candidates until one works!
     */
    this.peerConnection.onicecandidate = (event) => {
      console.log(`[${this.peerId}] 🧊 ICE candidate found`);
      if (event.candidate) {
        // Found a network path! Send it to the other peer
        const targetPeer = peerId === 'caller' ? 'callee' : 'caller';
        this.signaling.sendMessage({
          type: 'ice-candidate',
          data: event.candidate.toJSON(),
          from: peerId,
          to: targetPeer
        });
      }
    };

    /**
     * ontrack: Fires when we receive a video/audio track from the other peer
     *
     * The other peer called addTrack() with their video/audio.
     * When the connection is established, we receive those tracks here.
     *
     * What we do: Add the track to our remoteStream and call the callback
     * The callback will set it as the source of a <video> element
     */
    this.peerConnection.ontrack = (event) => {
      console.log(`[${this.peerId}] 🎥 Received remote track`);
      this.remoteStream.addTrack(event.track);
      this.onRemoteStream(this.remoteStream);  // Update the video element
    };

    /**
     * ondatachannel: Fires when the OTHER peer creates a data channel
     *
     * Data channels let us send text/JSON/binary data (not video).
     * The CALLER creates the channel, the CALLEE receives it here.
     *
     * What we do: Save the channel and set up listeners for incoming data
     */
    this.peerConnection.ondatachannel = (event) => {
      console.log(`[${this.peerId}] 💬 Received data channel`);
      this.dataChannel = event.channel;
      this.setupDataChannelListeners();
    };

    /**
     * onconnectionstatechange: Fires when connection state changes
     * Useful for debugging - shows us: connecting → connected → disconnected → closed
     */
    this.peerConnection.onconnectionstatechange = () => {
      console.log(`[${this.peerId}] 🔌 Connection state:`, this.peerConnection.connectionState);
    };
  }

  /**
   * init(): Initialize signaling (clean old messages and start listening)
   * Must be called before any other operations!
   */
  async init() {
    console.log(`[${this.peerId}] 🧹 Initializing (cleaning old messages)...`);
    await this.signaling.init();
    console.log(`[${this.peerId}] ✅ Init complete`);
  }

  /**
   * addLocalStream(): Add our video/audio to the connection
   *
   * Takes our webcam stream and adds each track (video + audio) to the peer connection.
   * The other peer will receive these tracks via their ontrack handler.
   */
  async addLocalStream(stream: MediaStream) {
    console.log(`[${this.peerId}] 📹 Adding local stream`);
    stream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, stream);
    });
  }

  /**
   * createDataChannel(): Create a channel for sending text/data
   *
   * Only the CALLER creates this (before making the offer).
   * The CALLEE will receive it via ondatachannel handler.
   *
   * Used for: sending game moves, chat messages, etc. (not video)
   */
  createDataChannel(label = 'data'): RTCDataChannel {
    console.log(`[${this.peerId}] 💬 Creating data channel`);
    this.dataChannel = this.peerConnection.createDataChannel(label);
    this.setupDataChannelListeners();
    return this.dataChannel;
  }

  /**
   * setupDataChannelListeners(): Set up handlers for data channel events
   */
  private setupDataChannelListeners() {
    if (!this.dataChannel) return;

    // Channel opened - now we can send data!
    this.dataChannel.onopen = () => console.log(`[${this.peerId}] 💬 Data channel OPEN`);

    // Channel closed
    this.dataChannel.onclose = () => console.log(`[${this.peerId}] 💬 Data channel CLOSED`);

    // Received data from other peer
    this.dataChannel.onmessage = (event) => {
      console.log(`[${this.peerId}] 💬 Data received:`, event.data);
      if (this.onDataReceived) {
        this.onDataReceived(JSON.parse(event.data));
      }
    };
  }

  /**
   * sendReady(): Callee tells caller "I'm ready, send me an offer!"
   *
   * Why needed: The caller waits for this signal before creating the offer.
   * This ensures the callee is fully set up and listening before we start.
   */
  async sendReady() {
    console.log(`[${this.peerId}] 👋 Sending READY signal`);
    await this.signaling.sendMessage({
      type: 'ready',
      data: null,
      from: this.peerId,
      to: 'caller'
    });
  }

  /**
   * handleSignalingMessage(): Process messages received from the other peer
   *
   * This is the heart of the WebRTC signaling process!
   * Different message types trigger different actions:
   */
  private async handleSignalingMessage(message: SignalingMessage) {
    console.log(`[${this.peerId}] 📨 Handling:`, message.type);

    try {
      switch (message.type) {
        case 'ready': {
          /**
           * READY signal: Callee is ready
           *
           * Only the CALLER responds to this.
           * Response: Create an offer (SDP = Session Description Protocol)
           *
           * The offer contains:
           * - What video/audio codecs we support
           * - Our network information
           * - What we want to send/receive
           */
          if (this.peerId === 'caller') {
            console.log(`[${this.peerId}] 📞 Creating OFFER`);

            // Create the offer
            const offer = await this.peerConnection.createOffer();

            // Set it as our "local description" (what we're offering)
            await this.peerConnection.setLocalDescription(offer);

            // Send the offer to the callee
            await this.signaling.sendMessage({
              type: 'offer',
              data: offer,
              from: 'caller',
              to: 'callee'
            });
          }
          break;
        }

        case 'offer': {
          /**
           * OFFER received: Caller sent us their connection info
           *
           * We need to:
           * 1. Set their offer as the "remote description" (what they're offering)
           * 2. Create an answer (our response with OUR connection info)
           * 3. Set the answer as our "local description"
           * 4. Send the answer back to them
           */
          console.log(`[${this.peerId}] 📞 Received OFFER, creating ANSWER`);

          // Save the caller's offer
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));

          // Create our answer
          const answer = await this.peerConnection.createAnswer();

          // Set it as our local description
          await this.peerConnection.setLocalDescription(answer);

          // Send the answer to the caller
          await this.signaling.sendMessage({
            type: 'answer',
            data: answer,
            from: 'callee',
            to: 'caller'
          });
          break;
        }

        case 'answer':
          /**
           * ANSWER received: Callee responded to our offer
           *
           * We just need to save their answer as the "remote description".
           * After this, WebRTC will start trying to connect using the ICE candidates!
           */
          console.log(`[${this.peerId}] 📞 Received ANSWER`);
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
          break;

        case 'ice-candidate':
          /**
           * ICE CANDIDATE received: Other peer found a way to reach them
           *
           * ICE candidates are network paths. Both peers exchange candidates,
           * and WebRTC tries them all until it finds one that works.
           *
           * We just add the candidate - WebRTC handles the rest!
           */
          console.log(`[${this.peerId}] 🧊 Adding ICE candidate`);
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
          break;
      }
    } catch (error) {
      console.error(`[${this.peerId}] ❌ Error:`, error);
    }
  }

  /**
   * sendData(): Send text/JSON data to the other peer
   * Uses the data channel (not the video/audio stream)
   */
  sendData(data: unknown): void {
    console.log(`[${this.peerId}] 💬 Sending data:`, data);
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  /**
   * getDataChannelState(): Check if data channel is open and ready
   */
  getDataChannelState(): RTCDataChannelState | null {
    return this.dataChannel?.readyState ?? null;
  }

  /**
   * close(): Clean up everything
   * Closes the peer connection and stops listening to Firestore
   */
  close() {
    console.log(`[${this.peerId}] 🛑 Closing`);
    this.dataChannel?.close();
    this.peerConnection.close();
    this.signaling.close();
  }
}

