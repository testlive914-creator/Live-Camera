import crypto from 'node:crypto';
import { supabase } from './supabase.js';

export interface Session {
  id: string;
  adminId: string;
  title: string;
  description: string;
  invitationTokenHash: string;
  expiresAt: string;
  maxParticipants: number;
  status: 'active' | 'revoked' | 'ended';
  createdAt: string;
}

export interface Participant {
  id: string;
  sessionId: string;
  displayName: string;
  connectionStatus: 'connected' | 'disconnected' | 'rejected';
  socketId?: string;
  joinedAt: string;
  disconnectedAt?: string;
}

export interface ConsentEvent {
  id: string;
  participantId: string;
  sessionId: string;
  consentType: 'camera_stream' | 'video_recording';
  consentStatus: 'requested' | 'approved' | 'declined' | 'withdrawn';
  noticeVersion: string;
  grantedAt?: string;
  withdrawnAt?: string;
  createdAt: string;
}

export interface Recording {
  id: string;
  sessionId: string;
  participantId: string;
  participantName: string;
  sessionTitle: string;
  storagePath: string;
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
  consentEventId: string;
  status: 'uploading' | 'completed' | 'deleted';
  createdAt: string;
  dataBuffer?: Buffer; // In-memory buffer fallback when Supabase Storage is not configured
}

// In-Memory Fallback Store
const memorySessions = new Map<string, Session>();
const memoryParticipants = new Map<string, Participant>();
const memoryConsentEvents = new Map<string, ConsentEvent & { seq: number }>();
const memoryRecordings = new Map<string, Recording>();
let consentEventSeq = 0;

export class SessionStore {
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static generateSecureToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  static async createSession(data: {
    adminId: string;
    title: string;
    description?: string;
    durationMinutes: number;
    maxParticipants?: number;
  }): Promise<{ session: Session; rawToken: string }> {
    const rawToken = this.generateSecureToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + (data.durationMinutes || 60) * 60 * 1000).toISOString();

    const session: Session = {
      id: crypto.randomUUID(),
      adminId: data.adminId,
      title: data.title,
      description: data.description || '',
      invitationTokenHash: tokenHash,
      expiresAt,
      maxParticipants: data.maxParticipants || 2,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    if (supabase) {
      const { data: dbSession, error } = await supabase
        .from('sessions')
        .insert({
          id: session.id,
          admin_id: session.adminId,
          title: session.title,
          description: session.description,
          invitation_token_hash: session.invitationTokenHash,
          expires_at: session.expiresAt,
          max_participants: session.maxParticipants,
          status: session.status
        })
        .select()
        .single();

      if (error) {
        console.error('[SessionStore] Supabase insert failed, falling back to memory:', error);
        memorySessions.set(session.id, session);
      } else if (dbSession) {
        memorySessions.set(session.id, session);
      }
    } else {
      memorySessions.set(session.id, session);
    }

    return { session, rawToken };
  }

  static async getSessionById(sessionId: string): Promise<Session | null> {
    if (memorySessions.has(sessionId)) {
      return memorySessions.get(sessionId)!;
    }
    if (supabase) {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      if (!error && data) {
        const s: Session = {
          id: data.id,
          adminId: data.admin_id,
          title: data.title,
          description: data.description,
          invitationTokenHash: data.invitation_token_hash,
          expiresAt: data.expires_at,
          maxParticipants: data.max_participants,
          status: data.status,
          createdAt: data.created_at
        };
        memorySessions.set(s.id, s);
        return s;
      }
    }
    return null;
  }

  static async getSessionByToken(token: string): Promise<Session | null> {
    const hash = this.hashToken(token);
    for (const session of memorySessions.values()) {
      if (session.invitationTokenHash === hash) {
        return session;
      }
    }
    if (supabase) {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('invitation_token_hash', hash)
        .single();
      if (!error && data) {
        const s: Session = {
          id: data.id,
          adminId: data.admin_id,
          title: data.title,
          description: data.description,
          invitationTokenHash: data.invitation_token_hash,
          expiresAt: data.expires_at,
          maxParticipants: data.max_participants,
          status: data.status,
          createdAt: data.created_at
        };
        memorySessions.set(s.id, s);
        return s;
      }
    }
    return null;
  }

