import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';

export type Role = 'admin' | 'editor' | 'moderator' | 'user';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireVerified?: boolean;
  requireAllRoles?: Role[];
  requireAnyRole?: Role[];
  redirectTo?: string;
}

function sanitizeRedirect(input: unknown, fallback = '/'): string {
  const str = typeof input === 'string' ? input : '';
  try {
    const decoded = decodeURIComponent(str);
    return decoded.startsWith('/') && !decoded.startsWith('//') ? decoded : fallback;
  } catch {
    return fallback;
  }
}

export default function ProtectedRoute({
  children,
  requireAuth = true,
  requireVerified = true,
  requireAllRoles,
  requireAnyRole,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { user, loading, profileLoading, isEmailVerified, getRoles } = useAuth();
  const location = useLocation();

  const fromPath = useMemo(() => {
    const path = location.pathname + location.search;
    return sanitizeRedirect(path, '/');
  }, [location.pathname, location.search]);

  // Esperar tanto a que se cargue el auth como el perfil si se requieren roles
  const isLoadingAuth = loading || (user && profileLoading && (requireAllRoles?.length || requireAnyRole?.length));

  if (isLoadingAuth) {
    // Detectar si estamos procesando OAuth
    const isOAuthFlow = window.location.hash.includes('access_token');

    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5"
        aria-busy="true"
        aria-label="Verificando acceso"
      >
        <div className="text-center space-y-6 max-w-md px-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl animate-pulse" />
            <div className="relative">
              <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto" />
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">
              {isOAuthFlow ? 'Conectando a DeFi México Hub' : 'Verificando acceso'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isOAuthFlow ? 'Cargando tu ecosistema DeFi...' : 'Un momento por favor...'}
            </p>
          </div>

          {isOAuthFlow && (
            <div className="flex justify-center gap-2 mt-4">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (requireAuth && !user) {
    const safeRedirect = sanitizeRedirect(redirectTo, '/login');
    return (
      <Navigate
        to={`${safeRedirect}?redirectTo=${encodeURIComponent(fromPath)}`}
        replace
        state={{ from: fromPath }}
      />
    );
  }

  if (requireAuth && requireVerified && user && !isEmailVerified?.()) {
    return (
      <Navigate
        to={`/check-email?redirectTo=${encodeURIComponent(fromPath)}`}
        replace
        state={{ 
          email: user.email, 
          from: fromPath 
        }}
      />
    );
  }

  if (user && ((requireAllRoles?.length) || (requireAnyRole?.length))) {
    const userRoles = new Set(getRoles?.() || []);
    
    const hasAllRequiredRoles = !requireAllRoles?.length || 
      requireAllRoles.every(role => userRoles.has(role));
    
    const hasAnyRequiredRole = !requireAnyRole?.length || 
      requireAnyRole.some(role => userRoles.has(role));

    console.log('🔐 ProtectedRoute - Has required roles?', hasAllRequiredRoles && hasAnyRequiredRole);

    if (!hasAllRequiredRoles || !hasAnyRequiredRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <>{children}</>;
}

export function GuestRoute({
  children,
  redirectTo = '/',
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background"
        aria-busy="true"
        aria-label="Cargando"
      >
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Si el usuario ya está autenticado, NO redirigir manualmente
  // useAuth ya maneja la redirección automática basada en roles
  // Solo mostramos el children (que será la página de login pero no se verá porque useAuth redirige)
  if (user) {
    // No hacer nada - useAuth ya está manejando la redirección
    return null;
  }

  return <>{children}</>;
}

export function useRequireAuth(options?: {
  requireVerified?: boolean;
  requireAllRoles?: Role[];
  requireAnyRole?: Role[];
  redirectTo?: string;
}) {
  const { user, loading, profileLoading, isEmailVerified, getRoles } = useAuth();

  return useMemo(() => {
    const isLoadingAuth = loading || (user && profileLoading && (options?.requireAllRoles?.length || options?.requireAnyRole?.length));

    if (isLoadingAuth) {
      return {
        authorized: false,
        loading: true as const,
        reason: null
      };
    }

    if (!user) {
      return {
        authorized: false,
        loading: false as const,
        redirect: sanitizeRedirect(options?.redirectTo, '/login'),
        reason: 'unauthenticated' as const,
      };
    }

    if (options?.requireVerified && !isEmailVerified?.()) {
      return {
        authorized: false,
        loading: false as const,
        redirect: '/check-email',
        reason: 'unverified' as const,
      };
    }

    if (options?.requireAllRoles?.length || options?.requireAnyRole?.length) {
      const userRoles = new Set(getRoles?.() || []);
      
      const hasAllRequiredRoles = !options?.requireAllRoles?.length || 
        options.requireAllRoles.every(role => userRoles.has(role));
      
      const hasAnyRequiredRole = !options?.requireAnyRole?.length || 
        options.requireAnyRole.some(role => userRoles.has(role));

      if (!hasAllRequiredRoles || !hasAnyRequiredRole) {
        return {
          authorized: false,
          loading: false as const,
          redirect: '/unauthorized',
          reason: 'unauthorized' as const,
        };
      }
    }

    return { 
      authorized: true, 
      loading: false as const,
      reason: null
    };
  }, [
    user,
    loading,
    profileLoading,
    isEmailVerified,
    getRoles,
    options?.requireVerified,
    options?.requireAllRoles,
    options?.requireAnyRole,
    options?.redirectTo
  ]);
}