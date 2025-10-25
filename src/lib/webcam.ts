export const getWebcam = async (): Promise<MediaStream | null> => {
    try {
        return await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (error) {
        console.error("Error accessing webcam:", error);
    }
    return null;
}