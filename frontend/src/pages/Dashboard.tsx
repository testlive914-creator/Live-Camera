import React, { useEffect, useState, useRef } from 'react';
import { Navbar } from '../components/Navbar';
import { CreateSessionModal } from '../components/CreateSessionModal';
import { api, SessionData } from '../services/api';
import { getSocket } from '../services/socket';
import { RTC_CONFIGURATION } from '../services/webrtc';
import { authService } from '../services/supabase';
import { 
  Users, Video, Film, Radio, Shield, 
  Maximize2, StopCircle, Disc, CheckCircle, 
  AlertTriangle, RefreshCw, XCircle, Share2
} from 'lucide-react';

interface ActivePeer {
  participantId: string;
  displayName: string;
  socketId: string;
  peerConnection: RTCPeerConnection;
  stream: MediaStream | null;
  joinedAt: Date;
  consentStatus: 'none' | 'requested' | 'approved' | 'declined' | 'withdrawn';
  consentEventId?: string;
  isRecording: boolean;
  mediaRecorder?: MediaRecorder;
  recordedChunks: Blob[];
  recordingStartTime?: number;
  iceCandidateQueue: RTCIceCandidateInit[];
  reconnectAttempts: number;
  isReconnecting: boolean;
}

export const Dashboard: React.FC = () => {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [recordingsCount, setRecordingsCount] = useState<number>(0);
  const [peers, setPeers] = useState<Map<string, ActivePeer>>(new Map());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'info' | 'success' | 'warn' | 'error' } | null>(null);

  // Video element refs mapped by participantId
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const peersRef = useRef<Map<string, ActivePeer>>(new Map());

  // Sync ref with state
  peersRef.current = peers;

  const showNotification = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [sessionList, recList] = await Promise.all([
        api.listSessions(),
        api.listRecordings()
      ]);
      setSessions(sessionList);
      setRecordingsCount(recList.length);

      // Select active session if available
      const active = sessionList.find(s => s.status === 'active');
      if (active) {
        setActiveSession(active);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Socket.IO and WebRTC Signalling for Active Session
  useEffect(() => {
    if (!activeSession) return;

    const socket = getSocket();
    socket.emit('admin:join', { sessionId: activeSession.id, token: authService.getAdminToken() });

    // Handle participant connecting
    socket.on('participant:connected', async (data: { participantId: string; displayName: string; socketId: string }) => {
      console.log('[Dashboard] Participant connected via socket:', data);
      showNotification(`${data.displayName} connected. Waiting for camera stream...`, 'info');
      setupPeerConnection(data.participantId, data.displayName, data.socketId);
    });

    // Handle incoming WebRTC Offer from participant
    socket.on('webrtc:offer', async (data: { senderSocketId: string; participantId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log('[Dashboard] Received SDP offer from:', data.senderSocketId);
      let peer = peersRef.current.get(data.participantId);
      if (!peer) {
        peer = setupPeerConnection(data.participantId, 'Friend', data.senderSocketId);
      }

      try {
        await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Flush any buffered ICE candidates that arrived before the remote description was set
        if (peer.iceCandidateQueue && peer.iceCandidateQueue.length > 0) {
          console.log(`[Dashboard] Flushing ${peer.iceCandidateQueue.length} queued ICE candidate(s) for ${peer.displayName}`);
          for (const cand of peer.iceCandidateQueue) {
            try {
              await peer.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
            } catch (candErr) {
              console.warn('[Dashboard] Error adding buffered ICE candidate:', candErr);
            }
          }
          peer.iceCandidateQueue = [];
        }

        const answer = await peer.peerConnection.createAnswer();
        await peer.peerConnection.setLocalDescription(answer);

        socket.emit('webrtc:answer', {
          targetSocketId: data.senderSocketId,
          sdp: answer
        });
      } catch (err) {
        console.error('[Dashboard] Error answering offer:', err);
      }
    });

    // Handle ICE candidate from participant (with buffering if remoteDescription is not ready)
    socket.on('webrtc:ice-candidate', async (data: { senderSocketId: string; participantId: string; candidate: RTCIceCandidateInit }) => {
      const peer = peersRef.current.get(data.participantId);
      if (peer && data.candidate) {
        if (peer.peerConnection.remoteDescription && peer.peerConnection.remoteDescription.type) {
          try {
            await peer.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (err) {
            console.error('[Dashboard] Failed to add ICE candidate:', err);
          }
        } else {
          // Buffer candidate until setRemoteDescription completes
          console.log(`[Dashboard] Buffering ICE candidate for ${peer.displayName} (remoteDescription pending)`);
          peer.iceCandidateQueue.push(data.candidate);
        }
      }
    });

    // Handle consent updates
    socket.on('consent:status-updated', (data: { participantId: string; decision: 'approved' | 'declined'; consentEventId: string }) => {
      const peer = peersRef.current.get(data.participantId);
      if (peer) {
        peer.consentStatus = data.decision;
        peer.consentEventId = data.consentEventId;
        setPeers(new Map(peersRef.current));
        showNotification(
          `${peer.displayName} ${data.decision === 'approved' ? 'APPROVED' : 'DECLINED'} recording consent.`,
          data.decision === 'approved' ? 'success' : 'warn'
        );
      }
    });

    // Handle consent withdrawal mid-stream
    socket.on('consent:withdrawn', (data: { participantId: string; message: string }) => {
      const peer = peersRef.current.get(data.participantId);
      if (peer) {
        if (peer.isRecording && peer.mediaRecorder) {
          try {
            peer.mediaRecorder.stop();
          } catch {}
          peer.isRecording = false;
          peer.recordedChunks = [];
        }
        peer.consentStatus = 'withdrawn';
        setPeers(new Map(peersRef.current));
        showNotification(data.message, 'warn');
      }
    });

    // Handle participant disconnect
    socket.on('participant:disconnected', (data: { participantId: string }) => {
      const peer = peersRef.current.get(data.participantId);
      if (peer) {
        if (peer.isRecording && peer.mediaRecorder) {
          try { peer.mediaRecorder.stop(); } catch {}
        }
        peer.peerConnection.close();
        peersRef.current.delete(data.participantId);
        setPeers(new Map(peersRef.current));
        showNotification(`${peer.displayName} disconnected.`, 'info');
      }
    });

    return () => {
      socket.off('participant:connected');
      socket.off('webrtc:offer');
      socket.off('webrtc:ice-candidate');
      socket.off('consent:status-updated');
      socket.off('consent:withdrawn');
      socket.off('participant:disconnected');
    };
  }, [activeSession]);

  const setupPeerConnection = (participantId: string, displayName: string, socketId: string): ActivePeer => {
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    const socket = getSocket();

    const newPeer: ActivePeer = {
      participantId,
      displayName,
      socketId,
      peerConnection: pc,
      stream: null,
      joinedAt: new Date(),
      consentStatus: 'none',
      isRecording: false,
      recordedChunks: [],
      iceCandidateQueue: [],
      reconnectAttempts: 0,
      isReconnecting: false
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice-candidate', {
          targetSocketId: socketId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[Dashboard] Received remote stream track:', event.track.kind);
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      newPeer.stream = remoteStream;

      const videoEl = videoRefs.current.get(participantId);
      if (videoEl) {
        videoEl.srcObject = remoteStream;
      }
      setPeers(new Map(peersRef.current));
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Dashboard] PC state (${participantId}):`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (newPeer.reconnectAttempts < 3 && !newPeer.isReconnecting) {
          newPeer.isReconnecting = true;
          newPeer.reconnectAttempts++;
          console.log(`[Dashboard] Attempting ICE restart for ${displayName} (Attempt ${newPeer.reconnectAttempts}/3)...`);
          showNotification(`Network interrupted. Attempting reconnection (${newPeer.reconnectAttempts}/3)...`, 'warn');
          
          setTimeout(async () => {
            try {
              if (typeof pc.restartIce === 'function') {
                pc.restartIce();
              }
            } catch (e) {
              console.warn('[Dashboard] ICE restart failed:', e);
            } finally {
              newPeer.isReconnecting = false;
            }
          }, 2000 * newPeer.reconnectAttempts);
        } else if (newPeer.reconnectAttempts >= 3) {
          showNotification(`Connection to ${displayName} failed. Check network or ask participant to refresh.`, 'error');
        }
      } else if (pc.connectionState === 'connected') {
        newPeer.reconnectAttempts = 0;
        newPeer.isReconnecting = false;
        console.log(`[Dashboard] WebRTC peer connection established with ${displayName}`);
      }
    };

    peersRef.current.set(participantId, newPeer);
    setPeers(new Map(peersRef.current));
    return newPeer;
  };

  // Request recording consent
  const handleRequestConsent = (participantId: string) => {
    const socket = getSocket();
    socket.emit('consent:request', { participantId });
    const peer = peersRef.current.get(participantId);
    if (peer) {
      peer.consentStatus = 'requested';
      setPeers(new Map(peersRef.current));
      showNotification(`Recording consent prompt sent to ${peer.displayName}`, 'info');
    }
  };

  // Start recording remote stream using MediaRecorder API
  const handleStartRecording = (participantId: string) => {
    const peer = peersRef.current.get(participantId);
    if (!peer || !peer.stream || peer.consentStatus !== 'approved') {
      showNotification('Cannot start recording: explicit participant consent required.', 'error');
      return;
    }

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';

      const recorder = new MediaRecorder(peer.stream, { mimeType });
      peer.recordedChunks = [];
      peer.recordingStartTime = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          peer.recordedChunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (peer.consentStatus === 'withdrawn') {
          showNotification('Recording discarded because consent was withdrawn.', 'warn');
          peer.recordedChunks = [];
          return;
        }

        const blob = new Blob(peer.recordedChunks, { type: mimeType });
        if (blob.size === 0) return;

        const durationSeconds = Math.round((Date.now() - (peer.recordingStartTime || Date.now())) / 1000);
        await uploadSavedRecording(peer, blob, durationSeconds);
      };

      recorder.start(1000); // 1-second chunks
      peer.mediaRecorder = recorder;
      peer.isRecording = true;
      setPeers(new Map(peersRef.current));
      showNotification(`Recording started for ${peer.displayName}`, 'success');
    } catch (err: any) {
      console.error('Failed to start MediaRecorder:', err);
      showNotification(`Failed to start recording: ${err.message}`, 'error');
    }
  };

  // Stop recording
  const handleStopRecording = (participantId: string) => {
    const peer = peersRef.current.get(participantId);
    if (peer && peer.mediaRecorder && peer.isRecording) {
      peer.mediaRecorder.stop();
      peer.isRecording = false;
      setPeers(new Map(peersRef.current));
      showNotification(`Stopping and saving recording...`, 'info');
    }
  };

  // Upload recording to backend / Supabase storage
  const uploadSavedRecording = async (peer: ActivePeer, blob: Blob, durationSeconds: number) => {
    if (!activeSession) return;
    try {
      setUploadingRecording(true);
      const formData = new FormData();
      formData.append('video', blob, `recording_${Date.now()}.webm`);
      formData.append('sessionId', activeSession.id);
      formData.append('participantId', peer.participantId);
      formData.append('durationSeconds', String(durationSeconds));

      await api.uploadRecording(formData);
      setRecordingsCount(prev => prev + 1);
      showNotification(`Recording saved successfully!`, 'success');
    } catch (err: any) {
      console.error('Upload failed:', err);
      showNotification(`Failed to save recording: ${err.message}`, 'error');
    } finally {
      setUploadingRecording(false);
    }
  };

  const handleDisconnectPeer = (participantId: string) => {
    const peer = peersRef.current.get(participantId);
    if (peer) {
      peer.peerConnection.close();
      peersRef.current.delete(participantId);
      setPeers(new Map(peersRef.current));
      showNotification(`${peer.displayName} was removed.`, 'info');
    }
  };

  const handleSessionCreated = (newSession: SessionData) => {
    setSessions(prev => [newSession, ...prev]);
    setActiveSession(newSession);
    showNotification(`New session "${newSession.title}" activated.`, 'success');
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col">
      <Navbar onOpenCreateModal={() => setIsCreateModalOpen(true)} />

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-slideUp">
          <div className={`px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center space-x-2 border ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-800'
              : notification.type === 'warn'
              ? 'bg-amber-950/90 text-amber-200 border-amber-800'
              : notification.type === 'error'
              ? 'bg-red-950/90 text-red-200 border-red-800'
              : 'bg-blue-950/90 text-blue-200 border-blue-800'
          }`}>
            <span>{notification.text}</span>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Metrics Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#111827] border border-[#1F2937] p-5 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active Stream</p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {activeSession ? (
                  <span className="text-emerald-400 flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Live</span>
                  </span>
                ) : (
                  <span className="text-gray-500">None</span>
                )}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Radio className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] p-5 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Connected Live Viewers</p>
              <h3 className="text-2xl font-bold text-white mt-1">{peers.size}</h3>
            </div>
            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] p-5 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Sessions</p>
              <h3 className="text-2xl font-bold text-white mt-1">{sessions.length}</h3>
            </div>
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Video className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] p-5 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Saved Recordings</p>
              <h3 className="text-2xl font-bold text-white mt-1">{recordingsCount}</h3>
            </div>
            <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Film className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Active Session Info Bar */}
        {activeSession ? (
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></div>
              <div>
                <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                  <span>Current Session: {activeSession.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                    Active
                  </span>
                </h2>
                <p className="text-xs text-gray-400">
                  Expires: {new Date(activeSession.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Max: {activeSession.maxParticipants} participants
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
              >
                Generate Another Link
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#111827] border border-dashed border-gray-800 rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto text-gray-400">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-medium text-white">No active session running</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                Generate an invitation link to start receiving real-time live front-camera video.
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
            >
              <span>Generate Invitation Link</span>
            </button>
          </div>
        )}

        {/* Live Video Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center space-x-2">
              <Radio className="w-5 h-5 text-red-500 animate-pulse" />
              <span>Live Connections ({peers.size})</span>
            </h2>
            <div className="text-xs text-gray-400 flex items-center space-x-2">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Audio Disabled • Explicit Consent Required for Recording</span>
            </div>
          </div>

          {peers.size === 0 ? (
            <div className="bg-[#111827]/60 border border-gray-800/80 rounded-xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-gray-800/60 border border-gray-700/50 flex items-center justify-center mx-auto text-gray-500">
                <Users className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-gray-300">Awaiting participants...</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Once a friend clicks your invitation link and approves camera access on their mobile phone, their live front camera will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from(peers.values()).map((peer) => (
                <div
                  key={peer.participantId}
                  className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col"
                >
                  {/* Video Tile Header */}
                  <div className="px-4 py-3 bg-gray-900/90 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="font-semibold text-sm text-white">{peer.displayName}</span>
                      <span className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-400 font-mono">
                        Front Camera
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {peer.isRecording && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-red-950/70 border border-red-800/60 rounded text-[11px] font-bold text-red-400 animate-pulse">
                          <Disc className="w-3 h-3" />
                          <span>REC</span>
                        </span>
                      )}
                      <button
                        onClick={() => handleDisconnectPeer(peer.participantId)}
                        title="Disconnect"
                        className="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Video Viewport */}
                  <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                    <video
                      ref={(el) => {
                        if (el) {
                          videoRefs.current.set(peer.participantId, el);
                          if (peer.stream) {
                            el.srcObject = peer.stream;
                          }
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {!peer.stream && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/80 text-gray-400 text-xs space-y-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                        <span>Negotiating WebRTC stream...</span>
                      </div>
                    )}

                    {/* Watermark badge */}
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-[10px] font-mono text-gray-300">
                      LIVE • NO AUDIO
                    </div>
                  </div>

                  {/* Tile Footer / Consent & Recording Controls */}
                  <div className="p-4 bg-gray-900/60 border-t border-gray-800 space-y-3">
                    {/* Consent status banner */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Recording Consent:</span>
                      {peer.consentStatus === 'approved' ? (
                        <span className="text-emerald-400 font-medium flex items-center space-x-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approved by Participant</span>
                        </span>
                      ) : peer.consentStatus === 'requested' ? (
                        <span className="text-amber-400 font-medium flex items-center space-x-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Awaiting Participant Approval...</span>
                        </span>
                      ) : peer.consentStatus === 'declined' ? (
                        <span className="text-red-400 font-medium flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Declined</span>
                        </span>
                      ) : peer.consentStatus === 'withdrawn' ? (
                        <span className="text-amber-400 font-medium flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Consent Withdrawn</span>
                        </span>
                      ) : (
                        <span className="text-gray-500 font-medium">Not Requested</span>
                      )}
                    </div>

                    {/* Operational Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {peer.consentStatus !== 'approved' ? (
                        <button
                          onClick={() => handleRequestConsent(peer.participantId)}
                          disabled={peer.consentStatus === 'requested'}
                          className="w-full col-span-2 py-2 px-3 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 transition-colors disabled:opacity-50"
                        >
                          {peer.consentStatus === 'requested' ? 'Consent Prompt Sent' : 'Request Recording Consent'}
                        </button>
                      ) : !peer.isRecording ? (
                        <button
                          onClick={() => handleStartRecording(peer.participantId)}
                          className="w-full col-span-2 py-2 px-3 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg shadow transition-colors flex items-center justify-center space-x-1.5"
                        >
                          <Disc className="w-4 h-4" />
                          <span>Start Recording</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStopRecording(peer.participantId)}
                          disabled={uploadingRecording}
                          className="w-full col-span-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition-colors flex items-center justify-center space-x-1.5"
                        >
                          <StopCircle className="w-4 h-4" />
                          <span>{uploadingRecording ? 'Saving Recording...' : 'Stop & Save Recording'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Create Session Modal */}
      <CreateSessionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSessionCreated={handleSessionCreated}
      />
    </div>
  );
};
