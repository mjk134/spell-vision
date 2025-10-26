import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { WebRTCPeer } from "../lib/webrtc";
import type {Gesture} from "@/components/gesture-rec.tsx";

/**
 * RemoteFeedHandle: Methods exposed to parent component via ref
 *
 * Why use a ref handle?
 * The parent (App.tsx) needs to control when to connect/disconnect.
 * Using a ref allows the parent to call methods on this child component.
 */
export interface RemoteFeedHandle {
  connect: (roomId: string, peerId: 'caller' | 'callee') => void;  // Start WebRTC connection
  disconnect: () => void;                 // Stop WebRTC connection
  sendData: (data: unknown) => void;      // Send data through data channel
  onDataReceived: (callback: (data: unknown) => void) => void;  // Register callback for incoming data
  getDataChannelState: () => RTCDataChannelState | null;        // Check if data channel is open
}

/**
 * RemoteFeedProps: Props passed from parent
 */
interface RemoteFeedProps {
  webcamStreamRef: React.RefObject<MediaStream | null>; // (Optional) Our webcam stream
  peerId?: string;                                       // Are we 'caller' or 'callee'?
  gestures: Gesture[];                                   // Current detected gestures
}

/**
 * RemoteFeed Component: Displays remote peer's video and manages WebRTC connection
 *
 * What this component does:
 * 1. Creates and manages a WebRTCPeer instance
 * 2. Displays the remote peer's video in a <video> element
 * 3. Handles connection/disconnection
 * 4. Provides methods to parent for sending data
 *
 * How it works:
 * - Parent calls connect(roomId) → We create WebRTCPeer → Connection starts
 * - WebRTCPeer receives remote video → Calls onRemoteStream callback → We set video.srcObject
 * - Video element displays the remote stream
 */
