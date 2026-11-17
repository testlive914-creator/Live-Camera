import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-supabase-project')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    console.log('[Supabase] Initialized cloud client successfully.');
  } catch (err) {
    console.warn('[Supabase] Failed to initialize client, using in-memory store:', err);
    supabase = null;
  }
} else {
  console.log('[Notice] Supabase credentials not set. Running in resilient In-Memory Mode for local testing and zero-friction MVP execution.');
}
