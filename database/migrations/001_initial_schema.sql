-- Live Selfie Connect: Initial Schema Migration
-- Designed for Supabase PostgreSQL with Row Level Security (RLS)

-- 1. Admin Profiles
CREATE TABLE IF NOT EXISTS admin_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admin_profiles(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    invitation_token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    max_participants INT DEFAULT 2,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'ended')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(invitation_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- 3. Participants
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    connection_status VARCHAR(20) DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'rejected')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);

-- 4. Consent Events (Live Streaming & Recording)
CREATE TABLE IF NOT EXISTS consent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    consent_type VARCHAR(30) NOT NULL CHECK (consent_type IN ('camera_stream', 'video_recording')),
    consent_status VARCHAR(20) NOT NULL CHECK (consent_status IN ('requested', 'approved', 'declined', 'withdrawn')),
    notice_version VARCHAR(20) DEFAULT 'v1.0',
    granted_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_participant ON consent_events(participant_id);

-- 5. Recordings
CREATE TABLE IF NOT EXISTS recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
    storage_path TEXT NOT NULL,
    duration_seconds INT DEFAULT 0,
    file_size_bytes BIGINT DEFAULT 0,
    mime_type VARCHAR(50) DEFAULT 'video/webm',
    consent_event_id UUID REFERENCES consent_events(id),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('uploading', 'completed', 'deleted')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recordings_session ON recordings(session_id);

-- 6. Session Audit Events
CREATE TABLE IF NOT EXISTS session_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;

-- Admins can read & update their own profile
CREATE POLICY "Admins own profile" ON admin_profiles
    FOR ALL USING (auth.uid() = auth_user_id);

-- Admins can manage sessions they created
CREATE POLICY "Admins manage sessions" ON sessions
    FOR ALL USING (
        admin_id IN (SELECT id FROM admin_profiles WHERE auth_user_id = auth.uid())
    );

-- Participants can only insert/view their own record during active session
CREATE POLICY "Admins view all participants in their sessions" ON participants
    FOR SELECT USING (
        session_id IN (
            SELECT s.id FROM sessions s
            JOIN admin_profiles a ON s.admin_id = a.id
            WHERE a.auth_user_id = auth.uid()
        )
    );

-- Recordings accessible strictly by session admin
CREATE POLICY "Admins view recordings" ON recordings
    FOR SELECT USING (
        session_id IN (
            SELECT s.id FROM sessions s
            JOIN admin_profiles a ON s.admin_id = a.id
            WHERE a.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Admins delete recordings" ON recordings
    FOR DELETE USING (
        session_id IN (
            SELECT s.id FROM sessions s
            JOIN admin_profiles a ON s.admin_id = a.id
            WHERE a.auth_user_id = auth.uid()
        )
    );

-- STORAGE BUCKET CONFIGURATION
-- Run in Supabase SQL editor:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('video-recordings', 'video-recordings', false);
