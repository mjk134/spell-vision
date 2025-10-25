import { useEffect, useRef, useState } from "react";
import { getWebcam } from "../lib/webcam";
import { WebRTCPeer } from "../lib/webrtc";

function WebcamFeed() {
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const [peer, setPeer] = useState<WebRTCPeer | null>(null);
    const [roomId, setRoomId] = useState('test-room');
    const [isCaller, setIsCaller] = useState(false);

    useEffect(() => {
        getWebcam().then((stream) => {
            if (stream && localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
                // Initialize peer after getting stream
                const newPeer = new WebRTCPeer(roomId, isCaller ? 'caller' : 'callee', (remoteStream) => {
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = remoteStream;
                    }
                });
                newPeer.addLocalStream(stream);
                setPeer(newPeer);
            } else {
                alert("Could not access webcam.");
            }
        });
    }, [roomId, isCaller]);

    const handleCreateOffer = () => {
        if (peer) {
            peer.createOffer();
        }
    };

    const handleJoinCall = () => {
        setIsCaller(false);
        // Reinitialize peer as callee
        getWebcam().then((stream) => {
            if (stream) {
                const newPeer = new WebRTCPeer(roomId, 'callee', (remoteStream) => {
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = remoteStream;
                    }
                });
                newPeer.addLocalStream(stream);
                setPeer(newPeer);
            }
        });
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="flex gap-4">
                <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="Room ID"
                    className="border p-2"
                />
                <button onClick={() => { setIsCaller(true); handleCreateOffer(); }} className="bg-blue-500 text-white p-2">
                    Create Call
                </button>
                <button onClick={handleJoinCall} className="bg-green-500 text-white p-2">
                    Join Call
                </button>
            </div>
            <div className="flex gap-4">
                <div className="relative h-[50vh] w-[360px]">
                    <h3>Local</h3>
                    <video ref={localVideoRef} autoPlay playsInline muted></video>
                </div>
                <div className="relative h-[50vh] w-[360px]">
                    <h3>Remote</h3>
                    <video ref={remoteVideoRef} autoPlay playsInline></video>
                </div>
            </div>
        </div>
    )
}

export default WebcamFeed;