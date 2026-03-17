import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Rocket, Mail, Lock, User, Loader2 } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';

// Schema de validación sin términos y condiciones
const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Al menos una letra mayúscula')
    .regex(/[a-z]/, 'Al menos una letra minúscula')
    .regex(/[0-9]/, 'Al menos un número')
    .regex(/[!@#$%^&*]/, 'Al menos un carácter especial (@$!%*?&#)'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

type RegisterFormValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function RegisterPage() {
  const { signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setIsLoading(true);
    
    try {
      
      const response = await signUp(values.email, values.password, {
        name: values.name,
        role: 'user',
      });
      
      
      if (response?.error) {
        console.error('❌ ERROR:', response.error);
        toast.error(`Error: ${response.error.message || response.error}`);
        return;
      }
      
      toast.success('¡Cuenta creada exitosamente! Revisa tu email para confirmar tu cuenta.');
      
      // Mostrar mensaje adicional sobre permisos de admin
      setTimeout(() => {
        toast.info(
          '📝 Nota: Para acceder al panel de administración, necesitarás solicitar permisos al administrador del sitio.',
          { duration: 8000 }
        );
      }, 2000);
      
      form.reset();
      
    } catch (err) {
      console.error('💥 ERROR CATCH:', err);
      toast.error('Error al crear la cuenta. Por favor intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsSocialLoading(true);
    try {
      const response = await authService.signInWithGoogle();
      if (response?.error) {
        toast.error('Error al conectar con Google');
      } else {
        toast.success('Conectando con Google...');
      }
    } catch (error) {
      toast.error('Error al conectar con Google');
    } finally {
      setIsSocialLoading(false);
    }
  };

  const handleGitHubSignUp = async () => {
    setIsSocialLoading(true);
    try {
      const response = await authService.signInWithGitHub();
      if (response?.error) {
        toast.error('Error al conectar con GitHub');
      } else {
        toast.success('Conectando con GitHub...');
      }
    } catch (error) {
      toast.error('Error al conectar con GitHub');
    } finally {
      setIsSocialLoading(false);
    }
  };

  const passwordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[!@#$%^&*]/.test(password)) strength++;
    return strength;
  };

  const strength = passwordStrength(form.watch('password'));

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="p-8 shadow-xl bg-card/95 backdrop-blur border-primary/10">
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
            >
              <Rocket className="w-8 h-8 text-primary" />
            </motion.div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Crear Cuenta
            </h1>
            <p className="text-muted-foreground mt-2">
              Únete a la comunidad DeFi México Hub
            </p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Campo de Nombre */}
            <div>
              <Label htmlFor="name">Nombre completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  {...form.register('name')}
                  id="name"
                  type="text"
                  placeholder="Juan Pérez"
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* Campo de Email */}
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  {...form.register('email')}
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              {form.formState.errors.email && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Campo de Contraseña */}
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  {...form.register('password')}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              
              {/* Indicador de fortaleza de contraseña */}
              {form.watch('password') && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i < strength
                            ? strength <= 2 ? 'bg-red-500'
                            : strength <= 3 ? 'bg-yellow-500'
                            : 'bg-green-500'
                            : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fortaleza: {strength <= 2 ? 'Muy débil' : strength <= 3 ? 'Débil' : strength === 4 ? 'Buena' : 'Fuerte'}
                  </p>
                </div>
              )}
              
              {/* Requisitos de contraseña */}
              <div className="mt-2 space-y-1 text-xs">
                <p className={form.watch('password')?.length >= 8 ? 'text-green-500' : 'text-muted-foreground'}>
                  ✓ Mínimo 8 caracteres
                </p>
                <p className={/[A-Z]/.test(form.watch('password') || '') ? 'text-green-500' : 'text-muted-foreground'}>
                  ✓ Al menos una letra mayúscula
                </p>
                <p className={/[a-z]/.test(form.watch('password') || '') ? 'text-green-500' : 'text-muted-foreground'}>
                  ✓ Al menos una letra minúscula
                </p>
                <p className={/[0-9]/.test(form.watch('password') || '') ? 'text-green-500' : 'text-muted-foreground'}>
                  ✓ Al menos un número
                </p>
                <p className={/[!@#$%^&*]/.test(form.watch('password') || '') ? 'text-green-500' : 'text-muted-foreground'}>
                  ✓ Al menos un carácter especial (@$!%*?&#)
                </p>
              </div>
              
              {form.formState.errors.password && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Campo de Confirmar Contraseña */}
            <div>
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  {...form.register('confirmPassword')}
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Botón de registro */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !form.formState.isValid}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                'Crear cuenta'
              )}
            </Button>
          </form>

          {/* Separador */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                O REGÍSTRATE CON
              </span>
            </div>
          </div>

          {/* Botones sociales */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isSocialLoading}
              onClick={handleGoogleSignUp}
            >
              {isSocialLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
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
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isSocialLoading}
              onClick={handleGitHubSignUp}
            >
              {isSocialLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FaGithub className="mr-2 h-4 w-4" />
              )}
              GitHub
            </Button>
          </div>

          {/* Link para iniciar sesión */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            ¿Ya tienes cuenta?{' '}
            <Link
              to="/login"
              className="font-medium text-primary hover:underline"
            >
              Iniciar sesión
            </Link>
          </p>
        </Card>
      </motion.div>
    </div>
  );
}