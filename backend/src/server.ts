import express, { Request, Response } from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import sessionsRouter from './routes/sessions.js';
import invitationsRouter from './routes/invitations.js';
import participantsRouter from './routes/participants.js';
import consentRouter from './routes/consent.js';
import recordingsRouter from './routes/recordings.js';
import { setupSignalling } from './sockets/signalling.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

// Configure Allowed Origins (Supports localhost, configured LAN IP, and production HTTPS URLs)
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const allowedOriginsSet = new Set([
  frontendUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...rawAllowedOrigins
]);

const corsOriginValidator = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
  if (!origin) {
    return callback(null, true);
  }
  if (allowedOriginsSet.has('*') || allowedOriginsSet.has(origin) || origin.endsWith('.vercel.app') || origin.includes('vercel.app')) {
    return callback(null, true);
  }
  // Check if matches private LAN IP pattern if explicitly in development mode
  if (process.env.NODE_ENV === 'development') {
    const isLocalLan = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/.test(origin);
    if (isLocalLan) {
      return callback(null, true);
    }
  }
  console.warn(`[CORS] Blocked request from disallowed origin: ${origin}`);
  callback(new Error(`Not allowed by CORS: ${origin}`));
};

// Configure Express CORS
app.use(cors({
  origin: corsOriginValidator,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.IO Setup with identical origin rules
const io = new Server(server, {
  cors: {
    origin: corsOriginValidator,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

setupSignalling(io);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Live Selfie Connect Backend',
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/sessions', sessionsRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/participants', participantsRouter);
app.use('/api/participants', consentRouter);
app.use('/api/recordings', recordingsRouter);

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Live Selfie Connect Server listening on port ${PORT}`);
  console.log(`📡 WebSocket Signalling Ready (Role-Targeted Point-to-Point)`);
  console.log(`🔒 Camera Only (No Audio), Strict Consent Architecture`);
  console.log(`🌐 Allowed Origins: ${Array.from(allowedOriginsSet).join(', ')}`);
  console.log(`===============================================`);
});
