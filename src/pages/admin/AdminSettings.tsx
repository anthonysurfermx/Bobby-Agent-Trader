import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, Bell, Shield, LogOut, User, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function AdminSettings() {
  const { signOut, user } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (!confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await signOut();
      // El signOut del hook ya maneja:
      // - Limpieza de estado (user, session)
      // - Limpieza de localStorage
      // - Toast de éxito
      // - Redirección a home
    } catch (error) {
      // Si hay error, resetear el loading state
      console.error('Error al cerrar sesión:', error);
      setIsLoggingOut(false);
      // El toast de error ya se muestra en el hook
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Administra la configuración del sistema</p>
      </div>

      {/* User Session Card */}
      <Card className="mb-6 border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Sesión de Usuario
          </CardTitle>
          <CardDescription>
            Información de tu cuenta administrativa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {user?.email?.charAt(0).toUpperCase() || 'A'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{user?.email || 'Administrador'}</p>
                <p className="text-sm text-muted-foreground">Sesión activa</p>
              </div>
            </div>
            
            <Button 
              variant="destructive"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="gap-2"
            >
              {isLoggingOut ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Cerrando sesión...
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  Cerrar Sesión
                </>
              )}
            </Button>
          </div>
          
          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Al cerrar sesión serás redirigido a la página principal del sitio.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="security">Seguridad</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuración General
              </CardTitle>
              <CardDescription>
                Configuración básica del sitio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="siteName">Nombre del sitio</Label>
                <Input id="siteName" defaultValue="DeFi México Hub" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="siteUrl">URL del sitio</Label>
                <Input id="siteUrl" defaultValue="https://defimexico.com" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="maintenance">Modo mantenimiento</Label>
                <Switch id="maintenance" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notificaciones
              </CardTitle>
              <CardDescription>
                Configuración de emails y notificaciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="emailNotifications">Notificaciones por email</Label>
                <Switch id="emailNotifications" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="newsletterActive">Newsletter activo</Label>
                <Switch id="newsletterActive" defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Seguridad
              </CardTitle>
              <CardDescription>
                Configuración de seguridad y acceso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="twoFactor">2FA obligatorio para admins</Label>
                <Switch id="twoFactor" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="publicRegistration">Registro público</Label>
                <Switch id="publicRegistration" defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex justify-end">
        <Button>Guardar cambios</Button>
      </div>
    </div>
  );
}
