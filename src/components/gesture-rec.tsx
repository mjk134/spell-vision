import { DrawingUtils, FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision"
import { getWebcam } from "../lib/webcam";
import { useEffect, useRef, useState } from "react";

export default function HandRecogniser() {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const gestureRecogniserRef = useRef<GestureRecognizer | null>(null)
    const [webCamRunning, setWebCamRunning] = useState(false);
    const [recognizerReady, setRecognizerReady] = useState(false);
    const startedRef = useRef(false);

    useEffect(() => {
        getWebcam().then((stream) => {
            if (stream && videoRef.current) {
                videoRef.current.srcObject = stream;
                // mute so autoplay isn't blocked by browsers
                videoRef.current.muted = true;
                // try to play immediately
                videoRef.current.play().catch(() => {
                    // play might be blocked until user interaction; loadeddata will still fire
                });
                videoRef.current.addEventListener("loadeddata", () => {
                    setWebCamRunning(true);
                    maybeStartPredictLoop();
                });
            } else {
                // alert("Could not access webcam.");
            }
        });
    }, []);

    useEffect(()=>{
        const gesture = async () => {
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm") 
            gestureRecogniserRef.current = await GestureRecognizer.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "../../gesture_recognizer.task",
                    delegate: "GPU"
                },
                runningMode: "VIDEO"
            });
            setRecognizerReady(true);
            maybeStartPredictLoop();
        }

        gesture();
    }, []);

    
    // Start the predict loop only when both the video and recognizer are ready.
    function maybeStartPredictLoop() {
        if (startedRef.current) return;
        if (recognizerReady && videoRef.current && canvasRef.current) {
            startedRef.current = true;
            // size canvas to match video element's intrinsic size
            const video = videoRef.current;
            const canvas = canvasRef.current;
            // set canvas pixel size to video size
            canvas.width = video.videoWidth || video.clientWidth || 640;
            canvas.height = video.videoHeight || video.clientHeight || 480;
            // make canvas overlay video
            canvas.style.position = 'absolute';
            canvas.style.left = '0';
            canvas.style.top = '0';
            canvas.style.zIndex = '2';

            // ensure video is positioned so canvas overlays it
            video.style.position = 'absolute';
            video.style.left = '0';
            video.style.top = '0';
            video.style.zIndex = '1';

            setWebCamRunning(true);
            window.requestAnimationFrame(predictWebcam);
        }
    }

    function clearCanvas() {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, c.width, c.height);
    }

    function predictWebcam() {
        try {
            if (!gestureRecogniserRef.current || !videoRef.current || !canvasRef.current) {
                // not ready yet
                return;
            }

            // Use performance.now() as the timestamp for video-based models
            const nowInMs = performance.now();
            const res = gestureRecogniserRef.current.recognizeForVideo(videoRef.current, nowInMs);
            if (!res) {
                clearCanvas();
            } else {
                const ctx = canvasRef.current.getContext('2d')!;
                const drawingUtils = new DrawingUtils(ctx);
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

                // results.landmarks may be an array of landmark lists
                // guard the shape and draw if present
                if (res.landmarks) {
                    for (const landmarks of res.landmarks) {
                        drawingUtils.drawConnectors(
                            landmarks,
                            GestureRecognizer.HAND_CONNECTIONS,
                            {
                                color: '#00FF00',
                                lineWidth: 5,
                            }
                        );
                        drawingUtils.drawLandmarks(landmarks, {
                            color: '#FF0000',
                            lineWidth: 2,
                        });
                    }
                }
            }
        } catch (err) {
            console.error('Error in predictWebcam:', err);
        } finally {
            if (webCamRunning) {
                window.requestAnimationFrame(predictWebcam);
            }
        }
    }

    return (
        <>
            <canvas ref={canvasRef}></canvas>
            <video ref={videoRef} autoPlay></video>
        </>
    )
}