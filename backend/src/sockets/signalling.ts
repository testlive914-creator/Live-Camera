import { Server, Socket } from 'socket.io';
import { SessionStore } from '../services/sessionStore.js';
import { verifyTokenString } from '../middleware/auth.js';

// Map sessionId -> authenticated admin socket ID
const adminSockets = new Map<string, string>();

export function setupSignalling(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Admin joins session room (Secure with JWT / Token verification & Ownership check)
    socket.on('admin:join', async (data: { sessionId: string; token?: string }) => {
      try {
        const { sessionId, token } = data;
        if (!token) {
          socket.emit('error', { message: 'Unauthorized: Admin authentication token required' });
          return;
        }

        const adminUser = await verifyTokenString(token);
        if (!adminUser) {
          socket.emit('error', { message: 'Unauthorized: Invalid admin authentication token' });
          return;
        }

        const session = await SessionStore.getSessionById(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        // Verify that the authenticated admin owns this session
        if (session.adminId !== adminUser.id) {
          socket.emit('error', { message: 'Forbidden: You do not have permission to administer this session' });
          return;
        }

        const room = `session:${sessionId}`;
        socket.join(room);
        socket.data.role = 'admin';
        socket.data.adminId = adminUser.id;
        socket.data.sessionId = sessionId;

        adminSockets.set(sessionId, socket.id);
        console.log(`[Socket] Verified Admin (${adminUser.email}) joined room ${room} on socket ${socket.id}`);

        // Send existing active participants to admin
        const participants = await SessionStore.getParticipantsBySession(sessionId);
        socket.emit('admin:participants-list', {
          participants: participants.filter(p => p.connectionStatus === 'connected')
        });
      } catch (err: any) {
        console.error('[Socket] admin:join error:', err);
        socket.emit('error', { message: 'Internal error during admin handshake' });
      }
    });

    // Participant joins session room
    socket.on('participant:join', async (data: { sessionId: string; participantId: string; displayName: string }) => {
      try {
        const { sessionId, participantId, displayName } = data;
        const session = await SessionStore.getSessionById(sessionId);
        if (!session || session.status !== 'active') {
          socket.emit('session:invalid', { message: 'Session is no longer active' });
          return;
        }

        const participant = await SessionStore.getParticipant(participantId);
        if (!participant || participant.sessionId !== sessionId) {
          socket.emit('session:invalid', { message: 'Participant record not found for this session' });
          return;
        }

        const room = `session:${sessionId}`;
        socket.join(room);
        socket.data.role = 'participant';
        socket.data.sessionId = sessionId;
        socket.data.participantId = participantId;

        await SessionStore.updateParticipantSocket(participantId, socket.id);
        console.log(`[Socket] Participant ${displayName} (${participantId}) joined session ${sessionId}`);

        // TARGETED SIGNALLING: Route participant connection ONLY to the authenticated admin socket
        const adminSocketId = adminSockets.get(sessionId);
        if (adminSocketId) {
          io.to(adminSocketId).emit('participant:connected', {
            participantId,
            displayName,
            socketId: socket.id
          });
        }
      } catch (err: any) {
        console.error('[Socket] participant:join error:', err);
      }
    });

    // WebRTC Signalling: Forward Offer (Targeted: Participant -> Admin ONLY)
    socket.on('webrtc:offer', (data: { sdp: any }) => {
      if (socket.data.role !== 'participant' || !socket.data.sessionId) {
        return;
      }
      const adminSocketId = adminSockets.get(socket.data.sessionId);
      if (adminSocketId) {
        io.to(adminSocketId).emit('webrtc:offer', {
          senderSocketId: socket.id,
          participantId: socket.data.participantId,
          sdp: data.sdp
        });
      }
    });

    // WebRTC Signalling: Forward Answer (Targeted: Admin -> Specific Participant)
    socket.on('webrtc:answer', (data: { targetSocketId: string; sdp: any }) => {
      if (socket.data.role !== 'admin') {
        return;
      }
      io.to(data.targetSocketId).emit('webrtc:answer', {
        senderSocketId: socket.id,
        sdp: data.sdp
      });
    });

    // WebRTC Signalling: Forward ICE Candidate (Targeted point-to-point)
    socket.on('webrtc:ice-candidate', (data: { targetSocketId?: string; candidate: any }) => {
      if (socket.data.role === 'participant' && socket.data.sessionId) {
        // Participant sends candidate directly to Admin
        const adminSocketId = adminSockets.get(socket.data.sessionId);
        if (adminSocketId) {
          io.to(adminSocketId).emit('webrtc:ice-candidate', {
            senderSocketId: socket.id,
            participantId: socket.data.participantId,
            candidate: data.candidate
          });
        }
      } else if (socket.data.role === 'admin' && data.targetSocketId) {
        // Admin sends candidate directly to target participant
        io.to(data.targetSocketId).emit('webrtc:ice-candidate', {
          senderSocketId: socket.id,
          participantId: socket.data.participantId,
          candidate: data.candidate
        });
      }
    });

    // Recording Consent: Admin requests consent from participant
    socket.on('consent:request', async (data: { participantId: string }) => {
      if (socket.data.role !== 'admin') {
        return;
      }
      const participant = await SessionStore.getParticipant(data.participantId);
      if (participant && participant.socketId) {
        io.to(participant.socketId).emit('consent:prompt', {
          sessionId: socket.data.sessionId,
          participantId: data.participantId,
          notice: 'The session host requests permission to record this live camera stream. Live viewing is separate from recording. You can approve or decline, and you may withdraw consent at any time.'
        });
      }
    });

    // Recording Consent: Participant responds (approved / declined) -> Targeted to Admin
    socket.on('consent:response', async (data: { decision: 'approved' | 'declined' }) => {
      if (socket.data.role !== 'participant') {
        return;
      }
      const participantId = socket.data.participantId;
      const sessionId = socket.data.sessionId;
      if (!participantId || !sessionId) return;

      const event = await SessionStore.recordConsentEvent({
        participantId,
        sessionId,
        consentType: 'video_recording',
        consentStatus: data.decision
      });

      const adminSocketId = adminSockets.get(sessionId);
      if (adminSocketId) {
        io.to(adminSocketId).emit('consent:status-updated', {
          participantId,
          decision: data.decision,
          consentEventId: event.id
        });
      }
    });

    // Recording Consent: Participant withdraws consent mid-stream -> Targeted to Admin
    socket.on('consent:withdraw', async () => {
      if (socket.data.role !== 'participant') {
        return;
      }
      const participantId = socket.data.participantId;
      const sessionId = socket.data.sessionId;
      if (!participantId || !sessionId) return;

      await SessionStore.recordConsentEvent({
        participantId,
        sessionId,
        consentType: 'video_recording',
        consentStatus: 'withdrawn'
      });

      const adminSocketId = adminSockets.get(sessionId);
      if (adminSocketId) {
        io.to(adminSocketId).emit('consent:withdrawn', {
          participantId,
          message: 'Participant withdrew recording consent. Recording has been halted.'
        });
      }
    });

    // Admin terminates session
    socket.on('admin:end-session', async (data: { sessionId: string }) => {
      if (socket.data.role !== 'admin') {
        return;
      }
      const room = `session:${data.sessionId}`;
      await SessionStore.endSession(data.sessionId);
      io.to(room).emit('session:ended', { message: 'Session has been ended by the host.' });
    });

    // Clean up on disconnect
    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      if (socket.data.role === 'admin' && socket.data.sessionId) {
        if (adminSockets.get(socket.data.sessionId) === socket.id) {
          adminSockets.delete(socket.data.sessionId);
        }
      } else if (socket.data.role === 'participant' && socket.data.participantId) {
        await SessionStore.disconnectParticipant(socket.data.participantId);
        const adminSocketId = adminSockets.get(socket.data.sessionId);
        if (adminSocketId) {
          io.to(adminSocketId).emit('participant:disconnected', {
            participantId: socket.data.participantId,
            socketId: socket.id
          });
        }
      }
    });
  });
}
