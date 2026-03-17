// src/hooks/useProfile.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'editor' | 'user';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: UserRole;
  bio?: string;
  twitter_url?: string;
  linkedin_url?: string;
  github_url?: string;
  website_url?: string;
  is_active: boolean;
  email_verified: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export function useProfile(user: User | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Refs para prevenir memory leaks y race conditions
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isMountedRef = useRef(true);
  const currentUserIdRef = useRef<string | null>(null);

  const createProfile = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error: insertError } = await supabase
        // @ts-ignore - profiles table not in generated types
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
          avatar_url: user.user_metadata?.avatar_url || '',
          role: 'user',
          is_active: true,
          email_verified: !!(user.email_confirmed_at || user.confirmed_at)
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (isMountedRef.current) {
        setProfile(data as unknown as UserProfile);
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('Error creating profile:', err);
        setError(err as Error);
      }
    }
  }, [user]);

  const fetchProfile = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        // @ts-ignore - profiles table not in generated types
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!isMountedRef.current) return;

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          await createProfile();
          return;
        }
        throw fetchError;
      }

      setProfile(data as unknown as UserProfile);

      // Actualizar last_login_at (no bloqueante)
      (supabase as any)
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {/* silently update */});

    } catch (err) {
      if (isMountedRef.current) {
        console.error('Error fetching profile:', err);
        setError(err as Error);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [user?.id, createProfile]);

  // Efecto principal con cleanup mejorado
  useEffect(() => {
    isMountedRef.current = true;

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    // Evitar re-suscripción si el usuario no cambió
    if (currentUserIdRef.current === user.id && channelRef.current) {
      return;
    }

    // Cleanup del canal anterior si existe
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current).catch(console.error);
      channelRef.current = null;
    }

    currentUserIdRef.current = user.id;
    fetchProfile();

    // Suscribirse a cambios en el perfil con manejo de errores
    const channel = supabase
      .channel(`profile:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          if (isMountedRef.current && payload.new) {
            console.log('Profile updated via realtime:', payload);
            setProfile(payload.new as UserProfile);
          }
        }
      )
      .subscribe((_status, err) => {
        if (err) {
          console.error('Realtime subscription error:', err);
        }
      });

    channelRef.current = channel;

    // Cleanup function mejorada
    return () => {
      isMountedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(console.error);
        channelRef.current = null;
      }
      currentUserIdRef.current = null;
    };
  }, [user?.id, fetchProfile]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!user) return { error: new Error('No user logged in') };

    try {
      const { data, error: updateError } = await supabase
        // @ts-ignore - profiles table not in generated types
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      if (isMountedRef.current) {
        setProfile(data as unknown as UserProfile);
      }
      return { data, error: null };
    } catch (err) {
      console.error('Error updating profile:', err);
      return { data: null, error: err as Error };
    }
  }, [user]);

  return {
    profile,
    loading,
    error,
    updateProfile,
    refetch: fetchProfile
  };
}
