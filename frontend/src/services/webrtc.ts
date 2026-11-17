export const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Safe acquisition of front-camera ONLY (Strictly audio: false)
export async function getFrontCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Your browser does not support camera access (getUserMedia API missing).');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user', // Front camera
        width: { ideal: 640, max: 854 },
        height: { ideal: 480, max: 480 },
        frameRate: { ideal: 15, max: 20 } // Conservative FPS for free bandwidth conservation
      },
      audio: false // STRICT REQUIREMENT: Camera only, no microphone
    });

    return stream;
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw new Error('Camera permission was denied. Please allow camera access in browser settings.');
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      throw new Error('No front-facing camera found on this device.');
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      throw new Error('Camera is already in use by another application or tab.');
    }
    throw new Error(err.message || 'Unable to access camera.');
  }
}

// Stop all tracks cleanly
export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}
