// src/pages/UnauthorizedPage.tsx
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PixelShield, PixelHome, PixelArrowLeft, PixelLock } from '@/components/ui/pixel-icons';
import { useAuth } from '@/hooks/useAuth';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 p-4">
      {/* Decoración de fondo */}
      <div className="absolute inset-0 bg-grid-white/10 bg-grid-16 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
      
      <Card className="w-full max-w-md relative z-10 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 relative">
            <div className="absolute inset-0 bg-destructive/20 blur-xl animate-pulse" />
            <div className="relative p-4 bg-destructive/10 rounded-full">
              <PixelShield size={48} className="text-destructive" />
            </div>
          </div>
          
          <CardTitle className="text-3xl font-bold">
            403
          </CardTitle>
          
          <CardDescription className="text-lg mt-2">
            Acceso No Autorizado
          </CardDescription>
        </CardHeader>
        
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            No tienes los permisos necesarios para acceder al panel de administración.
          </p>
          
          {user && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm text-muted-foreground">
                Sesión iniciada como:
              </p>
              <p className="font-medium">{user.email}</p>
              <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                <p className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold">
                  ⚠️ Tu cuenta no tiene permisos de administrador
                </p>
              </div>
            </div>
          )}
          
          <div className="pt-2 space-y-2">
            <p className="text-sm text-muted-foreground">
              Si necesitas acceso al panel de administración:
            </p>
            <ol className="text-xs text-muted-foreground text-left list-decimal list-inside space-y-1">
              <li>Contacta al administrador del sitio</li>
              <li>Solicita que te asignen el rol de editor o admin</li>
              <li>Espera la confirmación por email</li>
            </ol>
          </div>
        </CardContent>
        
        <CardFooter className="flex flex-col gap-3">
          <Button 
            onClick={() => navigate(-1)}
            variant="default"
            className="w-full"
          >
            <PixelArrowLeft size={16} className="mr-2" />
            Volver atrás
          </Button>
          
          <Button 
            onClick={() => navigate('/')}
            variant="outline"
            className="w-full"
          >
            <PixelHome size={16} className="mr-2" />
            Ir al inicio
          </Button>
          
          {user && (
            <Button 
              onClick={handleSignOut}
              variant="ghost"
              className="w-full"
            >
              <PixelLock size={16} className="mr-2" />
              Cambiar de cuenta
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}