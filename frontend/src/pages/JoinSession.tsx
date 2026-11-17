import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { getFrontCameraStream, stopMediaStream, RTC_CONFIGURATION } from '../services/webrtc';
import { 
  Camera, ShieldCheck, AlertCircle, Video, Radio, 
  StopCircle, Disc, Check, X, ShieldAlert 
} from 'lucide-react';

export const JoinSession: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  // Invitation info
  const [sessionInfo, setSessionInfo] = useState<{
    valid: boolean;
    sessionId: string;
    title: string;
    description: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(true);

  // Participant form
  const [displayName, setDisplayName] = useState('');
  const [participantId, setParticipantId] = useState<string | null>(null);

  // Live streaming states
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Recording consent state
  const [consentPrompt, setConsentPrompt] = useState<{
    notice: string;
  } | null>(null);
  const [recordingApproved, setRecordingApproved] = useState(false);
  const [isBeingRecorded, setIsBeingRecorded] = useState(false);

  // WebRTC refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const reconnectAttemptsRef = useRef(0);

  // 1. Validate invitation token on mount
  useEffect(() => {
    if (!token) {
      setError('No invitation token provided.');
      setValidating(false);
      return;
    }

    api.validateInvitation(token)
      .then((data) => {
        setSessionInfo(data);
      })
      .catch((err: any) => {
        setError(err.message || 'Invitation is invalid or has expired.');
      })
      .finally(() => {
        setValidating(false);
      });
  }, [token]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopMediaStream(localStreamRef.current);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  // 2. Start Live Selfie Stream
  const handleStartSelfie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !sessionInfo) return;

    try {
      setCameraLoading(true);
      setCameraError(null);

      // A. Register participant on backend
      const joinRes = await api.joinInvitation(token, displayName || 'Friend');
      const pId = joinRes.participant.id;
      setParticipantId(pId);

      // B. Acquire Front Camera ONLY (Strictly audio: false)
      const stream = await getFrontCameraStream();
      localStreamRef.current = stream;

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      // C. Establish WebRTC PeerConnection
      const pc = new RTCPeerConnection(RTC_CONFIGURATION);
      peerConnectionRef.current = pc;

      // Add camera video track to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const socket = getSocket();

      // Exchange ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc:ice-candidate', {
            candidate: event.candidate
          });
        }
      };

      // Connect to Socket room
      socket.emit('participant:join', {
        sessionId: sessionInfo.sessionId,
        participantId: pId,
        displayName: displayName || 'Friend'
      });

      // Connection state and reconnection monitoring
      pc.onconnectionstatechange = () => {
        console.log('[Participant] Connection state:', pc.connectionState);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current++;
            console.log(`[Participant] Attempting connection recovery (attempt ${reconnectAttemptsRef.current}/3)...`);
            setTimeout(() => {
              if (typeof pc.restartIce === 'function') {
                pc.restartIce();
              }
            }, 2000 * reconnectAttemptsRef.current);
          } else {
            setCameraError('Connection lost. Please tap "Start Selfie" to reconnect.');
          }
        } else if (pc.connectionState === 'connected') {
          reconnectAttemptsRef.current = 0;
        }
      };

      // Listen for WebRTC Answer from Admin Dashboard (Flush queued ICE candidates)
      socket.on('webrtc:answer', async (data: { sdp: RTCSessionDescriptionInit }) => {
        console.log('[Participant] Received answer from admin');
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

          if (candidateQueueRef.current.length > 0) {
            console.log(`[Participant] Flushing ${candidateQueueRef.current.length} queued ICE candidate(s)`);
            for (const cand of candidateQueueRef.current) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (candErr) {
                console.warn('[Participant] Error applying queued candidate:', candErr);
              }
            }
            candidateQueueRef.current = [];
          }
        } catch (err) {
          console.error('[Participant] setRemoteDescription error:', err);
        }
      });

      // Listen for ICE candidates from Admin (with buffering if remoteDescription is pending)
      socket.on('webrtc:ice-candidate', async (data: { candidate: RTCIceCandidateInit }) => {
        if (data.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
              console.error('[Participant] addIceCandidate error:', err);
            }
          } else {
            console.log('[Participant] Buffering ICE candidate (remoteDescription pending)');
            candidateQueueRef.current.push(data.candidate);
          }
        }
      });

      // Listen for Recording Consent Prompt from Admin
      socket.on('consent:prompt', (data: { notice: string }) => {
        console.log('[Participant] Consent requested:', data);
        setConsentPrompt({ notice: data.notice });
      });

      // Listen for host ending session
      socket.on('session:ended', () => {
        handleStopSharing();
        setError('The session host has ended this live session.');
      });

      // Create and send SDP Offer to Admin
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:offer', { sdp: offer });

      setIsStreaming(true);
    } catch (err: any) {
      console.error('Failed to start selfie session:', err);
      setCameraError(err.message || 'Unable to access front camera.');
    } finally {
      setCameraLoading(false);
    }
  };

  // 3. Stop Sharing
  const handleStopSharing = () => {
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    candidateQueueRef.current = [];
    reconnectAttemptsRef.current = 0;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (participantId) {
      api.joinInvitation(token || '', '').catch(() => {});
    }

    setIsStreaming(false);
    setConsentPrompt(null);
    setRecordingApproved(false);
    setIsBeingRecorded(false);
  };

  // 4. Respond to Recording Consent
  const handleConsentDecision = (approved: boolean) => {
    const socket = getSocket();
    const decision = approved ? 'approved' : 'declined';
    socket.emit('consent:response', { decision });

    setRecordingApproved(approved);
    setIsBeingRecorded(approved);
    setConsentPrompt(null);
  };

  // 5. Withdraw Consent Mid-Stream
  const handleWithdrawConsent = () => {
    const socket = getSocket();
    socket.emit('consent:withdraw');
    setRecordingApproved(false);
    setIsBeingRecorded(false);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col justify-center items-center p-4">
      {/* Mobile-First Container */}
      <div className="w-full max-w-md bg-[#111827] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden relative">
        {/* Banner */}
        <div className="px-6 py-4 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">Live Selfie Connect</h1>
              <p className="text-[10px] text-gray-400">Front-camera stream • No audio</p>
            </div>
          </div>

          {isStreaming && (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-red-950/80 border border-red-800 text-red-400 text-xs font-bold animate-pulse">
              <Radio className="w-3.5 h-3.5" />
              <span>LIVE</span>
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {validating ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              Validating invitation token...
            </div>
          ) : error ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-800 text-red-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Invitation Unavailable</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">{error}</p>
              </div>
            </div>
          ) : !isStreaming ? (
            /* Pre-Stream Join Screen */
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-bold text-white">{sessionInfo?.title}</h2>
                {sessionInfo?.description && (
                  <p className="text-xs text-gray-400">{sessionInfo.description}</p>
                )}
              </div>

              {/* Strict Privacy Notice Card */}
              <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl space-y-2.5 text-xs text-gray-300">
                <div className="flex items-center space-x-2 text-blue-400 font-semibold">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Privacy Safeguard Notice</span>
                </div>
                <p>• Only your <strong>front camera</strong> will be shared with the session host.</p>
                <p>• <strong>No audio or microphone</strong> is transmitted or accessed.</p>
                <p>• Camera will activate only after you click &ldquo;Start Selfie&rdquo;.</p>
                <p>• <strong>Video recording is separate</strong> and requires your explicit approval.</p>
              </div>

              {cameraError && (
                <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cameraError}</span>
                </div>
              )}

              <form onSubmit={handleStartSelfie} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Your Name / Nickname
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0B0F19] border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={cameraLoading}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center space-x-2 active:scale-98 disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>{cameraLoading ? 'Requesting Camera...' : 'Start Selfie'}</span>
                </button>
              </form>
            </div>
          ) : (
            /* Live Camera Stream Active View */
            <div className="space-y-4">
              {/* Local Camera Viewport (Mirrored front camera) */}
              <div className="relative aspect-[3/4] bg-black rounded-xl overflow-hidden border border-gray-800 shadow-inner">
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100" // CSS flip for selfie mirror feel
                />

                {/* Overlays */}
                <div className="absolute top-3 left-3 flex items-center space-x-2">
                  <span className="px-2.5 py-1 rounded-full bg-red-600 text-white font-bold text-[11px] shadow animate-pulse flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-white"></span>
                    <span>LIVE</span>
                  </span>
                </div>

                {isBeingRecorded && (
                  <div className="absolute top-3 right-3 flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-red-950/90 border border-red-800 text-red-300 text-[11px] font-bold animate-pulse">
                    <Disc className="w-3.5 h-3.5" />
                    <span>RECORDING</span>
                  </div>
                )}

                <div className="absolute bottom-3 left-3 right-3 text-center">
                  <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur text-[11px] text-gray-300">
                    Live Front Camera • Muted
                  </span>
                </div>
              </div>

              {/* Consent Prompt Dialog Modal */}
              {consentPrompt && (
                <div className="p-4 bg-blue-950/80 border border-blue-700/80 rounded-xl space-y-3 animate-slideUp">
                  <div className="flex items-center space-x-2 text-blue-300 text-xs font-bold uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Recording Consent Request</span>
                  </div>
                  <p className="text-xs text-gray-200 leading-relaxed">
                    The session host is asking to <strong>record this camera video</strong>.
                    Recording will start only if you approve.
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleConsentDecision(false)}
                      className="py-2 px-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg border border-gray-700 transition-colors"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleConsentDecision(true)}
                      className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow transition-colors"
                    >
                      Approve Recording
                    </button>
                  </div>
                </div>
              )}

              {/* In-stream controls */}
              <div className="space-y-2">
                {recordingApproved && (
                  <button
                    onClick={handleWithdrawConsent}
                    className="w-full py-2 px-3 bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 text-xs font-medium rounded-lg border border-amber-800/50 transition-colors"
                  >
                    Withdraw Recording Consent
                  </button>
                )}

                <button
                  onClick={handleStopSharing}
                  className="w-full py-2.5 px-4 bg-gray-800 hover:bg-red-600/90 text-gray-300 hover:text-white text-xs font-semibold rounded-xl border border-gray-700 transition-all flex items-center justify-center space-x-2"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>Stop Sharing Camera</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
