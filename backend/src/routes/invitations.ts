import { Router, Request, Response } from 'express';
import { SessionStore } from '../services/sessionStore.js';
import { invitationRateLimiter } from '../middleware/rateLimit.js';
import { validateBody, joinInvitationSchema } from '../middleware/validate.js';

const router = Router();

// Apply invitation rate limiting
router.use(invitationRateLimiter);

// GET /api/invitations/:token: Validate invitation token
router.get('/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.params.token as string;
    if (!token || token.trim().length === 0) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const session = await SessionStore.getSessionByToken(token);
    if (!session) {
      res.status(404).json({ error: 'Invitation not found or invalid' });
      return;
    }

    // Check revocation
    if (session.status === 'revoked') {
      res.status(403).json({ error: 'This invitation link has been revoked by the session host' });
      return;
    }

    if (session.status === 'ended') {
      res.status(410).json({ error: 'This session has already ended' });
      return;
    }

    // Check expiration
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      res.status(410).json({ error: 'This invitation link has expired' });
      return;
    }

    // Check participant limit
    const participants = await SessionStore.getParticipantsBySession(session.id);
    const activeCount = participants.filter(p => p.connectionStatus === 'connected').length;
    if (activeCount >= session.maxParticipants) {
      res.status(429).json({ error: 'Session is full. Maximum participant limit reached.' });
      return;
    }

    res.json({
      valid: true,
      sessionId: session.id,
      title: session.title,
      description: session.description,
      expiresAt: session.expiresAt,
      maxParticipants: session.maxParticipants,
      activeParticipants: activeCount
    });
  } catch (err: any) {
    console.error('[Invitations Route] Validate error:', err);
    res.status(500).json({ error: 'Internal server error validating invitation' });
  }
});

// POST /api/invitations/:token/join: Join session with display name
router.post('/:token/join', validateBody(joinInvitationSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.params.token as string;
    const { displayName } = req.body;

    const session = await SessionStore.getSessionByToken(token);
    if (!session || session.status !== 'active') {
      res.status(403).json({ error: 'Invalid or inactive session invitation' });
      return;
    }

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      res.status(410).json({ error: 'Invitation link has expired' });
      return;
    }

    const participants = await SessionStore.getParticipantsBySession(session.id);
    const activeCount = participants.filter(p => p.connectionStatus === 'connected').length;
    if (activeCount >= session.maxParticipants) {
      res.status(429).json({ error: 'Session is full. Maximum participant limit reached.' });
      return;
    }

    const name = displayName?.trim() || 'Friend';
    const participant = await SessionStore.addParticipant(session.id, name);

    // Record initial consent event for camera stream
    await SessionStore.recordConsentEvent({
      participantId: participant.id,
      sessionId: session.id,
      consentType: 'camera_stream',
      consentStatus: 'approved'
    });

    res.status(201).json({
      participant,
      session: {
        id: session.id,
        title: session.title,
        description: session.description
      }
    });
  } catch (err: any) {
    console.error('[Invitations Route] Join error:', err);
    res.status(500).json({ error: 'Internal server error joining session' });
  }
});

export default router;
