import { useEffect, useRef } from "react";

function LocalWebcamFeed({ stream }: { stream: MediaStream | null }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className="relative h-[50vh] w-[360px]">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
            />
        </div>
    );
}

export default LocalWebcamFeed;

