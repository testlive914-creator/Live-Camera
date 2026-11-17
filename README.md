# Live Selfie Connect 🤳🎥

> A security-first, consent-driven, real-time camera streaming web application and admin dashboard built with native WebRTC, Socket.IO, React, Node.js, and Supabase. Engineered specifically for zero-cost deployment on free-tier services.

---

## 🌟 Security Guarantees & Remediation

Following a complete security and functionality audit, the application implements strict safeguards:

1. **Admin Authentication & Resource Ownership**:
   - Express REST endpoints (`/api/sessions`, `/api/recordings`, `/api/recordings/:id/stream`) require verified admin authentication (`Authorization: Bearer <token>`).
   - Admins can only view, manage, and download sessions and recordings belonging to their own identity.
   - Cross-admin data access returns `HTTP 403 Forbidden`. Unauthenticated requests return `HTTP 401 Unauthorized`.
2. **WebSocket Admin Authorization**:
   - Socket event `admin:join` requires a verified authentication token. Session ownership is verified server-side before granting admin privileges.
   - Participants cannot claim admin roles or issue host commands.
3. **Targeted Point-to-Point WebRTC Signalling**:
   - The server maintains the authenticated admin socket ID per session.
   - Participant SDP offers and ICE candidates are routed **directly to the session host**—never broadcast to other participants.
4. **Buffered ICE Candidates**:
   - Both Dashboard and Participant clients buffer incoming ICE candidates until `remoteDescription` is set, eliminating `InvalidStateError` race conditions.
5. **WebRTC Reconnection & Recovery**:
   - `RTCPeerConnection` monitors connection state and triggers bounded ICE restart attempts (max 3 retries) upon network drops.
6. **Configurable LAN & Mobile CORS**:
   - Configurable `ALLOWED_ORIGINS` environment variable allows LAN testing on local Wi-Fi without wildcards.
7. **Rate Limiting & Input Validation**:
   - Stricter rate limits on invitation validation (30 req/min) and uploads (10 req/min) via `express-rate-limit`.
   - Structured payload validation using Zod schemas.
8. **Live Front-Camera Video Only**:
   - `audio: false` is strictly enforced everywhere. No microphone access is ever requested or transmitted.
9. **Explicit Two-Stage Consent**:
   - Participant explicitly clicks **Start Selfie** to open camera preview and stream.
   - Recording requires separate explicit participant consent via an in-stream modal. Unapproved uploads return `HTTP 403 Forbidden`. Mid-stream withdrawal immediately halts and discards recording buffers.

---

## 📁 Project Structure

```
live-selfie-connect/
├── backend/
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── auth.ts           # Admin JWT & dev token verification
│   │   │   ├── validate.ts       # Zod schema input validation
│   │   │   └── rateLimit.ts      # Stricter rate limits for tokens and uploads
│   │   ├── routes/
│   │   │   ├── sessions.ts       # Protected session routes with ownership checks
│   │   │   ├── invitations.ts    # Public guest invitation endpoints (rate-limited)
│   │   │   ├── participants.ts   # Participant disconnect handler
│   │   │   ├── consent.ts        # Request, approve, decline & withdraw consent
│   │   │   └── recordings.ts     # Stream upload with consent check & protected streaming
│   │   ├── services/
│   │   │   ├── sessionStore.ts   # Session & consent state management + hash checks
│   │   │   └── supabase.ts       # Supabase client + resilient in-memory fallback
│   │   ├── sockets/
│   │   │   └── signalling.ts     # Role-targeted WebRTC point-to-point signalling
│   │   ├── tests/
│   │   │   └── verifyAll.ts      # Comprehensive 15-test automated verification suite
│   │   └── server.ts             # Express + Socket.IO server with LAN CORS
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx             # Dark header with navigation & status
│   │   │   └── CreateSessionModal.tsx # Session configuration & WhatsApp share generator
│   │   ├── pages/
│   │   │   ├── AdminLogin.tsx    # Admin authentication & quick dev preview
│   │   │   ├── Dashboard.tsx     # Video grid, ICE buffer, reconnect recovery & recording
│   │   │   ├── Sessions.tsx      # Active sessions, participant counts & revocation
│   │   │   ├── Recordings.tsx    # Protected recording library with authenticated player
│   │   │   └── JoinSession.tsx   # Mobile-first participant streamer, ICE queue & consent
│   │   ├── services/
│   │   │   ├── api.ts            # Authenticated REST API client
│   │   │   ├── socket.ts         # Socket.IO client instance
│   │   │   ├── webrtc.ts         # getUserMedia (audio: false) & STUN configurations
│   │   │   └── supabase.ts       # Client-side Supabase authentication
│   │   ├── App.tsx               # Client routes
│   │   ├── main.tsx
│   │   └── index.css             # Tailwind dark theme
│   ├── package.json
│   └── vite.config.ts
├── database/
│   └── migrations/
│       └── 001_initial_schema.sql # Complete Supabase PostgreSQL schema & RLS policies
├── .env.example
└── README.md
```

---

## 🚀 Running Verification Tests

Run the full automated test suite verifying all 15 security, signalling, and consent guarantees:
```bash
cd backend
npm test
```
All 15 automated tests will execute and report:
`Summary: 15 / 15 Tests Passed. Final Test Suite Verdict: 🏆 ALL PASS`

---

## 💻 Local Running Instructions

### 1. Start the Backend
```bash
cd backend
npm install
npm run dev
```
*(Runs on `http://localhost:5000`)*

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
*(Runs on `http://localhost:5173`)*

---

## 📱 Mobile Device Testing Over Local Wi-Fi (LAN)

Mobile browsers require two things:
1. **LAN IP in Allowed Origins**:
   - Find your computer's local IP (e.g. `192.168.1.15`) using `ipconfig`.
   - In `backend/.env`, set:
     ```env
     ALLOWED_ORIGINS=http://localhost:5173,http://192.168.1.15:5173
     ```
2. **HTTPS Context for Camera Access**:
   - Mobile browsers (iOS Safari, Android Chrome) strictly block `getUserMedia` on plain HTTP across network IPs (`http://192.168.x.x`).
   - Use a free HTTPS tunnel for testing on your phone:
     ```bash
     # Example with Cloudflare Tunnel (no account required)
     npx cloudflared tunnel --url http://localhost:5173
     ```
   - Open the generated `https://...trycloudflare.com` URL on your mobile phone to test real front-camera video and consent prompts!
