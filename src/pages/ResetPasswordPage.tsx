// src/pages/ResetPasswordPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Loader2, Lock, Eye, EyeOff, KeyRound, CheckCircle2, 
  AlertCircle, ShieldCheck, ArrowRight
} from 'lucide-react';

// Reglas de password robustas (mismo que RegisterPage)
const passwordSchema = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Za-z]/, 'Debe incluir al menos una letra')
  .regex(/\d/, 'Debe incluir al menos un número')
  .regex(/[@$!%*?&#]/, 'Debe incluir al menos un carácter especial');

// Schema del formulario
const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Las contraseñas no coinciden'
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// Función para calcular fortaleza (mejorada con score máximo 4)
function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  
  if (!password) return { score: 0, label: 'Muy débil', color: 'bg-gray-300' };
  
  // Criterios de puntuación
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[@$!%*?&#]/.test(password)) score++;
  
  // Normalizar score a escala 0-4 (5 niveles)
  const normalizedScore = Math.min(Math.floor((score / 6) * 5), 4);
  
  const strengthMap = [
    { label: 'Muy débil', color: 'bg-red-500' },
    { label: 'Débil', color: 'bg-orange-500' },
    { label: 'Media', color: 'bg-yellow-500' },
    { label: 'Fuerte', color: 'bg-green-500' },
    { label: 'Muy fuerte', color: 'bg-emerald-500' }
  ];
  
  return {
    score: normalizedScore,
    ...strengthMap[normalizedScore]
  };
}

export default function ResetPasswordPage() {
  const { updatePassword, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Obtener token de la URL
  const token = searchParams.get('token') || searchParams.get('code');
  const type = searchParams.get('type') || 'recovery';
  
  // Estados
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid },
    setError
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange'
  });
  
  const passwordValue = watch('password') || '';
  const passwordStrength = getPasswordStrength(passwordValue);
  
  // Verificar token al cargar
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsValidToken(false);
        toast.error('Token inválido o expirado');
        return;
      }
      
      try {
        // Verificar si el token es válido
        const { error } = await verifyOtp(token, type);
        
        if (error) {
          setIsValidToken(false);
          toast.error('El enlace de recuperación es inválido o ha expirado');
        } else {
          // Token válido - limpiar URL para seguridad
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('token');
          cleanUrl.searchParams.delete('code');
          window.history.replaceState({}, '', cleanUrl.toString());
          
          setIsValidToken(true);
        }
      } catch (error) {
        setIsValidToken(false);
        toast.error('Error al verificar el enlace');
      }
    };
    
    verifyToken();
  }, [token, type, verifyOtp]);
  
  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!token) {
      toast.error('Token no válido');
      return;
    }
    
    try {
      const response = await updatePassword(values.password, token);
      
      if (response?.error) {
        if (response.error.includes('expired')) {
          setError('password', { 
            message: 'El enlace ha expirado. Solicita uno nuevo.' 
          });
          toast.error('El enlace de recuperación ha expirado');
        } else if (response.error.includes('same password')) {
          setError('password', { 
            message: 'La nueva contraseña debe ser diferente a la anterior' 
          });
          toast.error('Usa una contraseña diferente a la anterior');
        } else {
          toast.error('Error al cambiar la contraseña');
        }
        return;
      }
      
      // Éxito
      setResetSuccess(true);
      toast.success('¡Contraseña actualizada exitosamente!');
      
      // Redirigir al login después de 3 segundos
      setTimeout(() => {
        navigate('/login', { 
          replace: true,
          state: { message: 'Contraseña actualizada. Por favor inicia sesión.' }
        });
      }, 3000);
      
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error('Ocurrió un error. Por favor intenta de nuevo.');
    }
  };
  
  // Pantalla de éxito
  if (resetSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 relative">
              <div className="absolute inset-0 bg-green-500/20 blur-xl animate-pulse" />
              <div className="relative p-3 bg-green-500/10 rounded-full">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
            </div>
            
            <CardTitle>¡Contraseña Actualizada!</CardTitle>
            
            <CardDescription className="mt-4">
              Tu contraseña ha sido cambiada exitosamente. 
              Serás redirigido al login en unos segundos...
            </CardDescription>
          </CardHeader>
          
          <CardFooter>
            <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Ir al login ahora
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // Pantalla de token inválido
  if (isValidToken === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-destructive/10 rounded-full">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            
            <CardTitle>Enlace Inválido o Expirado</CardTitle>
            
            <CardDescription className="mt-4">
              Este enlace de recuperación no es válido o ha expirado. 
              Por favor solicita uno nuevo.
            </CardDescription>
          </CardHeader>
          
          <CardFooter className="flex flex-col gap-3">
            <Button 
              className="w-full" 
              onClick={() => navigate('/forgot-password', { replace: true })}
            >
              Solicitar nuevo enlace
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => navigate('/login', { replace: true })}
            >
              Volver al login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // Cargando verificación
  if (isValidToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Verificando enlace...</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Formulario principal
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      {/* Decoración de fondo */}
      <div className="absolute inset-0 bg-grid-white/10 bg-grid-16 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
      
      <Card className="w-full max-w-md relative z-10 shadow-xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse" />
              <div className="relative p-3 bg-primary/10 rounded-full">
                <KeyRound className="w-8 h-8 text-primary" />
              </div>
            </div>
          </div>
          
          <CardTitle className="text-2xl font-bold text-center">
            Nueva Contraseña
          </CardTitle>
          
          <CardDescription className="text-center">
            Crea una contraseña segura para tu cuenta
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-4">
            {/* Campo de Nueva Contraseña */}
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  autoFocus
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : 'password-requirements'}
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
              
              {/* Indicador de fortaleza */}
              {passwordValue && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i <= passwordStrength.score 
                            ? passwordStrength.color 
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fortaleza: <span className="font-medium">{passwordStrength.label}</span>
                  </p>
                </div>
              )}
              
              {/* Requisitos */}
              <div id="password-requirements" role="status" aria-live="polite" className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className={`h-3 w-3 ${passwordValue.length >= 8 ? 'text-green-500' : 'text-gray-400'}`} />
                  Mínimo 8 caracteres
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className={`h-3 w-3 ${/[A-Za-z]/.test(passwordValue) ? 'text-green-500' : 'text-gray-400'}`} />
                  Al menos una letra
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className={`h-3 w-3 ${/\d/.test(passwordValue) ? 'text-green-500' : 'text-gray-400'}`} />
                  Al menos un número
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className={`h-3 w-3 ${/[@$!%*?&#]/.test(passwordValue) ? 'text-green-500' : 'text-gray-400'}`} />
                  Al menos un carácter especial
                </p>
              </div>
              
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>
            
            {/* Campo de Confirmar Contraseña */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
                  className={`pl-10 pr-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
                  disabled={isSubmitting}
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(prev => !prev)}
                  className="absolute right-3 top-2.5 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showConfirmPassword}
                  title={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p id="confirm-password-error" className="text-sm text-destructive" role="alert">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full" 
              size="lg"
              disabled={isSubmitting || !isValid}
              aria-disabled={isSubmitting || !isValid}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Actualizando contraseña...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Actualizar contraseña
                </>
              )}
            </Button>
            
            <p className="text-xs text-center text-muted-foreground">
              Después de cambiar tu contraseña, serás redirigido al login
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}