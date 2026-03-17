// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  authService, 
  type AuthState, 
  type AuthUser, 
  type UserProfile,
  type SignUpParams,
  type SignInParams,
  type ResetPasswordParams,
  type UpdateProfileParams,
  type AuthSubscription
} from '../services/auth.service';
import { Session, Provider, AuthError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import i18n from '@/i18n/config';

// Interfaces del contexto
interface AuthContextType extends AuthState {
  // Datos del usuario
  profile: UserProfile | null;
  
  // Estado de carga específica
  profileLoading: boolean;
  
  // Métodos de autenticación
  signUp: (params: SignUpParams) => Promise<void>;
  signIn: (params: SignInParams) => Promise<void>;
  signInWithOAuth: (provider: Provider, redirectTo?: string) => Promise<void>;
  signInWithMagicLink: (email: string, redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  
  // Gestión de perfil
  updateProfile: (updates: UpdateProfileParams) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateEmail: (newEmail: string) => Promise<void>;
  resetPassword: (params: ResetPasswordParams) => Promise<void>;
  refreshProfile: () => Promise<void>;
  
  // Utilidades
  isAdmin: () => boolean;
  isModerator: () => boolean;
  hasPermission: (permission: string) => boolean;
  canAccessRoute: (routeRole?: string) => boolean;
  getAvatarUrl: () => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Props del proveedor
interface AuthProviderProps {
  children: ReactNode;
  redirectTo?: string;
  onAuthChange?: (user: AuthUser | null) => void;
  enableAutoRedirect?: boolean;
}

/**
 * Proveedor del contexto de autenticación
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ 
  children, 
  redirectTo = '/', 
  onAuthChange,
  enableAutoRedirect = true 
}) => {
  // Estado del contexto
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    initialized: false,
  });
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  
  // Hooks
  const navigate = useNavigate();
  
  // Efectos
  useEffect(() => {
    let subscription: AuthSubscription | null = null;

    // Suscribirse a cambios de auth
    subscription = authService.onAuthStateChange((state) => {
      setAuthState(state);
      
      // Cargar perfil cuando hay usuario
      if (state.user && state.initialized) {
        loadUserProfile();
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
      
      // Callback opcional
      onAuthChange?.(state.user);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [onAuthChange]);

  // Cargar perfil del usuario
  const loadUserProfile = async () => {
    if (!authState.user) return;
    
    try {
      setProfileLoading(true);
      const userProfile = await authService.getUserProfile();
      setProfile(userProfile);
    } catch (error) {
      console.error('Error loading user profile:', error);
      toast.error(i18n.t('auth.profileError'));
    } finally {
      setProfileLoading(false);
    }
  };

  // Métodos de autenticación
  const signUp = async (params: SignUpParams): Promise<void> => {
    try {
      const response = await authService.signUp(params);
      
      if (response.error) {
        throw response.error;
      }

      if (response.data.user && !response.data.session) {
        toast.success(i18n.t('auth.signupSuccess'));
      } else {
        toast.success(i18n.t('auth.signupCreated'));
        if (enableAutoRedirect) {
          navigate(redirectTo);
        }
      }
    } catch (error) {
      const authError = error as AuthError;
      console.error('Error signing up:', authError);
      
      // Manejar errores específicos
      let errorMessage = i18n.t('auth.signupError');

      if (authError.message.includes('already registered')) {
        errorMessage = i18n.t('auth.signupEmailExists');
      } else if (authError.message.includes('Password')) {
        errorMessage = i18n.t('auth.signupPasswordWeak');
      } else if (authError.message.includes('email')) {
        errorMessage = i18n.t('auth.signupEmailInvalid');
      }
      
      toast.error(errorMessage);
      throw error;
    }
  };

  const signIn = async (params: SignInParams): Promise<void> => {
    try {
      const response = await authService.signIn(params);
      
      if (response.error) {
        throw response.error;
      }

      toast.success(i18n.t('auth.signinSuccess'));
      
      if (enableAutoRedirect) {
        navigate(redirectTo);
      }
    } catch (error) {
      const authError = error as AuthError;
      console.error('Error signing in:', authError);
      
      // Manejar errores específicos
      let errorMessage = i18n.t('auth.signinError');

      if (authError.message.includes('Invalid login credentials')) {
        errorMessage = i18n.t('auth.signinInvalid');
      } else if (authError.message.includes('Email not confirmed')) {
        errorMessage = i18n.t('auth.signinNotConfirmed');
      } else if (authError.message.includes('Too many requests')) {
        errorMessage = i18n.t('auth.signinTooMany');
      }
      
      toast.error(errorMessage);
      throw error;
    }
  };

  const signInWithOAuth = async (provider: Provider, redirectTo?: string): Promise<void> => {
    try {
      const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const response = await authService.signInWithOAuth(provider, {
        redirectTo: redirectTo || siteUrl,
      });
      
      if (response.error) {
        throw response.error;
      }

      // El redirect se maneja automáticamente por Supabase
    } catch (error) {
      const authError = error as AuthError;
      console.error(`Error signing in with ${provider}:`, authError);
      
      let errorMessage = i18n.t('auth.oauthError', { provider });

      if (authError.message.includes('Unauthorized')) {
        errorMessage = i18n.t('auth.oauthUnauthorized', { provider });
      }
      
      toast.error(errorMessage);
      throw error;
    }
  };

  const signInWithMagicLink = async (email: string, redirectTo?: string): Promise<void> => {
    try {
      const response = await authService.signInWithMagicLink({
        email,
        redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
      });
      
      if (response.error) {
        throw response.error;
      }

      toast.success(i18n.t('auth.magicLinkSent'));
    } catch (error) {
      const authError = error as AuthError;
      console.error('Error sending magic link:', authError);
      
      let errorMessage = i18n.t('auth.magicLinkError');

      if (authError.message.includes('rate limit')) {
        errorMessage = i18n.t('auth.magicLinkRateLimit');
      } else if (authError.message.includes('invalid email')) {
        errorMessage = i18n.t('auth.magicLinkEmailInvalid');
      }
      
      toast.error(errorMessage);
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      const { error } = await authService.signOut();
      
      if (error) {
        throw error;
      }

      toast.success(i18n.t('auth.signoutSuccess'));
      
      // Limpiar estado local
      setProfile(null);
      
      if (enableAutoRedirect) {
        navigate('/');
      }
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error(i18n.t('auth.signoutError'));
      throw error;
    }
  };

  // Métodos de gestión de perfil
  const updateProfile = async (updates: UpdateProfileParams): Promise<void> => {
    try {
      const { error } = await authService.updateProfile(updates);
      
      if (error) {
        throw error;
      }

      // Recargar perfil
      await refreshProfile();
      toast.success(i18n.t('auth.profileUpdated'));
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(i18n.t('auth.profileUpdateError'));
      throw error;
    }
  };

  const updatePassword = async (newPassword: string): Promise<void> => {
    try {
      const { error } = await authService.updatePassword(newPassword);
      
      if (error) {
        throw error;
      }

      toast.success(i18n.t('auth.passwordUpdated'));
    } catch (error) {
      const authError = error as AuthError;
      console.error('Error updating password:', authError);
      
      let errorMessage = i18n.t('auth.passwordUpdateError');

      if (authError.message.includes('Password should be')) {
        errorMessage = i18n.t('auth.passwordWeak');
      }
      
      toast.error(errorMessage);
      throw error;
    }
  };

  const updateEmail = async (newEmail: string): Promise<void> => {
    try {
      const { error } = await authService.updateEmail(newEmail);
      
      if (error) {
        throw error;
      }

      toast.success(i18n.t('auth.emailUpdated'));
    } catch (error) {
      const authError = error as AuthError;
      console.error('Error updating email:', authError);
      
      let errorMessage = i18n.t('auth.emailUpdateError');

      if (authError.message.includes('already registered')) {
        errorMessage = i18n.t('auth.emailExists');
      } else if (authError.message.includes('invalid email')) {
        errorMessage = i18n.t('auth.emailInvalid');
      }
      
      toast.error(errorMessage);
      throw error;
    }
  };

  const resetPassword = async (params: ResetPasswordParams): Promise<void> => {
    try {
      const { error } = await authService.resetPassword(params);
      
      if (error) {
        throw error;
      }

      toast.success(i18n.t('auth.resetSent'));
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error(i18n.t('auth.resetError'));
      throw error;
    }
  };

  const refreshProfile = async (): Promise<void> => {
    if (!authState.user) return;
    
    try {
      setProfileLoading(true);
      const userProfile = await authService.getUserProfile();
      setProfile(userProfile);
    } catch (error) {
      console.error('Error refreshing profile:', error);
      toast.error(i18n.t('auth.refreshError'));
    } finally {
      setProfileLoading(false);
    }
  };

  // Métodos de utilidades
  const isAdmin = (): boolean => {
    return authService.isAdmin();
  };

  const isModerator = (): boolean => {
    return authService.isModerator();
  };

  const hasPermission = (permission: string): boolean => {
    return authService.hasPermission(permission);
  };

  const canAccessRoute = (routeRole?: string): boolean => {
    return authService.canAccessRoute(routeRole);
  };

  const getAvatarUrl = (): string => {
    if (profile?.avatar_url) {
      return profile.avatar_url;
    }
    return authService.getDefaultAvatarUrl(authState.user);
  };

  // Valor del contexto
  const contextValue: AuthContextType = {
    // Estado de auth
    ...authState,
    profile,
    profileLoading,
    
    // Métodos de autenticación
    signUp,
    signIn,
    signInWithOAuth,
    signInWithMagicLink,
    signOut,
    
    // Gestión de perfil
    updateProfile,
    updatePassword,
    updateEmail,
    resetPassword,
    refreshProfile,
    
    // Utilidades
    isAdmin,
    isModerator,
    hasPermission,
    canAccessRoute,
    getAvatarUrl,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook para usar el contexto de autenticación
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

/**
 * Hook para requerir autenticación
 * Redirige automáticamente al login si no está autenticado
 */
export const useRequireAuth = (redirectTo = '/auth/login'): AuthContextType => {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.initialized && !auth.user) {
      navigate(redirectTo);
    }
  }, [auth.initialized, auth.user, navigate, redirectTo]);

  return auth;
};

