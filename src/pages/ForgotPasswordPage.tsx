// src/pages/ForgotPasswordPage.tsx
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Loader2, Mail, ArrowLeft, KeyRound, CheckCircle2, 
  Info, AlertCircle, Send
} from 'lucide-react';

// Schema de validación con trim
const forgotPasswordSchema = z.object({
  email: z.string()
    .trim()
    .min(1, 'El email es requerido')
    .email('Ingresa un email válido')
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// Rate limiting
const RESET_COOLDOWN = 60; // 60 segundos entre solicitudes
const ANTI_TIMING_DELAY = 600; // 600ms delay para prevenir timing attacks

// Función para enmascarar email
const maskEmail = (email: string): string => {
  return email.replace(/(.{2}).+(@.+)/, '$1****$2');
};

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth();
  const navigate = useNavigate();
  
  // Estados
  const [emailSent, setEmailSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [lastResetEmail, setLastResetEmail] = useState('');
  
  // Honeypot anti-bots
  const [honeypot, setHoneypot] = useState('');
  
  // Ref para auto-focus
  const backButtonRef = useRef<HTMLButtonElement>(null);
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    setError,
    watch
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onChange',
    defaultValues: {
      email: ''
    }
  });
  
  const emailValue = watch('email');
  
  // Cargar cooldown desde localStorage al montar
  useEffect(() => {
    const storedUntil = Number(localStorage.getItem('resetCooldownUntil') || 0);
    if (storedUntil > Date.now()) {
      setCooldown(Math.ceil((storedUntil - Date.now()) / 1000));
    }
  }, []);
  
  // Timer de cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    
    const timer = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) {
          localStorage.removeItem('resetCooldownUntil');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [cooldown]);
  
  // Auto-focus en botón después de enviar
  useEffect(() => {
    if (emailSent && backButtonRef.current) {
      backButtonRef.current.focus();
    }
  }, [emailSent]);
  
  // Función para iniciar cooldown
  const startCooldown = () => {
    const until = Date.now() + RESET_COOLDOWN * 1000;
    localStorage.setItem('resetCooldownUntil', String(until));
    setCooldown(RESET_COOLDOWN);
  };
  
  const onSubmit = async (values: ForgotPasswordFormValues) => {
    // Verificar honeypot
    if (honeypot) {
      console.warn('Bot detected');
      return;
    }
    
    // Verificar cooldown
    if (cooldown > 0) {
      toast.info(`Por favor espera ${cooldown} segundos antes de solicitar otro enlace.`);
      return;
    }
    
    const email = values.email.trim();
    
    // Crear delay mínimo para prevenir timing attacks
    const delayPromise = new Promise(resolve => setTimeout(resolve, ANTI_TIMING_DELAY));
    
    try {
      const [response] = await Promise.all([
        resetPasswordForEmail(email),
        delayPromise
      ]);
      
      if (response?.error) {
        // Log error pero no lo muestres al usuario (seguridad)
        console.error('Reset password error:', response.error);
      }
      
      // Siempre mostrar éxito (por seguridad, no revelar si el email existe)
      setEmailSent(true);
      setLastResetEmail(email);
      startCooldown();
      
      // Notificación de éxito
      toast.success('Si el email existe en nuestro sistema, recibirás un enlace de recuperación.');
      
    } catch (error) {
      console.error('Reset password error:', error);
      
      // Esperar el delay mínimo incluso en error
      await delayPromise;
      
      // Incluso en error, mostrar mensaje genérico
      setEmailSent(true);
      setLastResetEmail(email);
      startCooldown();
      toast.info('Si el email existe en nuestro sistema, recibirás un enlace de recuperación.');
    }
  };
  
  const handleResend = async () => {
    if (!lastResetEmail || cooldown > 0) return;
    
    const delayPromise = new Promise(resolve => setTimeout(resolve, ANTI_TIMING_DELAY));
    
    try {
      const [response] = await Promise.all([
        resetPasswordForEmail(lastResetEmail),
        delayPromise
      ]);
      
      startCooldown();
      toast.success('Enlace de recuperación reenviado.');
    } catch (error) {
      await delayPromise;
      startCooldown();
      toast.error('Error al reenviar. Intenta más tarde.');
    }
  };
  
  // Si ya se envió el email, mostrar pantalla de confirmación
  if (emailSent) {
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
            
            <CardTitle>Revisa tu correo</CardTitle>
            
            <CardDescription className="space-y-2 mt-4">
              <span className="block">
                Hemos enviado instrucciones de recuperación a:
              </span>
              <span className="block font-mono font-medium text-foreground bg-muted px-3 py-1 rounded">
                {maskEmail(lastResetEmail)}
              </span>
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert role="status" aria-live="polite">
              <Info className="h-4 w-4" />
              <AlertDescription>
                El enlace de recuperación expira en 24 horas. 
                Si no ves el correo, revisa tu carpeta de spam.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-3">
              <Button
                onClick={handleResend}
                variant="outline"
                className="w-full"
                disabled={cooldown > 0 || isSubmitting}
                aria-disabled={cooldown > 0 || isSubmitting}
              >
                <Send className="mr-2 h-4 w-4" />
                {cooldown > 0 
                  ? `Reenviar en ${cooldown}s` 
                  : 'Reenviar correo'
                }
              </Button>
              
              <Button 
                ref={backButtonRef}
                variant="default" 
                className="w-full" 
                asChild
              >
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Volver al login
                </Link>
              </Button>
            </div>
          </CardContent>
          
          <CardFooter>
            <p className="text-xs text-muted-foreground text-center w-full">
              Si no recuerdas qué email usaste, contacta a soporte: support@defimexico.com
            </p>
          </CardFooter>
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
            Recuperar Contraseña
          </CardTitle>
          
          <CardDescription className="text-center">
            Te enviaremos un enlace para restablecer tu contraseña
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-4">
            {/* Info alert */}
            <Alert role="status" aria-live="polite">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Ingresa el email asociado a tu cuenta. Si existe, recibirás un enlace de recuperación.
              </AlertDescription>
            </Alert>
            
            {/* Honeypot oculto */}
            <div className="hidden" aria-hidden="true">
              <Label htmlFor="phone">Phone</Label>
              <Input 
                id="phone" 
                name="phone"
                value={honeypot} 
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            
            {/* Campo de Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  autoComplete="email"
                  autoFocus
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
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            {/* Botón de enviar */}
            <Button 
              type="submit" 
              className="w-full" 
              size="lg"
              disabled={isSubmitting || !isValid || cooldown > 0}
              aria-disabled={isSubmitting || !isValid || cooldown > 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : cooldown > 0 ? (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Espera {cooldown}s
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar enlace de recuperación
                </>
              )}
            </Button>
            
            {/* Links de navegación */}
            <div className="text-sm text-center space-y-2 w-full">
              <p className="text-muted-foreground">
                ¿Recordaste tu contraseña?{' '}
                <Link
                  to="/login"
                  className="text-primary hover:underline font-medium inline-flex items-center"
                >
                  Iniciar sesión
                  <ArrowLeft className="ml-1 h-3 w-3 rotate-180" />
                </Link>
              </p>
              
              <p className="text-muted-foreground">
                ¿No tienes cuenta?{' '}
                <Link
                  to="/register"
                  className="text-primary hover:underline font-medium"
                >
                  Crear cuenta
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}