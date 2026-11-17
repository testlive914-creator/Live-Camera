import { authService } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface SessionData {
  id: string;
  adminId: string;
  title: string;
  description: string;
  invitationTokenHash: string;
  expiresAt: string;
  maxParticipants: number;
  status: 'active' | 'revoked' | 'ended';
  createdAt: string;
  participantCount?: number;
  activeParticipantCount?: number;
}

export interface ParticipantData {
  id: string;
  sessionId: string;
  displayName: string;
  connectionStatus: 'connected' | 'disconnected' | 'rejected';
  joinedAt: string;
}

export interface RecordingData {
  id: string;
  sessionId: string;
  participantId: string;
  participantName: string;
  sessionTitle: string;
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: string;
}

function getAuthHeaders(): HeadersInit {
  const token = authService.getAdminToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

export const api = {
  // Sessions (Admin protected)
  async createSession(params: {
    title: string;
    description?: string;
    durationMinutes: number;
    maxParticipants: number;
  }): Promise<{ session: SessionData; rawToken: string; invitationUrl: string; whatsappUrl: string }> {
    const res = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create session');
    }
    return res.json();
  },

  async listSessions(): Promise<SessionData[]> {
    const res = await fetch(`${API_BASE_URL}/api/sessions`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to list sessions');
    }
    const data = await res.json();
    return data.sessions;
  },

  async getSession(id: string): Promise<{ session: SessionData; participants: ParticipantData[] }> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${id}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to get session');
    }
    return res.json();
  },

  async revokeSession(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${id}/revoke`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to revoke session link');
    }
  },

  async endSession(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${id}/end`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to end session');
    }
  },

  // Invitations (Public for guests / friends)
  async validateInvitation(token: string): Promise<{
    valid: boolean;
    sessionId: string;
    title: string;
    description: string;
    expiresAt: string;
    maxParticipants: number;
    activeParticipants: number;
  }> {
    const res = await fetch(`${API_BASE_URL}/api/invitations/${token}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Invitation is invalid or expired');
    return data;
  },

  async joinInvitation(token: string, displayName: string): Promise<{
    participant: ParticipantData;
    session: { id: string; title: string; description: string };
  }> {
    const res = await fetch(`${API_BASE_URL}/api/invitations/${token}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to join session');
    return data;
  },

  // Recordings (Admin protected)
  async listRecordings(): Promise<RecordingData[]> {
    const res = await fetch(`${API_BASE_URL}/api/recordings`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to list recordings');
    }
    const data = await res.json();
    return data.recordings;
  },

  getRecordingStreamUrl(id: string): string {
    const token = authService.getAdminToken();
    return `${API_BASE_URL}/api/recordings/${id}/stream?token=${encodeURIComponent(token)}`;
  },

  async deleteRecording(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/recordings/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete recording');
    }
  },

  async uploadRecording(formData: FormData): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/recordings/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  }
};
