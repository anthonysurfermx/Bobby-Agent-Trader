import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Shield } from "lucide-react";

export default function UserSettings() {
  const { user } = useAuth();
  const { role, isEditor } = useUserRole();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Gestiona tu cuenta y preferencias
        </p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>Información de Perfil</CardTitle>
          <CardDescription>
            Tu información personal y rol en la plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={isEditor ? "default" : "secondary"}>
                  {role === 'editor' ? 'Editor' : 'Usuario'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {isEditor
                  ? "Tienes permisos para crear contenido del blog"
                  : "Puedes proponer contenido para validación"}
              </p>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="pl-10"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tu email no se puede cambiar
            </p>
          </div>

          {/* Role Info */}
          <div className="space-y-2">
            <Label>Rol Actual</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-medium">
                {role === 'admin' ? 'Administrador' : role === 'editor' ? 'Editor' : 'Usuario'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Permissions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Permisos</CardTitle>
          <CardDescription>
            Lo que puedes hacer en la plataforma
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <span className="text-green-600">✓</span>
                </div>
                <span className="text-sm">Proponer comunidades, eventos, startups y referentes</span>
              </div>
            </div>

            {isEditor && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <span className="text-green-600">✓</span>
                  </div>
                  <span className="text-sm">Crear y editar posts del blog</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <span className="text-green-600">✓</span>
                </div>
                <span className="text-sm">Ver estado de tus propuestas</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                  <span className="text-red-600">✗</span>
                </div>
                <span className="text-sm text-muted-foreground">Validar propuestas de otros usuarios</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                ¿Necesitas más permisos?
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Si necesitas permisos de editor o tienes alguna pregunta, contacta al equipo de DeFi México a través de nuestros canales oficiales.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
