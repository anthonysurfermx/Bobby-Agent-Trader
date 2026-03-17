// src/pages/AuthCallback.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

type CallbackType = 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change' | null;
type CallbackError =
  | 'access_denied'
  | 'server_error'
  | 'invalid_token'
  | 'expired_token'
  | 'user_already_confirmed'
  | 'email_link_handled'
  | string
  | null;

/**
 * Parse hash parameters (algunos providers como Supabase usan hash)
 */
function parseHashParams(): URLSearchParams {
  const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '';
  return new URLSearchParams(hash);
}

/**
 * Sanitiza redirect URLs para prevenir open redirects
 */
function sanitizeRedirect(input: string | null | undefined, fallback = '/'): string {
  if (!input) return fallback;
  try {
    // Solo permitimos rutas internas que empiecen con "/"
    const url = decodeURIComponent(input);
    return url.startsWith('/') && !url.startsWith('//') ? url : fallback;
  } catch {
    return fallback;
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hashParams = useMemo(() => parseHashParams(), []);
  const { handleAuthCallback, refreshUser } = useAuth();

  // Evitar doble procesamiento en StrictMode
  const processedRef = useRef(false);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Procesando...');

  // Leer parámetros de search o hash (algunos providers usan hash)
  const type = (searchParams.get('type') || hashParams.get('type')) as CallbackType;
  const error = (searchParams.get('error') || hashParams.get('error')) as CallbackError;
  const errorDescription = searchParams.get('error_description') || hashParams.get('error_description');
  const code = searchParams.get('code') || hashParams.get('code');
  const token = searchParams.get('token') || hashParams.get('token');
  const redirectTo = sanitizeRedirect(
    searchParams.get('redirect_to') || hashParams.get('redirect_to'),
    '/'
  );

  /**
   * Limpia URL de todos los parámetros sensibles
   */
  const cleanUrl = () => {
    const url = new URL(window.location.href);
    
    // Lista completa de parámetros a limpiar
    const paramsToRemove = [
      'type', 'error', 'error_description', 'error_code',
      'code', 'token', 'redirect_to', 
      'access_token', 'expires_in', 'refresh_token',
      'token_type', 'provider_token', 'provider_refresh_token'
    ];
    
    paramsToRemove.forEach(param => {
      url.searchParams.delete(param);
    });
    
    // También limpiar hash
    window.history.replaceState({}, document.title, url.pathname + url.search);
  };

  useEffect(() => {
    // Prevenir doble ejecución en StrictMode
    if (processedRef.current) return;
    processedRef.current = true;

    const processCallback = async () => {
      try {
        // Manejo de errores del provider
        if (error) {
          setStatus('error');
          
          let errorMessage: string;
          let showToast = true;
          
          switch (error) {
            case 'access_denied':
              errorMessage = 'Acceso denegado. Por favor intenta de nuevo.';
              break;
            case 'server_error':
              errorMessage = 'Error del servidor. Por favor intenta más tarde.';
              break;
            case 'invalid_token':
              errorMessage = 'Token inválido o expirado.';
              break;
            case 'expired_token':
              errorMessage = 'El enlace ha expirado. Solicita uno nuevo.';
              break;
            case 'user_already_confirmed':
              errorMessage = 'Tu correo ya estaba verificado.';
              showToast = false; // No es un error real
              toast.info('Tu cuenta ya está verificada. Puedes iniciar sesión.');
              break;
            case 'email_link_handled':
              errorMessage = 'Este enlace ya fue procesado.';
              break;
            default:
              errorMessage = errorDescription || 'Ocurrió un error de autenticación.';
          }
          
          setMessage(errorMessage);
          if (showToast) {
            toast.error(errorMessage);
          }
          
          // Redirigir más rápido si no es un error crítico
          const delay = error === 'user_already_confirmed' ? 1500 : 2500;
          setTimeout(() => navigate('/login', { replace: true }), delay);
          return;
        }

        // Validar que tengamos código o token
        if (!code && !token) {
          setStatus('error');
          setMessage('Parámetros de autenticación faltantes.');
          toast.error('Enlace inválido');
          setTimeout(() => navigate('/login', { replace: true }), 2000);
          return;
        }

        // Mensaje según el tipo de callback
        const processingMessage =
          type === 'signup' ? 'Verificando tu cuenta...' :
          type === 'recovery' ? 'Verificando enlace de recuperación...' :
          type === 'invite' ? 'Procesando invitación...' :
          type === 'magiclink' ? 'Verificando enlace mágico...' :
          type === 'email_change' ? 'Confirmando cambio de email...' :
          'Procesando autenticación...';
        
        setMessage(processingMessage);

        // Procesar callback con el auth handler
        const { error: callbackError } = await handleAuthCallback();

        if (callbackError) {
          setStatus('error');
          
          // Mapear errores comunes
          let errorMsg: string;
          if (callbackError.message?.includes('invalid_grant') || callbackError.code === 'invalid_grant') {
            errorMsg = 'Enlace inválido o ya utilizado.';
          } else if (callbackError.message?.includes('expired') || callbackError.code === 'expired_token') {
            errorMsg = 'El enlace ha expirado. Solicita uno nuevo.';
          } else if (callbackError.message?.includes('User already registered')) {
            errorMsg = 'Este usuario ya está registrado.';
          } else {
            errorMsg = 'No se pudo completar la autenticación.';
          }
          
          setMessage(errorMsg);
          toast.error(errorMsg);
          console.error('Auth callback error:', callbackError);
          
          setTimeout(() => navigate('/login', { replace: true }), 2500);
          return;
        }

        // Refrescar datos del usuario
        await refreshUser();
        
        // Éxito - procesar según el tipo
        setStatus('success');

        switch (type) {
          case 'signup':
            setMessage('¡Cuenta verificada exitosamente!');
            toast.success('Email verificado. ¡Bienvenido!');
            setTimeout(() => navigate(redirectTo, { replace: true }), 1200);
            break;

          case 'recovery': {
            setMessage('Verificación exitosa. Ahora puedes cambiar tu contraseña.');
            // Pasar el token a la página de reset
            const recoveryToken = token || code || '';
            setTimeout(() => {
              navigate(`/reset-password?token=${encodeURIComponent(recoveryToken)}&type=recovery`, { 
                replace: true 
              });
            }, 800);
            break;
          }

          case 'invite':
            setMessage('¡Invitación aceptada!');
            toast.success('Bienvenido al equipo');
            setTimeout(() => navigate('/admin', { replace: true }), 1200);
            break;

          case 'magiclink':
            setMessage('¡Autenticación exitosa!');
            toast.success('Sesión iniciada');
            setTimeout(() => navigate(redirectTo, { replace: true }), 800);
            break;

          case 'email_change':
            setMessage('¡Email actualizado exitosamente!');
            toast.success('Tu email ha sido cambiado');
            setTimeout(() => navigate('/profile', { replace: true }), 1200);
            break;

          default: {
            setMessage('¡Autenticación exitosa!');
            toast.success('Bienvenido');
            
            // Verificar si el usuario tiene acceso al admin
            const currentUser = await refreshUser();
            
            if (currentUser) {
              const userEmail = currentUser.email?.toLowerCase().trim();
              // Check admin access by email
              
              // Lista de usuarios con roles administrativos
              const adminUsers: Record<string, string> = {
                'anthochavez.ra@gmail.com': 'admin',
                'guillermos22@gmail.com': 'editor', 
                'fabiancepeda102@gmail.com': 'editor',
              };
              
              // Verificar si tiene rol administrativo
              const adminRole = adminUsers[userEmail || ''];
              
              if (adminRole) {
                setTimeout(() => navigate('/admin', { replace: true }), 800);
                return;
              }
              
              // Regular verified users → Bobby Agent Trader (main experience)
              if (currentUser.email_confirmed_at || currentUser.confirmed_at) {
                console.log(`🎯 Redirecting verified user to Bobby Agent Trader`);
                setTimeout(() => navigate('/agentic-world/bobby', { replace: true }), 800);
                return;
              }
            }
            
            setTimeout(() => navigate(redirectTo, { replace: true }), 800);
          }
        }

      } catch (error: any) {
        console.error('Callback processing error:', error);
        setStatus('error');
        setMessage('Ocurrió un error inesperado.');
        toast.error('Error al procesar la autenticación');
        
        setTimeout(() => navigate('/login', { replace: true }), 2500);
      } finally {
        // Limpiar URL de parámetros sensibles
        cleanUrl();
      }
    };

    processCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Deps vacías gracias a processedRef guard

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center space-y-6">
            {/* Icono animado según estado */}
            <div className="relative">
              {status === 'loading' && (
                <>
                  <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse" />
                  <div className="relative p-4 bg-primary/10 rounded-full">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  </div>
                </>
              )}
              
              {status === 'success' && (
                <>
                  <div className="absolute inset-0 bg-green-500/20 blur-xl animate-pulse" />
                  <div className="relative p-4 bg-green-500/10 rounded-full">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                </>
              )}
              
              {status === 'error' && (
                <>
                  <div className="absolute inset-0 bg-destructive/20 blur-xl animate-pulse" />
                  <div className="relative p-4 bg-destructive/10 rounded-full">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                  </div>
                </>
              )}
            </div>
            
            {/* Mensajes de estado */}
            <div className="text-center space-y-2" role="status" aria-live="polite">
              <p className="text-lg font-medium">
                {message}
              </p>
              
              {status === 'loading' && (
                <p className="text-sm text-muted-foreground">
                  Por favor espera mientras procesamos tu solicitud...
                </p>
              )}
              
              {status === 'success' && (
                <p className="text-sm text-muted-foreground">
                  Serás redirigido automáticamente.
                </p>
              )}
              
              {status === 'error' && (
                <p className="text-sm text-muted-foreground">
                  Serás redirigido al login.
                </p>
              )}
            </div>
            
            {/* Alert especial para recovery */}
            {type === 'recovery' && status === 'success' && (
              <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  A continuación podrás crear una nueva contraseña segura.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}