const RemoteFeed = forwardRef<RemoteFeedHandle, RemoteFeedProps>(
    ({ webcamStreamRef, gestures: _gestures }, ref) => {
        // === Component State ===

        const remoteCanvasVideoRef = useRef<HTMLVideoElement | null>(null);  // Reference to <video> element
        const remoteWebcamVideoRef = useRef<HTMLVideoElement | null>(null);  // (Optional) Reference to webcam <video> element
        const [peer, setPeer] = useState<WebRTCPeer | null>(null);     // Current WebRTC peer instance
        const [roomId, setRoomId] = useState<string>('');              // Current room ID
        const [isConnected, setIsConnected] = useState(false);         // Are we connected?
        const dataCallbackRef = useRef<((data: unknown) => void) | null>(null);  // Callback for incoming data

        /**
         * connect(): Initialize and start WebRTC connection
         *
         * This is called by the parent (App.tsx) when user clicks "Connect" button.
         *
         * Steps:
         * 1. Validate we have room ID and local stream
         * 2. Clean up any existing peer connection
         * 3. Create new WebRTCPeer instance
         * 4. Initialize (clean old messages)
         * 5. Add our local video/audio stream
         * 6. If caller: Create data channel and wait for callee
         * 7. If callee: Send "ready" signal to start the handshake
         */
        const connect = async (newRoomId: string, connectPeerId: 'caller' | 'callee') => {
            // Get the current stream from the ref
            // (HandRecogniser sets this asynchronously after canvas is ready)
            const localStream = webcamStreamRef.current;

            // Validation: Must have both room ID and stream
            if (!newRoomId || !localStream) {
                console.error('Room ID and local stream are required. Room:', newRoomId, 'Stream:', localStream);
                return;
            }

            // Update our state with the room ID
            setRoomId(newRoomId);

            // Clean up existing connection if reconnecting
            if (peer) {
                peer.close();
                setPeer(null);
            }

            console.log("peer id:", connectPeerId);

            // Create new WebRTC peer instance
            // Pass callbacks for handling remote stream and data
            const newPeer = new WebRTCPeer(
                newRoomId,
                connectPeerId,
                // Callback when remote stream arrives
                (remoteStream) => {
                    // Set the remote stream as the source of our <video> element
                  console.log('Received remote stream:', remoteStream);
                    if (remoteCanvasVideoRef.current) {
                        remoteCanvasVideoRef.current.srcObject = remoteStream;
                    }
                },
                // Callback when data arrives via data channel
                (data) => {
                    console.log('Received data from peer:', data);
                    // If parent registered a callback, call it
                    if (dataCallbackRef.current) {
                        dataCallbackRef.current(data);
                    }
                }
            );

            // Initialize: Clean up old Firestore messages and start listening
            await newPeer.init();

            // Add our local stream (webcam video/audio) to the connection
            // The other peer will receive these tracks
            await newPeer.addLocalStream(localStream);

            // === CALLER vs CALLEE behavior ===

            if (connectPeerId === 'caller') {
                // CALLER: Create data channel and wait
                // Must create data channel BEFORE making the offer
                newPeer.createDataChannel();
                console.log('[Caller] Data channel created, waiting for ready signal');
                // The caller will create the offer when they receive callee's "ready" signal
            }

            if (connectPeerId === 'callee') {
                // CALLEE: Send ready signal
                // This tells the caller "I'm ready, you can send me an offer now"
                console.log('[Callee] Sending ready signal to caller');

                // Small delay to ensure caller's listener is fully established
                await new Promise(resolve => setTimeout(resolve, 100));

                await newPeer.sendReady();
                // After this, we wait for the caller's offer
            }

            // Save the peer instance and mark as connected
            setPeer(newPeer);
            setIsConnected(true);
        };

        /**
         * disconnect(): Close WebRTC connection and clean up
         *
         * Called when user clicks "Disconnect" button or component unmounts
         */
        const disconnect = () => {
            if (peer) {
                peer.close();          // Close peer connection and stop Firestore listener
                setPeer(null);
                setIsConnected(false);

                // Clear the video element
                if (remoteCanvasVideoRef.current) {
                    remoteCanvasVideoRef.current.srcObject = null;
                }
            }
        };

        /**
         * useImperativeHandle: Expose methods to parent via ref
         *
         * This lets the parent component call these methods:
         * remoteFeedRef.current.connect(roomId)
         * remoteFeedRef.current.disconnect()
         * etc.
         */
        useImperativeHandle(ref, () => ({
            connect,
            disconnect,

            // sendData: Send JSON data to other peer via data channel
            sendData: (data: unknown) => {
                if (!peer) {
                    console.error('Peer connection not established');
                    return;
                }
                peer.sendData(data);
            },

            // onDataReceived: Register a callback for when data arrives
            onDataReceived: (callback: (data: unknown) => void) => {
                dataCallbackRef.current = callback;
            },

            // getDataChannelState: Check if we can send data (is channel open?)
            getDataChannelState: () => {
                if (!peer) {
                    return null;
                }
                return peer.getDataChannelState();
            }
        }));

        /**
         * useEffect: Clean up on component unmount
         *
         * If user navigates away or component is removed,
         * make sure we close the peer connection properly
         */
        useEffect(() => {
            return () => {
                if (peer) {
                    peer.close();
                }
            };
        }, [peer]);

        /**
         * useEffect: Clean up when browser tab is closed
         *
         * If user closes the tab/window, we should close the connection
         * to let the other peer know we're gone
         */
        useEffect(() => {
            const handleBeforeUnload = () => {
                if (peer) {
                    peer.close();
                }
            };

            window.addEventListener('beforeunload', handleBeforeUnload);

            return () => {
                window.removeEventListener('beforeunload', handleBeforeUnload);
            };
        }, [peer]);

        /**
         * Render: Display video element and connection status
         */
        return (
            <div className="relative bg-gray-400 h-[28vmin]">
                    {/* Video element where remote peer's video will appear */}
                    <video
                        ref={remoteCanvasVideoRef}
                        autoPlay          // Start playing as soon as stream arrives
                        playsInline       // Prevent fullscreen on mobile
                        className="h-full w-full object-cover bg-black"
                    />
                    <video ref={remoteWebcamVideoRef} autoPlay playsInline className="z-20" />
                    {/* Show "Waiting..." if not connected, or "Connected" badge if connected */}
                    {!roomId || roomId.trim() === '' ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white">
                            <p className="text-lg">Waiting for opponent...</p>
                        </div>
                    ) : isConnected && (
                        <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
                            Connected
                        </div>
                    )}
                </div>
        );
    }
);

RemoteFeed.displayName = 'RemoteFeed';

export default RemoteFeed;

