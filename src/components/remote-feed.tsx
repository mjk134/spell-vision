import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { WebRTCPeer } from "../lib/webrtc";

export interface RemoteFeedHandle {
    setRoomId: (roomId: string) => void;
    connect: () => void;
    disconnect: () => void;
    sendData: (data: unknown) => void;
    onDataReceived: (callback: (data: unknown) => void) => void;
    getDataChannelState: () => RTCDataChannelState | null;
}

interface RemoteFeedProps {
    localStream: MediaStream | null;
    peerId?: string;
}

const RemoteFeed = forwardRef<RemoteFeedHandle, RemoteFeedProps>(
    ({ localStream, peerId = 'callee' }, ref) => {
        const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
        const [peer, setPeer] = useState<WebRTCPeer | null>(null);
        const [roomId, setRoomId] = useState<string>('');
        const [isConnected, setIsConnected] = useState(false);
        const dataCallbackRef = useRef<((data: unknown) => void) | null>(null);

        const connect = () => {
            if (!roomId || !localStream) {
                console.error('Room ID and local stream are required');
                return;
            }

            // Clean up existing peer if any
            if (peer) {
                peer.close();
                setPeer(null);
            }

            const newPeer = new WebRTCPeer(
                roomId,
                peerId,
                (remoteStream) => {
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = remoteStream;
                    }
                },
                (data) => {
                    // Call the registered callback when data is received
                    if (dataCallbackRef.current) {
                        dataCallbackRef.current(data);
                    }
                }
            );

            newPeer.addLocalStream(localStream);

            // Create data channel if caller
            if (peerId === 'caller') {
                newPeer.createDataChannel();
                // Don't create offer here - wait for callee's ready signal
            }

            // Send ready signal if callee
            if (peerId === 'callee') {
                newPeer.sendReady();
            }

            setPeer(newPeer);
            setIsConnected(true);
        };

        const disconnect = () => {
            if (peer) {
                peer.close();
                setPeer(null);
                setIsConnected(false);
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = null;
                }
            }
        };

        // Expose methods to parent via ref
        useImperativeHandle(ref, () => ({
            setRoomId: (newRoomId: string) => {
                setRoomId(newRoomId);
            },
            connect,
            disconnect,
            sendData: (data: unknown) => {
                if (!peer) {
                    console.error('Peer connection not established');
                    return;
                }
                peer.sendData(data);
            },
            onDataReceived: (callback: (data: unknown) => void) => {
                dataCallbackRef.current = callback;
            },
            getDataChannelState: () => {
                if (!peer) {
                    return null;
                }
                return peer.getDataChannelState();
            }
        }));

        // Clean up on unmount
        useEffect(() => {
            return () => {
                if (peer) {
                    peer.close();
                }
            };
        }, [peer]);

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

        return (
            <div className="flex flex-col gap-4">
                <div className="relative h-[50vh] w-[40vw]">
                    <h3 className="text-lg font-semibold mb-2">Remote Feed</h3>
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="h-full w-full object-cover bg-black"
                    />
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
            </div>
        );
    }
);

RemoteFeed.displayName = 'RemoteFeed';

export default RemoteFeed;

