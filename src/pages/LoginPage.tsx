import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import { toast } from 'sonner';
import {
  Loader2, Mail, Lock, Eye, EyeOff, LogIn,
  ShieldCheck, Sparkles, ArrowRight, CheckCircle2, AlertTriangle, Wallet
} from 'lucide-react';
import { FaGithub } from 'react-icons/fa';
import { useAppKit } from '@reown/appkit/react';
import { useAccount, useSignMessage } from 'wagmi';

const loginSchema = z.object({
  email: z.string()
    .min(1, 'El email es requerido')
    .email('Ingresa un email válido')
    .toLowerCase()
    .transform(val => val.trim()),
  password: z.string()
    .min(1, 'La contraseña es requerida')
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
  rememberMe: z.boolean().default(false)
});

type LoginFormValues = z.infer<typeof loginSchema>;

// Configuración de rate limiting
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutos

export default function LoginPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Wallet connection
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isWalletLoading, setIsWalletLoading] = useState(false);

  // No usamos redirectTo aquí - dejamos que useAuth maneje la redirección basada en roles
  // const from = (location.state as any)?.from?.pathname || '/';
  // const redirectTo = searchParams.get('redirectTo') || searchParams.get('redirect') || from;

  const [showPassword, setShowPassword] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<'google' | 'github' | null>(null);

  // Rate limiting state
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState<number>(0);

  const registrationSuccess = searchParams.get('registered') === 'true';
  const verificationSuccess = searchParams.get('verified') === 'true';
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setFocus
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: searchParams.get('email') || '',
      rememberMe: false
    }
  });
  
  // Inicializar rate limiting desde localStorage
  useEffect(() => {
    const storedAttempts = localStorage.getItem('loginAttempts');
    const storedLockout = localStorage.getItem('lockoutUntil');

    if (storedAttempts) {
      setLoginAttempts(parseInt(storedAttempts, 10));
    }

    if (storedLockout) {
      const lockoutUntil = parseInt(storedLockout, 10);
      const now = Date.now();

      if (lockoutUntil > now) {
        setIsLocked(true);
        setLockoutTimer(Math.ceil((lockoutUntil - now) / 1000));

        const interval = setInterval(() => {
          const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);

          if (remaining <= 0) {
            setIsLocked(false);
            setLoginAttempts(0);
            setLockoutTimer(0);
            localStorage.removeItem('loginAttempts');
            localStorage.removeItem('lockoutUntil');
            clearInterval(interval);
          } else {
            setLockoutTimer(remaining);
          }
        }, 1000);

        return () => clearInterval(interval);
      } else {
        // Lockout expirado
        localStorage.removeItem('loginAttempts');
        localStorage.removeItem('lockoutUntil');
      }
    }
  }, []);

  // Foco inicial solo al cargar la página
  useEffect(() => {
    if (!isLocked) {
      setFocus('email');
    }
  }, [setFocus, isLocked]);

  // useAuth ya maneja la redirección automáticamente basada en roles
  // No necesitamos redirigir manualmente aquí
  // useEffect(() => {
  //   if (user) {
  //     navigate(redirectTo, { replace: true });
  //   }
  // }, [user, navigate, redirectTo]);
  
  const onSubmit = async (values: LoginFormValues) => {
    // Verificar si está bloqueado
    if (isLocked) {
      const minutes = Math.ceil(lockoutTimer / 60);
      toast.error(`Cuenta bloqueada. Intenta de nuevo en ${minutes} minuto${minutes > 1 ? 's' : ''}.`);
      return;
    }

    try {
      const response = await signIn(values.email, values.password);

      if (response.error) {
        // Incrementar intentos fallidos
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        localStorage.setItem('loginAttempts', newAttempts.toString());

        // Verificar si se debe bloquear
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          const lockoutUntil = Date.now() + LOCKOUT_DURATION;
          localStorage.setItem('lockoutUntil', lockoutUntil.toString());
          setIsLocked(true);
          setLockoutTimer(LOCKOUT_DURATION / 1000);

          toast.error(
            `Demasiados intentos fallidos. Cuenta bloqueada por ${LOCKOUT_DURATION / (60 * 1000)} minutos.`,
            { duration: 5000 }
          );
          return;
        }

        // Mensajes de error específicos
        setError('password', {
          message: 'Email o contraseña incorrectos'
        });

        if (response.error.includes('Email not confirmed')) {
          toast.error('Por favor confirma tu email antes de iniciar sesión.', {
            description: 'Revisa tu bandeja de entrada'
          });
          setTimeout(() => {
            navigate(`/check-email?email=${encodeURIComponent(values.email)}`);
          }, 1500);
        } else if (response.error.includes('Invalid login credentials')) {
          const attemptsLeft = MAX_LOGIN_ATTEMPTS - newAttempts;
          toast.error('Email o contraseña incorrectos', {
            description: attemptsLeft > 0
              ? `Te quedan ${attemptsLeft} intento${attemptsLeft > 1 ? 's' : ''}`
              : undefined
          });
        } else {
          toast.error(response.error);
        }

        return;
      }

      // Login exitoso - resetear intentos
      setLoginAttempts(0);
      localStorage.removeItem('loginAttempts');
      localStorage.removeItem('lockoutUntil');

      if (values.rememberMe) {
        localStorage.setItem('rememberEmail', values.email);
      } else {
        localStorage.removeItem('rememberEmail');
      }

      toast.success('¡Bienvenido de vuelta!', {
        description: `Conectado como ${values.email}`
      });

      // Verificar si hay una URL de retorno del juego Mercado LP
      const mercadoReturnUrl = localStorage.getItem('mercado_lp_return_url');
      if (mercadoReturnUrl) {
        // Redirigir al juego con el pending NFT claim activo
        navigate(mercadoReturnUrl, { replace: true });
        return;
      }

      // Si no hay URL de retorno, useAuth se encarga de redirigir según el rol
      // El usuario será redirigido automáticamente a /admin o /user

    } catch (error) {
      console.error('Login error:', error);
      toast.error('Ocurrió un error inesperado. Por favor intenta de nuevo.');
    }
  };

  const handleGoogleSignIn = async () => {
    if (isLocked) {
      const minutes = Math.ceil(lockoutTimer / 60);
      toast.error(`Cuenta bloqueada. Intenta de nuevo en ${minutes} minuto${minutes > 1 ? 's' : ''}.`);
      return;
    }

    setIsSocialLoading(true);
    setOauthProvider('google');

    try {
      const response = await authService.signInWithGoogle();
      if (response?.error) {
        toast.error('Error al conectar con Google', {
          description: 'Por favor intenta de nuevo'
        });
        setIsSocialLoading(false);
        setOauthProvider(null);
      } else {
        toast.success('Redirigiendo a Google...', {
          description: 'Serás redirigido en un momento'
        });
        // No quitar el loading aquí - se hará al redirigir
      }
    } catch (error) {
      console.error('Google sign in error:', error);
      toast.error('Error al conectar con Google');
      setIsSocialLoading(false);
      setOauthProvider(null);
    }
  };

  const handleGitHubSignIn = async () => {
    if (isLocked) {
      const minutes = Math.ceil(lockoutTimer / 60);
      toast.error(`Cuenta bloqueada. Intenta de nuevo en ${minutes} minuto${minutes > 1 ? 's' : ''}.`);
      return;
    }

    setIsSocialLoading(true);
    setOauthProvider('github');

    try {
      const response = await authService.signInWithGitHub();
      if (response?.error) {
        toast.error('Error al conectar con GitHub', {
          description: 'Por favor intenta de nuevo'
        });
        setIsSocialLoading(false);
        setOauthProvider(null);
      } else {
        toast.success('Redirigiendo a GitHub...', {
          description: 'Serás redirigido en un momento'
        });
        // No quitar el loading aquí - se hará al redirigir
      }
    } catch (error) {
      console.error('GitHub sign in error:', error);
      toast.error('Error al conectar con GitHub');
      setIsSocialLoading(false);
      setOauthProvider(null);
    }
  };

  const handleWalletSignIn = async () => {
    if (isLocked) {
      const minutes = Math.ceil(lockoutTimer / 60);
      toast.error(`Cuenta bloqueada. Intenta de nuevo en ${minutes} minuto${minutes > 1 ? 's' : ''}.`);
      return;
    }

    setIsWalletLoading(true);

    try {
      if (!isConnected) {
        // Open wallet connection modal
        await open();
        setIsWalletLoading(false);
        return;
      }

      if (!address) {
        toast.error('No se pudo obtener la dirección de la wallet');
        setIsWalletLoading(false);
        return;
      }

      // Create a message to sign
      const message = `Iniciar sesión en DeFi México Hub\n\nDirección: ${address}\nFecha: ${new Date().toISOString()}`;

      // Request signature
      const signature = await signMessageAsync({ message });

      // Authenticate with backend
      const response = await authService.signInWithWallet(address, signature, message);

      if (response.error) {
        toast.error('Error al autenticar con la wallet', {
          description: response.error
        });
        setIsWalletLoading(false);
        return;
      }

      // Success!
      toast.success('¡Autenticación exitosa!', {
        description: `Conectado con ${address.substring(0, 6)}...${address.substring(address.length - 4)}`
      });

      // Verificar si hay una URL de retorno del juego Mercado LP
      const mercadoReturnUrl = localStorage.getItem('mercado_lp_return_url');
      if (mercadoReturnUrl) {
        navigate(mercadoReturnUrl, { replace: true });
        setIsWalletLoading(false);
        return;
      }

      // useAuth will handle the redirect automatically based on user role
      setIsWalletLoading(false);
    } catch (error: any) {
      console.error('Wallet sign in error:', error);
      if (error.message?.includes('User rejected')) {
        toast.error('Firma cancelada');
      } else {
        toast.error('Error al conectar con la wallet');
      }
      setIsWalletLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="absolute inset-0 bg-grid-white/10 bg-grid-16 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
      
      <Card className="w-full max-w-md relative z-10 shadow-xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse" />
              <div className="relative p-3 bg-primary/10 rounded-full">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
            </div>
          </div>
          
          <CardTitle className="text-2xl font-bold text-center">
            Iniciar Sesión
          </CardTitle>
          
          <CardDescription className="text-center">
            Ingresa a tu cuenta DeFi México Hub
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-4">
            {isLocked && (
              <Alert className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertDescription className="text-red-800 dark:text-red-200">
                  <strong>Cuenta bloqueada temporalmente</strong>
                  <p className="text-sm mt-1">
                    Demasiados intentos fallidos. Podrás intentar de nuevo en{' '}
                    <span className="font-mono font-bold">
                      {Math.floor(lockoutTimer / 60)}:{String(lockoutTimer % 60).padStart(2, '0')}
                    </span>
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {registrationSuccess && (
              <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  ¡Registro exitoso! Revisa tu email para confirmar tu cuenta.
                </AlertDescription>
              </Alert>
            )}

            {verificationSuccess && (
              <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  ¡Email verificado! Ya puedes iniciar sesión.
                </AlertDescription>
              </Alert>
            )}

            {!isLocked && loginAttempts > 0 && loginAttempts < MAX_LOGIN_ATTEMPTS && (
              <Alert className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  {loginAttempts} intento{loginAttempts > 1 ? 's' : ''} fallido{loginAttempts > 1 ? 's' : ''}.
                  Te quedan {MAX_LOGIN_ATTEMPTS - loginAttempts} intento{MAX_LOGIN_ATTEMPTS - loginAttempts > 1 ? 's' : ''}.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
                  disabled={isSubmitting}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary hover:underline"
                  tabIndex={-1}
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className={`pl-10 pr-10 ${errors.password ? 'border-destructive' : ''}`}
                  disabled={isSubmitting}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 top-2.5 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                {...register('rememberMe')}
              />
              <Label
                htmlFor="remember"
                className="text-sm font-normal cursor-pointer"
              >
                Recordarme
              </Label>
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting || isSocialLoading || isLocked}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando sesión...
                </>
              ) : isLocked ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Cuenta bloqueada
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Iniciar Sesión
                </>
              )}
            </Button>
            
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  O continúa con
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting || isSocialLoading || isWalletLoading || isLocked}
                onClick={handleGoogleSignIn}
              >
                {isSocialLoading && oauthProvider === 'google' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting || isSocialLoading || isWalletLoading || isLocked}
                onClick={handleGitHubSignIn}
              >
                {isSocialLoading && oauthProvider === 'github' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FaGithub className="h-4 w-4" />
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting || isSocialLoading || isWalletLoading || isLocked}
                onClick={handleWalletSignIn}
                className="border-primary/50 hover:border-primary"
              >
                {isWalletLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            <div className="text-sm text-center space-y-2">
              <p className="text-muted-foreground">
                ¿No tienes cuenta?{' '}
                <Link
                  to="/register"
                  className="text-primary hover:underline font-medium inline-flex items-center"
                >
                  Crear cuenta
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}