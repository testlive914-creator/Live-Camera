import { Router, Request, Response } from 'express';
import { SessionStore } from '../services/sessionStore.js';
import { verifyAdminAuth } from '../middleware/auth.js';
import { validateBody, consentResponseSchema } from '../middleware/validate.js';

const router = Router();

// POST /api/participants/:id/consent/request (Admin requests recording consent with auth check)
router.post('/:id/consent/request', verifyAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const participant = await SessionStore.getParticipant(id);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    // Verify requesting admin owns the session
    const session = await SessionStore.getSessionById(participant.sessionId);
    if (!session || session.adminId !== req.admin!.id) {
      res.status(403).json({ error: 'Forbidden: You do not own this session' });
      return;
    }

    const event = await SessionStore.recordConsentEvent({
      participantId: participant.id,
      sessionId: participant.sessionId,
      consentType: 'video_recording',
      consentStatus: 'requested',
      noticeVersion: 'v1.0'
    });

    res.json({ success: true, consentEvent: event });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error requesting consent' });
  }
});

// POST /api/participants/:id/consent/respond (Participant approves or declines)
router.post('/:id/consent/respond', validateBody(consentResponseSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { decision } = req.body;

    const participant = await SessionStore.getParticipant(id);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    const event = await SessionStore.recordConsentEvent({
      participantId: participant.id,
      sessionId: participant.sessionId,
      consentType: 'video_recording',
      consentStatus: decision,
      noticeVersion: 'v1.0'
    });

    res.json({ success: true, consentEvent: event });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error responding to consent' });
  }
});

// POST /api/participants/:id/consent/withdraw (Participant revokes recording approval)
router.post('/:id/consent/withdraw', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const participant = await SessionStore.getParticipant(id);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    const event = await SessionStore.recordConsentEvent({
      participantId: participant.id,
      sessionId: participant.sessionId,
      consentType: 'video_recording',
      consentStatus: 'withdrawn',
      noticeVersion: 'v1.0'
    });

    res.json({ success: true, message: 'Consent withdrawn successfully', consentEvent: event });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error withdrawing consent' });
  }
});

// GET /api/participants/:id/consent/status
router.get('/:id/consent/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const activeConsent = await SessionStore.getActiveRecordingConsent(id);
    res.json({
      participantId: id,
      recordingConsentApproved: activeConsent !== null,
      consentEvent: activeConsent
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
