/**
 * Supabase Client Initialization & Helper Services
 * AI-Driven Packaging Line Defect Sorter & Product Inspection Platform
 */

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

// Read public environment variables safely (never expose service-role keys!)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('placeholder') &&
    !supabaseAnonKey.includes('placeholder')
  );
};

// Fallback dummy URL to prevent createClient crash if env vars are unset during development
const resolvedUrl = isSupabaseConfigured() ? supabaseUrl : 'https://placeholder.supabase.co';
const resolvedAnonKey = isSupabaseConfigured() ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

export const supabase: SupabaseClient = createClient(resolvedUrl, resolvedAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface InspectionRecord {
  id: string;
  timestamp: string;
  prediction: 'Defective' | 'Non-defective';
  defect_type: string;
  confidence: number;
  notes?: string;
  image_url?: string;
  is_placeholder?: boolean;
  user_id?: string | null;
  user_email?: string | null;
}

export interface UserProfile {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Sign in existing user with email and password
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ user: User | null; session: Session | null; error: Error | null }> {
  if (!isSupabaseConfigured()) {
    return {
      user: { id: 'mock-user-1', email } as User,
      session: null,
      error: null,
    };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { user: data?.user || null, session: data?.session || null, error };
}

/**
 * Sign up a new user with email and password
 */
export async function signUp(
  email: string,
  password: string
): Promise<{ user: User | null; session: Session | null; error: Error | null }> {
  if (!isSupabaseConfigured()) {
    return {
      user: { id: 'mock-user-1', email } as User,
      session: null,
      error: null,
    };
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { user: data?.user || null, session: data?.session || null, error };
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured()) {
    return { error: null };
  }
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Upload an inspection image to the private 'inspection-images' bucket
 * inside the user's isolated folder (<user_id>/<filename>)
 */
export async function uploadInspectionImage(userId: string, fileBlob: Blob, filename?: string) {
  if (!isSupabaseConfigured()) return { storagePath: '', data: null };

  const ext = fileBlob.type === 'image/png' ? 'png' : 'jpg';
  const name = filename || `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${userId}/${name}`;

  const { data, error } = await supabase.storage
    .from('inspection-images')
    .upload(storagePath, fileBlob, {
      contentType: fileBlob.type || 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;
  return { storagePath, data };
}

/**
 * Generate a time-limited signed URL for private inspection images
 */
export async function getSignedImageUrl(storagePath: string, expiresInSeconds: number = 3600) {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase.storage
    .from('inspection-images')
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    console.error('Failed to create signed URL:', error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Insert a new inspection record adhering to RLS requirements
 */
export async function recordInspection({
  userId,
  imagePath,
  prediction,
  confidence,
  notes = '',
  isPlaceholder = false,
}: {
  userId: string;
  imagePath?: string;
  prediction: 'Defective' | 'Non-defective';
  confidence: number;
  notes?: string;
  isPlaceholder?: boolean;
}) {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('inspections')
    .insert({
      user_id: userId,
      image_path: imagePath,
      prediction: prediction,
      confidence: confidence,
      notes: notes,
      is_placeholder: isPlaceholder,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch analytical summary for current user
 */
export async function fetchInspectionSummary() {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('inspection_analytics_summary')
    .select('*')
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching analytics summary:', error);
  }
  return data || null;
}

/**
 * Save an inspection record to Supabase table 'inspections' if configured
 */
export async function saveInspectionRecord(record: InspectionRecord): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }
  try {
    const { error } = await supabase.from('inspections').insert([
      {
        item_id: record.id,
        timestamp: record.timestamp,
        prediction: record.prediction,
        defect_type: record.defect_type,
        confidence: record.confidence,
        notes: record.notes,
        image_url: record.image_url,
        user_id: record.user_id,
        user_email: record.user_email,
      },
    ]);
    if (error) {
      console.warn('[Supabase] Insert error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown Supabase error' };
  }
}
