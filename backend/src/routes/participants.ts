import { Router, Request, Response } from 'express';
import { SessionStore } from '../services/sessionStore.js';

const router = Router();

// POST /api/participants/:id/leave
router.post('/:id/leave', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await SessionStore.disconnectParticipant(id);
    res.json({ success: true, message: 'Participant disconnected' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
