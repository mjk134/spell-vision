import { DrawingUtils, FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision"
import { getWebcam } from "../lib/webcam";
import React, { useEffect, useRef, useState } from "react";

export interface videoStream{
   stream: React.RefObject<MediaStream | null>;
}

export const GESTURES = {
    none: "None",
    closed_fist: "Closed_Fist",
    open_palm: "Open_Palm",
    pointing_up: "Pointing_Up",
    thumb_down: "Thumb_Down",
    thumb_up: "Thumb_Up",
    victory: "Victory",
    iloveyou: "ILoveYou",
} as const;

export type Gesture = typeof GESTURES[keyof typeof GESTURES];

export default function HandRecogniser(stream: videoStream) {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const gestureRecogniserRef = useRef<GestureRecognizer | null>(null)
    const [webCamRunning, setWebCamRunning] = useState(false);
    const [recognizerReady, setRecognizerReady] = useState(false);
    const [currentGestures, setCurrentGestures] = useState<Gesture[]>([GESTURES.none, GESTURES.none])

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
                });
            } else {
                console.error("Could not access webcam.");
            }
        });
    }, []);

    useEffect(()=>{
        const gesture = async () => {
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm") 
            console.log("Creating GestureRecognizer...");
            gestureRecogniserRef.current = await GestureRecognizer.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task",
                    delegate: "CPU"  // Model uses CPU-only ops anyway
                },
                runningMode: "VIDEO",
                numHands: 2  // Enable detection of up to 2 hands
            });
            console.log("GestureRecognizer created successfully");
            setRecognizerReady(true);
            if (canvasRef.current){
                stream.stream.current = canvasRef.current.captureStream();
            }
        }

        gesture();
    }, []);

    // Use an effect to start prediction when both video and recognizer are ready
    useEffect(() => {
        console.log("Checking conditions for prediction start:", {
            recognizerReady,
            webCamRunning,
            hasVideo: !!videoRef.current,
            hasCanvas: !!canvasRef.current
        });
        
        if (recognizerReady && webCamRunning && videoRef.current && canvasRef.current) {
            console.log("All conditions met, starting prediction loop");
            const video = videoRef.current;
            const canvas = canvasRef.current;
            
            const setupCanvasAndStartPrediction = () => {
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
                window.requestAnimationFrame(predictWebcam);
            };

            if (video.videoWidth === 0) {
                video.addEventListener('loadedmetadata', setupCanvasAndStartPrediction, { once: true });
            } else {
                setupCanvasAndStartPrediction();
            }
        }
    }, [recognizerReady, webCamRunning]); // Only re-run when these states change

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
                console.log("predictWebcam - missing required refs:", {
                    hasRecognizer: !!gestureRecogniserRef.current,
                    hasVideo: !!videoRef.current,
                    hasCanvas: !!canvasRef.current
                });
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
                
                const gestures = (res.gestures?.map(g => g[0]?.categoryName || 'none') || []) as Gesture[]

                if (gestures !== currentGestures){
                    // console.log(gestures)
                    setCurrentGestures(gestures)
                }

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

useEffect(() => {
    const syncCanvasSize = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
  
      const dpr = window.devicePixelRatio || 1;
      const width = video.clientWidth;
      const height = video.clientHeight;
  
      // Visually match video
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
  
      // Match drawing buffer to device pixels
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
  
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
  
    const v = videoRef.current;
    v?.addEventListener('loadedmetadata', syncCanvasSize);
    window.addEventListener('resize', syncCanvasSize);
    syncCanvasSize();
  
    return () => {
      v?.removeEventListener('loadedmetadata', syncCanvasSize);
      window.removeEventListener('resize', syncCanvasSize);
    };
  }, []);
  
 
  return (
    <div className="relative bg-gray-300 h-[28vmin] w-full overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="block w-full h-full object-contain"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-10 w-full h-full"
      />
    </div>
  )

}