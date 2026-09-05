import { create } from 'zustand';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { AuthSessionUser, UserRole } from '@medcore/types';

interface AuthState {
  user: AuthSessionUser | null;
  session: any | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (user: AuthSessionUser | null) => void;
  clearError: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  clearError: () => set({ error: null }),

  setUser: (user) => set({ user }),

  init: async () => {
    if (get().isInitialized) return;
    set({ isLoading: true, error: null });

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        set({ session });
        await fetchProfile(session.access_token, session.user, set);
      }

      // Listen for auth state changes (e.g. sign in, sign out, token refresh)
      supabase.auth.onAuthStateChange(async (_event: string, newSession: any) => {
        set({ session: newSession });
        if (newSession?.user) {
          await fetchProfile(newSession.access_token, newSession.user, set);
        } else {
          set({ user: null });
        }
      });
    } catch (err: any) {
      console.error('Auth initialization error:', err);
      set({ error: err.message || 'Failed to initialize authentication' });
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return false;
      }

      if (data.session) {
        set({ session: data.session });
        await fetchProfile(data.session.access_token, data.user, set);
      }

      set({ isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Authentication failed', isLoading: false });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      set({ user: null, session: null });
    } catch (err: any) {
      console.error('Sign out error:', err);
    } finally {
      set({ isLoading: false });
    }
  },
}));

async function fetchProfile(
  accessToken: string,
  sbUser: any,
  set: (state: Partial<AuthState>) => void,
) {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (res.ok) {
      const json = await res.json();
      if (json.data?.user) {
        set({ user: json.data.user });
        return;
      }
    }
  } catch {
    // Backend API may be initializing or local; gracefully fallback to metadata
  }

  // Fallback to Supabase User metadata
  const meta = sbUser.user_metadata || {};
  const fallbackUser: AuthSessionUser = {
    id: sbUser.id,
    email: sbUser.email || '',
    role: (meta.role as UserRole) || UserRole.PATIENT,
    hospitalId: meta.hospitalId || null,
    hospitalName: meta.hospitalName || 'Metro General Hospital',
    firstName: meta.firstName || 'User',
    lastName: meta.lastName || '',
  };
  set({ user: fallbackUser });
}
