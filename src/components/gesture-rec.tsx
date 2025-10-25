import { DrawingUtils, FilesetResolver, GestureRecognizer, type GestureRecognizerResult } from "@mediapipe/tasks-vision"
import { getWebcam } from "../lib/webcam";
import { useEffect, useRef, useState } from "react";

export default function HandRecogniser() {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const gestureRecogniserRef = useRef<GestureRecognizer | null>(null)
    const [webCamRunning, setWebCamRunning] = useState(false);

    useEffect(() => {
        getWebcam().then((stream) => {
            if (stream && videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.addEventListener("loadeddata",predictWebcam);
                setWebCamRunning(true);
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
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task",
                    delegate: "GPU"
                },
                runningMode: "VIDEO"
            });
        }

        gesture();
    }, []);

    let results: GestureRecognizerResult; 

    async function predictWebcam() {
        let nowInMs = Date.now();
        results = gestureRecogniserRef.current!.recognizeForVideo(videoRef.current!, nowInMs)!
        const ctx = canvasRef.current!.getContext("2d")!;
        const drawingUtils = new DrawingUtils(ctx);

        ctx.clearRect(0, 0, canvasRef.current?.width!, canvasRef.current?.height!);
        if (results.landmarks) {
            for (const landmarks of results.landmarks) {
                drawingUtils.drawConnectors(
                    landmarks,
                    GestureRecognizer.HAND_CONNECTIONS,
                    {
                        color: "#00FF00",
                        lineWidth: 5
                    }
                );
                drawingUtils.drawLandmarks(landmarks, {
                    color: "#FF0000",
                    lineWidth: 2
                });
            }
        }
        if (webCamRunning === true) {
            window.requestAnimationFrame(predictWebcam)
        }
    }

    return (
        <>
            <canvas ref={canvasRef}></canvas>
            <video ref={videoRef} autoPlay playsInline></video>
        </>
    )
}