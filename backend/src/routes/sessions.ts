import { Router, Request, Response } from 'express';
import { SessionStore } from '../services/sessionStore.js';
import { verifyAdminAuth } from '../middleware/auth.js';
import { validateBody, createSessionSchema } from '../middleware/validate.js';
import { generalApiLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Protect all admin session endpoints
router.use(verifyAdminAuth);
router.use(generalApiLimiter);

// POST /api/sessions: Create new session and invitation token
router.post('/', validateBody(createSessionSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, durationMinutes, maxParticipants } = req.body;
    const adminId = req.admin!.id;

    const { session, rawToken } = await SessionStore.createSession({
      adminId,
      title,
      description,
      durationMinutes,
      maxParticipants
    });

    const originHeader = req.get('origin') || req.headers.origin;
    const frontendBaseUrl = (typeof originHeader === 'string' && originHeader) 
      ? originHeader 
      : (process.env.FRONTEND_URL || 'http://localhost:5173');
    const invitationUrl = `${frontendBaseUrl}/join/${rawToken}`;

    // Generate standard WhatsApp share message
    const waText = encodeURIComponent(
      `Join my Live Selfie Connect session "${session.title}": ${invitationUrl}\n(Note: Front-camera live stream only, no audio. Recording requires separate explicit consent).`
    );
    const whatsappUrl = `https://wa.me/?text=${waText}`;

    res.status(201).json({
      session,
      rawToken,
      invitationUrl,
      whatsappUrl
    });
  } catch (err: any) {
    console.error('[Sessions Route] Create failed:', err);
    res.status(500).json({ error: 'Internal server error creating session' });
  }
});

// GET /api/sessions: List all sessions belonging to the authenticated admin
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.admin!.id;
    const sessions = await SessionStore.listSessions(adminId);
    const enriched = await Promise.all(
      sessions.map(async (s) => {
        const participants = await SessionStore.getParticipantsBySession(s.id);
        const activeParticipants = participants.filter(p => p.connectionStatus === 'connected');
        return {
          ...s,
          participantCount: participants.length,
          activeParticipantCount: activeParticipants.length
        };
      })
    );
    res.json({ sessions: enriched });
  } catch (err: any) {
    console.error('[Sessions Route] List failed:', err);
    res.status(500).json({ error: 'Internal server error listing sessions' });
  }
});

// GET /api/sessions/:id: Retrieve session details (with ownership check)
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const session = await SessionStore.getSessionById(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.adminId !== req.admin!.id) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to view this session' });
      return;
    }

    const participants = await SessionStore.getParticipantsBySession(session.id);
    res.json({ session, participants });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions/:id/revoke: Revoke invitation link (with ownership check)
router.post('/:id/revoke', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const session = await SessionStore.getSessionById(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.adminId !== req.admin!.id) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to modify this session' });
      return;
    }

    await SessionStore.revokeSession(id);
    res.json({ success: true, message: 'Session invitation link revoked' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions/:id/end: End active session (with ownership check)
router.post('/:id/end', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const session = await SessionStore.getSessionById(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.adminId !== req.admin!.id) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to end this session' });
      return;
    }

    await SessionStore.endSession(id);
    res.json({ success: true, message: 'Session successfully ended' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