/**
 * Hook para requerir rol específico
 */
export const useRequireRole = (
  role: 'admin' | 'moderator' | 'authenticated',
  redirectTo = '/'
): AuthContextType => {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.initialized) {
      if (!auth.user) {
        navigate('/login');
        return;
      }

      const hasAccess = auth.canAccessRoute(role);
      if (!hasAccess) {
        navigate(redirectTo);
        toast.error(i18n.t('auth.noPermission'));
      }
    }
  }, [auth.initialized, auth.user, role, navigate, redirectTo, auth]);

  return auth;
};

/**
 * Hook para obtener el estado de carga general
 */
export const useAuthLoading = (): boolean => {
  const { loading, initialized, profileLoading } = useAuth();
  return loading || !initialized || profileLoading;
};

/**
 * Hook para verificar si está autenticado de forma reactiva
 */
export const useIsAuthenticated = (): boolean => {
  const { user, initialized } = useAuth();
  return initialized && !!user;
};

/**
 * Hook para obtener información del usuario actual
 */
export const useCurrentUser = (): {
  user: AuthUser | null;
  profile: UserProfile | null;
  isLoading: boolean;
} => {
  const { user, profile, loading, initialized, profileLoading } = useAuth();
  
  return {
    user,
    profile,
    isLoading: loading || !initialized || profileLoading,
  };
};

/**
 * Hook para manejar redirects después de auth
 */
export const useAuthRedirect = () => {
  const navigate = useNavigate();
  
  const redirectAfterAuth = (path = '/') => {
    const searchParams = new URLSearchParams(window.location.search);
    const redirectTo = searchParams.get('redirectTo') || path;
    navigate(redirectTo);
  };

  return { redirectAfterAuth };
};

// Exportaciones adicionales
export default AuthContext;
export type { AuthContextType, AuthUser, UserProfile };