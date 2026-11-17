import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies admin authentication token.
 * Validates Supabase JWT if Supabase is active, or validates local dev admin token.
 */
export async function verifyAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Admin authentication token required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Malformed authorization token' });
    return;
  }

  const user = await verifyTokenString(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired admin authentication token' });
    return;
  }

  req.admin = user;
  next();
}

/**
 * Token verification function usable by both HTTP middleware and Socket.IO handshake.
 */
export async function verifyTokenString(token: string): Promise<AuthenticatedUser | null> {
  // 1. Supabase Cloud JWT Verification
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        return {
          id: data.user.id,
          email: data.user.email || 'admin@cloud.supabase'
        };
      }
    } catch (err) {
      console.warn('[Auth] Supabase token verification failed:', err);
    }
  }

  // 2. Development Mode / Local Fallback Token
  // Tokens formatted as `dev-token-<adminId>` or fallback for local development preview
  if (token.startsWith('dev-token-')) {
    const adminId = token.replace('dev-token-', '').trim() || 'dev-admin-1';
    return {
      id: adminId,
      email: `${adminId}@liveselfie.local`
    };
  }

  if (token === 'dev-preview-admin-token') {
    return {
      id: 'dev-admin-1',
      email: 'admin@liveselfie.local'
    };
  }

  return null;
}
