import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Only create client if credentials are provided
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/** Returns true if Supabase Auth is reachable (e.g. project not paused). Use before redirecting to OAuth. */
export async function checkAuthHealth(): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseAnonKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Database types for future use (translation history, user preferences, etc.)
export interface TranslationHistory {
  id: string;
  user_id?: string;
  input_text: string;
  target_lang: string;
  result: {
    summary: string;
    rewrites: {
      strong: string;
      casual: string;
      soft: string;
    };
  };
  created_at: string;
}

/** Row shape returned from translation_history table (matches DB columns) */
export interface TranslationHistoryRow {
  id: string;
  user_id?: string | null;
  input_text: string;
  detected_language?: string | null;
  target_language: string;
  result?: {
    /** Current SayOK shape (spec §3) */
    best?: string;
    safe?: string;
    engaging?: string;
    sns?: string;
    variations?: Array<{ type?: string; text?: string }>;
    /** Legacy */
    safe_option?: { text?: string; pronunciation?: string };
    alternatives?: Array<{ text?: string; pronunciation?: string; label?: string; usage?: string }>;
    summary?: string;
    summaryPronunciation?: string;
    rewrites?: { strong?: string; casual?: string; soft?: string };
  } | null;
  created_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  ui_lang: string;
  default_target_lang: string;
  created_at: string;
  updated_at: string;
}

// Helper functions for future Supabase features
export async function saveTranslation(data: Omit<TranslationHistory, 'id' | 'created_at'>) {
  if (!supabase) return null;

  const { data: result, error } = await supabase
    .from('translation_history')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('Error saving translation:', error);
    return null;
  }

  return result;
}

export async function getTranslationHistory(userId?: string, limit = 10) {
  if (!supabase) return [];

  let query = supabase
    .from('translation_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching history:', error);
    return [];
  }

  return data || [];
}