  static async listSessions(adminId?: string): Promise<Session[]> {
    let list = Array.from(memorySessions.values());
    if (adminId) {
      list = list.filter(s => s.adminId === adminId);
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  static async revokeSession(sessionId: string): Promise<boolean> {
    const session = await this.getSessionById(sessionId);
    if (!session) return false;
    session.status = 'revoked';
    memorySessions.set(sessionId, session);
    if (supabase) {
      await supabase.from('sessions').update({ status: 'revoked' }).eq('id', sessionId);
    }
    return true;
  }

  static async endSession(sessionId: string): Promise<boolean> {
    const session = await this.getSessionById(sessionId);
    if (!session) return false;
    session.status = 'ended';
    memorySessions.set(sessionId, session);
    if (supabase) {
      await supabase.from('sessions').update({ status: 'ended' }).eq('id', sessionId);
    }
    return true;
  }

  static async addParticipant(sessionId: string, displayName: string, socketId?: string): Promise<Participant> {
    const participant: Participant = {
      id: crypto.randomUUID(),
      sessionId,
      displayName: displayName.trim() || 'Guest',
      connectionStatus: 'connected',
      socketId,
      joinedAt: new Date().toISOString()
    };
    memoryParticipants.set(participant.id, participant);
    return participant;
  }

  static async updateParticipantSocket(participantId: string, socketId: string): Promise<void> {
    const p = memoryParticipants.get(participantId);
    if (p) {
      p.socketId = socketId;
      p.connectionStatus = 'connected';
    }
  }

  static async disconnectParticipant(participantId: string): Promise<void> {
    const p = memoryParticipants.get(participantId);
    if (p) {
      p.connectionStatus = 'disconnected';
      p.disconnectedAt = new Date().toISOString();
    }
  }

  static async getParticipant(participantId: string): Promise<Participant | null> {
    return memoryParticipants.get(participantId) || null;
  }

  static async getParticipantsBySession(sessionId: string): Promise<Participant[]> {
    return Array.from(memoryParticipants.values()).filter(p => p.sessionId === sessionId);
  }

  // Consent Tracking
  static async recordConsentEvent(data: {
    participantId: string;
    sessionId: string;
    consentType: 'camera_stream' | 'video_recording';
    consentStatus: 'requested' | 'approved' | 'declined' | 'withdrawn';
    noticeVersion?: string;
  }): Promise<ConsentEvent> {
    consentEventSeq++;
    const event: ConsentEvent = {
      id: crypto.randomUUID(),
      participantId: data.participantId,
      sessionId: data.sessionId,
      consentType: data.consentType,
      consentStatus: data.consentStatus,
      noticeVersion: data.noticeVersion || 'v1.0',
      grantedAt: data.consentStatus === 'approved' ? new Date().toISOString() : undefined,
      withdrawnAt: data.consentStatus === 'withdrawn' ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString()
    };
    memoryConsentEvents.set(event.id, { ...event, seq: consentEventSeq });
    return event;
  }

  static async getActiveRecordingConsent(participantId: string): Promise<ConsentEvent | null> {
    const events = Array.from(memoryConsentEvents.values())
      .filter(e => e.participantId === participantId && e.consentType === 'video_recording')
      .sort((a, b) => b.seq - a.seq);

    if (events.length > 0 && events[0].consentStatus === 'approved') {
      return events[0];
    }
    return null;
  }

  // Recordings
  static async saveRecording(recording: Recording): Promise<Recording> {
    memoryRecordings.set(recording.id, recording);
    return recording;
  }

  static async listRecordings(adminId?: string): Promise<Recording[]> {
    let list = Array.from(memoryRecordings.values());
    if (adminId) {
      // Find all session IDs belonging to this admin
      const adminSessionIds = new Set(
        Array.from(memorySessions.values())
          .filter(s => s.adminId === adminId)
          .map(s => s.id)
      );
      list = list.filter(r => adminSessionIds.has(r.sessionId));
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  static async getRecording(recordingId: string): Promise<Recording | null> {
    return memoryRecordings.get(recordingId) || null;
  }

  static async deleteRecording(recordingId: string): Promise<boolean> {
    return memoryRecordings.delete(recordingId);
  }
}
