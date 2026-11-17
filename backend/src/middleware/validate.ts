import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export const createSessionSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150, 'Title cannot exceed 150 characters'),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional().default(''),
  durationMinutes: z.coerce.number().min(5, 'Minimum duration is 5 minutes').max(1440, 'Maximum duration is 24 hours').default(60),
  maxParticipants: z.coerce.number().int().min(1, 'Minimum 1 participant').max(10, 'Maximum 10 participants').default(2)
});

export const joinInvitationSchema = z.object({
  displayName: z.string().trim().max(50, 'Name cannot exceed 50 characters').optional().default('Friend')
});

export const consentResponseSchema = z.object({
  decision: z.enum(['approved', 'declined'])
});

export const recordingUploadSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  participantId: z.string().min(1, 'participantId is required'),
  durationSeconds: z.coerce.number().min(0).default(0)
});

export function validateBody(schema: z.ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (err: any) {
      if (err instanceof ZodError || err.issues) {
        const issues = (err.issues || []).map((e: any) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : '',
          message: e.message
        }));
        res.status(400).json({
          error: 'Validation failed',
          details: issues
        });
        return;
      }
      res.status(400).json({ error: 'Malformed request payload' });
    }
  };
}
