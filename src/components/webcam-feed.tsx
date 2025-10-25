import { useEffect, useRef } from "react";
import { getWebcam } from "../lib/webcam";

function WebcamFeed() {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    // const canvasRef = useRef<HTMLCanvasElement | null>(null)

    useEffect(() => {
        getWebcam().then((stream) => {
            if (stream && videoRef.current) {
                videoRef.current.srcObject = stream;
            } else {
                alert("Could not access webcam.");
            }
        });
    }, []);



    return (
        <div className="relative h-[50vh] w-[720px]">
            <video ref={videoRef} autoPlay playsInline></video>
            {/*<canvas ref={canvasRef}></canvas> */}
        </div>
    )
}

export default WebcamFeed;