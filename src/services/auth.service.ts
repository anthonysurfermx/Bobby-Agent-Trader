import { supabase, handleSupabaseError } from '../lib/supabase';
import type { ServiceResponse } from '../types';
import { platformService } from './platform.service';
import type { User } from '@supabase/supabase-js';

// Auth types
export interface AuthState {
  user: User | null;
  session: any | null;
  loading: boolean;
  initialized: boolean;
}

export interface AuthUser extends User {
  role?: string;
  permissions?: string[];
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role?: string;
  created_at: string;
  updated_at: string;
}

export interface SignUpParams {
  email: string;
  password: string;
  metadata?: any;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface ResetPasswordParams {
  email: string;
}

export interface UpdateProfileParams {
  full_name?: string;
  avatar_url?: string;
}

export interface AuthSubscription {
  unsubscribe: () => void;
}

export const authService = {
  // Registrar nuevo usuario
  async signUp(email: string, password: string, metadata?: any): Promise<ServiceResponse<any>> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });
      
      if (error) throw error;
      
      // Log registro
      await platformService.logEvent(
        'user_signup',
        { user_id: data.user?.id, email },
        'info'
      );
      
      return { data, error: null };
    } catch (error) {
      return { data: null, error: handleSupabaseError(error) };
    }
  },

  // Iniciar sesión
  async signIn(email: string, password: string): Promise<ServiceResponse<any>> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      // Log inicio de sesión
      await platformService.logEvent(
        'user_signin',
        { user_id: data.user?.id, email },
        'info'
      );
      
      return { data, error: null };
    } catch (error) {
      return { data: null, error: handleSupabaseError(error) };
    }
  },

  // Cerrar sesión
  async signOut(): Promise<ServiceResponse<boolean>> {
    try {
      // Try to sign out with scope: 'local' to avoid server errors
      const { error } = await supabase.auth.signOut({ scope: 'local' });

      // Even if there's an error (session already invalid), consider it successful
      // since we're just clearing local state anyway
      if (error && !error.message?.includes('session')) {
        console.warn('SignOut warning (non-critical):', error);
      }

      return { data: true, error: null };
    } catch (error) {
      // Treat all errors as non-critical for signOut
      console.warn('SignOut error (non-critical):', error);
      return { data: true, error: null };
    }
  },

  // Obtener usuario actual
  async getCurrentUser(): Promise<ServiceResponse<any>> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) throw error;
      return { data: user, error: null };
    } catch (error) {
      return { data: null, error: handleSupabaseError(error) };
    }
  },

  // Obtener sesión actual
  async getSession(): Promise<ServiceResponse<any>> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      return { data: session, error: null };
    } catch (error) {
      return { data: null, error: handleSupabaseError(error) };
    }
  },

  // Resetear contraseña
  async resetPassword(email: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      
      if (error) throw error;
      
      // Log solicitud de reset
      await platformService.logEvent(
        'password_reset_requested',
        { email },
        'info'
      );
      
      return { data: true, error: null };
    } catch (error) {
      return { data: false, error: handleSupabaseError(error) };
    }
  },

  // Actualizar contraseña
  async updatePassword(newPassword: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) throw error;
      return { data: true, error: null };
    } catch (error) {
      return { data: false, error: handleSupabaseError(error) };
    }
  },

  // Auth state management
  onAuthStateChange: (callback: (event: string, session: any) => void): AuthSubscription => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
    return {
      unsubscribe: () => subscription.unsubscribe()
    };
  },

  // User profile management
  async getUserProfile(userId: string): Promise<ServiceResponse<UserProfile>> {
    try {
      // Mock implementation
      const profile: UserProfile = {
        id: userId,
        email: 'user@example.com',
        full_name: 'User Name',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      return { data: profile, error: null };
    } catch (error) {
      return { data: null, error: handleSupabaseError(error) };
    }
  },

  async updateProfile(userId: string, updates: UpdateProfileParams): Promise<ServiceResponse<UserProfile>> {
    try {
      // Mock implementation
      const profile: UserProfile = {
        id: userId,
        email: 'user@example.com',
        ...updates,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      return { data: profile, error: null };
    } catch (error) {
      return { data: null, error: handleSupabaseError(error) };
    }
  },

  async updateEmail(newEmail: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      return { data: true, error: null };
    } catch (error) {
      return { data: false, error: handleSupabaseError(error) };
    }
  },

  // OAuth methods
  async signInWithOAuth(provider: any, options?: { redirectTo?: string }): Promise<ServiceResponse<any>> {
    try {
      const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: options?.redirectTo || siteUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      });
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error: handleSupabaseError(error) };
    }
  },

  async signInWithMagicLink(email: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });
      
      if (error) throw error;
      return { data: true, error: null };
    } catch (error) {
      return { data: false, error: handleSupabaseError(error) };
    }
  },

  // Iniciar sesión con Google
  async signInWithGoogle(): Promise<ServiceResponse<any>> {
    return this.signInWithOAuth('google');
  },

  // Iniciar sesión con GitHub
  async signInWithGitHub(): Promise<ServiceResponse<any>> {
    return this.signInWithOAuth('github');
  },

  // Iniciar sesión con Wallet (Web3)
  async signInWithWallet(address: string, signature: string, message: string): Promise<ServiceResponse<any>> {
    try {
      // Normalizar dirección
      const normalizedAddress = address.toLowerCase();

      // Email temporal basado en la wallet
      const tempEmail = `${normalizedAddress}@wallet.defimexico.org`;

      // Password fijo basado en la dirección (siempre el mismo para la misma wallet)
      // Esto permite login repetido con la misma wallet
      const walletPassword = `wallet_${normalizedAddress.substring(2, 32)}_auth`;

      // Primero intentar login (más común)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: tempEmail,
        password: walletPassword
      });

      if (!signInError && signInData.user) {
        // Login exitoso!
        console.log('✅ Wallet login successful');

        // Log inicio de sesión
        await platformService.logEvent(
          'wallet_signin',
          { user_id: signInData.user.id, wallet_address: normalizedAddress },
          'info'
        );

        return { data: signInData, error: null };
      }

      // Si el login falló, puede ser un usuario nuevo
      // Verificar si el usuario ya existe en auth pero no tiene wallet registrada
      if (signInError?.message?.includes('Invalid login credentials')) {
        // Usuario nuevo - crear cuenta
        console.log('📝 Creating new wallet user...');

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: tempEmail,
          password: walletPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              wallet_address: normalizedAddress,
              auth_method: 'wallet',
              full_name: `Wallet ${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-4)}`
            }
          }
        });

        // Si signUp falla porque el usuario ya existe, intentar login de nuevo
        if (authError && (
          authError.message?.includes('User already registered') ||
          authError.message?.includes('already been registered') ||
          authError.status === 422
        )) {
          console.log('🔄 User already exists, attempting login...');

          const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
            email: tempEmail,
            password: walletPassword
          });

          if (retryError) {
            console.error('Retry login error:', retryError);
            return {
              data: null,
              error: 'La wallet ya está registrada pero hay un problema con las credenciales. Por favor contacta soporte.'
            };
          }

          // Login exitoso después de retry
          console.log('✅ Login successful after retry');
          return { data: retryData, error: null };
        }

        if (authError) {
          console.error('SignUp error:', authError);
          throw authError;
        }
        if (!authData.user) throw new Error('No se pudo crear el usuario');

        const userId = authData.user.id;

        // Crear entrada en tabla wallets
        const { error: insertError } = await supabase
          .from('wallets')
          .insert({
            user_id: userId,
            address: normalizedAddress,
            verified: true,
            created_at: new Date().toISOString()
          });

        if (insertError) {
          console.error('Error inserting wallet:', insertError);
          // Continuar aunque falle la inserción en wallets
        }

        // Log registro
        await platformService.logEvent(
          'wallet_signup',
          { user_id: userId, wallet_address: normalizedAddress },
          'info'
        );

        return { data: authData, error: null };
      }

      // Otro tipo de error
      return {
        data: null,
        error: signInError?.message || 'Error al autenticar con la wallet'
      };

    } catch (error) {
      console.error('Wallet auth error:', error);
      return { data: null, error: handleSupabaseError(error) };
    }
  },

  // Permission methods
  isAdmin: (user: AuthUser): boolean => {
    return user.role === 'admin';
  },

  isModerator: (user: AuthUser): boolean => {
    return user.role === 'moderator' || user.role === 'admin';
  },

  hasPermission: (user: AuthUser, permission: string): boolean => {
    return user.permissions?.includes(permission) || user.role === 'admin';
  },

  canAccessRoute: (user: AuthUser, route: string): boolean => {
    if (route.startsWith('/admin')) {
      return user.role === 'admin';
    }
    return true;
  },

  // Utility methods
  getDefaultAvatarUrl: (email: string): string => {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${email}`;
  }
};