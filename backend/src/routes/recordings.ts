import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { SessionStore, Recording } from '../services/sessionStore.js';
import { supabase } from '../services/supabase.js';
import { verifyAdminAuth, verifyTokenString } from '../middleware/auth.js';
import { uploadRateLimiter } from '../middleware/rateLimit.js';
import { recordingUploadSchema } from '../middleware/validate.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB maximum for free-tier protection
});

// POST /api/recordings/upload: Upload recorded video stream
// Gated by upload rate limiter and strict participant consent
router.post('/upload', uploadRateLimiter, upload.single('video'), async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Video file is required' });
      return;
    }

    const parseResult = recordingUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = ((parseResult.error as any).issues || []).map((e: any) => ({
        field: Array.isArray(e.path) ? e.path.join('.') : '',
        message: e.message
      }));
      res.status(400).json({
        error: 'Validation failed',
        details: issues
      });
      return;
    }

    const { sessionId, participantId, durationSeconds } = parseResult.data;

    // STRICT CONSENT VERIFICATION: Check that participant explicitly approved recording
    const activeConsent = await SessionStore.getActiveRecordingConsent(participantId);
    if (!activeConsent) {
      res.status(403).json({
        error: 'Forbidden: Cannot save recording without explicit, active participant consent.'
      });
      return;
    }

    const session = await SessionStore.getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const participant = await SessionStore.getParticipant(participantId);

    const recordingId = crypto.randomUUID();
    const timestamp = Date.now();
    const storagePath = `recordings/${sessionId}/${participantId}_${timestamp}.webm`;

    // If Supabase Storage is configured, upload to private bucket
    if (supabase) {
      const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'video-recordings';
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype || 'video/webm',
          upsert: false
        });

      if (uploadError) {
        console.warn('[Recordings] Supabase storage upload failed, saving in memory buffer:', uploadError.message);
      }
    }

    const recording: Recording = {
      id: recordingId,
      sessionId,
      participantId,
      participantName: participant?.displayName || 'Friend',
      sessionTitle: session.title,
      storagePath,
      durationSeconds,
      fileSizeBytes: file.size,
      mimeType: file.mimetype || 'video/webm',
      consentEventId: activeConsent.id,
      status: 'completed',
      createdAt: new Date().toISOString(),
      dataBuffer: file.buffer // Stored for in-memory stream fallback
    };

    await SessionStore.saveRecording(recording);

    res.status(201).json({
      success: true,
      recording: {
        id: recording.id,
        sessionId: recording.sessionId,
        participantName: recording.participantName,
        sessionTitle: recording.sessionTitle,
        durationSeconds: recording.durationSeconds,
        fileSizeBytes: recording.fileSizeBytes,
        createdAt: recording.createdAt
      }
    });
  } catch (err: any) {
    console.error('[Recordings Route] Upload error:', err);
    res.status(500).json({ error: 'Internal server error uploading recording' });
  }
});

// GET /api/recordings: List recordings belonging to authenticated admin
router.get('/', verifyAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.admin!.id;
    const recordings = await SessionStore.listRecordings(adminId);
    const sanitized = recordings.map(r => ({
      id: r.id,
      sessionId: r.sessionId,
      participantId: r.participantId,
      participantName: r.participantName,
      sessionTitle: r.sessionTitle,
      durationSeconds: r.durationSeconds,
      fileSizeBytes: r.fileSizeBytes,
      mimeType: r.mimeType,
      createdAt: r.createdAt
    }));
    res.json({ recordings: sanitized });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error listing recordings' });
  }
});

// GET /api/recordings/:id/stream: Stream video (Protected with Admin Auth & Ownership Verification)
router.get('/:id/stream', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    
    // Support either Authorization header OR ?token= query parameter for <video> and download links
    let authUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      authUser = await verifyTokenString(authHeader.split(' ')[1]);
    } else if (req.query.token && typeof req.query.token === 'string') {
      authUser = await verifyTokenString(req.query.token);
    }

    if (!authUser) {
      res.status(401).json({ error: 'Unauthorized: Admin authentication required to stream recordings' });
      return;
    }

    const recording = await SessionStore.getRecording(id);
    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    // Check ownership: Verify recording's session was created by this admin
    const session = await SessionStore.getSessionById(recording.sessionId);
    if (!session || session.adminId !== authUser.id) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to access this recording' });
      return;
    }

    // Check if stored in memory buffer
    if (recording.dataBuffer) {
      res.setHeader('Content-Type', recording.mimeType || 'video/webm');
      res.setHeader('Content-Length', recording.fileSizeBytes);
      res.setHeader('Content-Disposition', `inline; filename="recording_${recording.id}.webm"`);
      res.send(recording.dataBuffer);
      return;
    }

    // If Supabase Storage is configured, generate signed URL
    if (supabase) {
      const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'video-recordings';
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(recording.storagePath, 3600); // 1-hour valid signed URL

      if (!error && data?.signedUrl) {
        res.redirect(data.signedUrl);
        return;
      }
    }

    res.status(404).json({ error: 'Video file buffer not found' });
  } catch (err: any) {
    console.error('[Recordings Route] Stream error:', err);
    res.status(500).json({ error: 'Internal server error streaming recording' });
  }
});

// DELETE /api/recordings/:id: Delete recording (Protected with Admin Auth & Ownership Verification)
router.delete('/:id', verifyAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const recording = await SessionStore.getRecording(id);
    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    // Ownership check
    const session = await SessionStore.getSessionById(recording.sessionId);
    if (!session || session.adminId !== req.admin!.id) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to delete this recording' });
      return;
    }

    if (supabase) {
      const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'video-recordings';
      await supabase.storage.from(bucketName).remove([recording.storagePath]);
    }

    await SessionStore.deleteRecording(id);
    res.json({ success: true, message: 'Recording deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error deleting recording' });
  }
});

export default router;
