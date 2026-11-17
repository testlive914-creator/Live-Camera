import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = 
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-supabase-project')
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const authService = {
  isConfigured: () => !!supabase,
  
  async loginWithEmail(email: string): Promise<{ error: Error | null; simulated?: boolean }> {
    if (supabase) {
      const { error } = await supabase.auth.signInWithOtp({ email });
      return { error };
    }
    // Local / Dev Fallback: simulate immediate admin sign-in with dev token
    const devToken = `dev-token-${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
    localStorage.setItem('lsc_admin_auth', JSON.stringify({ email, loggedIn: true, token: devToken }));
    return { error: null, simulated: true };
  },

  isAdminLoggedIn(): boolean {
    const raw = localStorage.getItem('lsc_admin_auth');
    if (!raw) return true; // Default allow for development preview
    try {
      const parsed = JSON.parse(raw);
      return parsed.loggedIn === true;
    } catch {
      return true;
    }
  },

  getAdminToken(): string {
    // 1. If Supabase is active, check active session from localStorage
    if (supabase) {
      try {
        const sessionKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (sessionKey) {
          const raw = localStorage.getItem(sessionKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.access_token) {
              return parsed.access_token;
            }
          }
        }
      } catch {}
    }

    // 2. Dev mode token fallback
    try {
      const raw = localStorage.getItem('lsc_admin_auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.token) return parsed.token;
      }
    } catch {}

    return 'dev-preview-admin-token';
  },

  logout(): void {
    if (supabase) {
      supabase.auth.signOut();
    }
    localStorage.removeItem('lsc_admin_auth');
  }
};
