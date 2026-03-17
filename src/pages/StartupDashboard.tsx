// src/pages/StartupDashboard.tsx
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Rocket, Plus, Building2, CheckCircle, Clock, XCircle, Eye } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';

// Mock data para startups del usuario (después vendrá del servicio)
const userStartups = [
  {
    id: '1',
    name: 'Mi Startup DeFi',
    status: 'pending',
    submitted_at: '2024-01-15',
    description: 'Una plataforma innovadora de DeFi...'
  },
  {
    id: '2', 
    name: 'Crypto Analytics',
    status: 'published',
    submitted_at: '2024-01-10',
    description: 'Herramientas de análisis para criptomonedas...'
  }
];

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'pending':
      return {
        icon: Clock,
        label: 'En Revisión',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        description: 'Tu startup está siendo revisada por nuestro equipo'
      };
    case 'published':
      return {
        icon: CheckCircle,
        label: 'Publicada',
        color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        description: 'Tu startup está visible en el directorio'
      };
    case 'rejected':
      return {
        icon: XCircle,
        label: 'Rechazada',
        color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        description: 'Tu startup necesita algunos ajustes'
      };
    default:
      return {
        icon: Clock,
        label: 'Desconocido',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
        description: ''
      };
  }
};

export default function StartupDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Rocket className="h-12 w-12 text-primary mx-auto mb-4" />
            <CardTitle>Acceso Requerido</CardTitle>
            <CardDescription>
              Necesitas iniciar sesión para acceder a tu dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate('/login?redirectTo=/user')}
              className="w-full"
            >
              Iniciar Sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Building2 className="h-8 w-8 text-primary" />
                Dashboard de Startups
              </h1>
              <p className="text-muted-foreground mt-2">
                Bienvenido, <span className="font-medium">{user.email}</span>. Gestiona tus startups aquí.
              </p>
            </div>
            
            <Button
              onClick={() => navigate('/admin/startups/new')}
              size="lg"
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              <Plus className="mr-2 h-5 w-5" />
              Registrar Nueva Startup
            </Button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Startups</p>
                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{userStartups.length}</p>
                  </div>
                  <Building2 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">Publicadas</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {userStartups.filter(s => s.status === 'published').length}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-950 dark:to-yellow-900 border-yellow-200 dark:border-yellow-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">En Revisión</p>
                    <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                      {userStartups.filter(s => s.status === 'pending').length}
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Startups List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                Mis Startups
              </CardTitle>
              <CardDescription>
                Administra todas tus startups registradas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userStartups.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No tienes startups registradas</h3>
                  <p className="text-muted-foreground mb-6">
                    Comienza registrando tu primera startup en el ecosistema DeFi de México
                  </p>
                  <Button
                    onClick={() => navigate('/admin/startups/new')}
                    className="bg-gradient-to-r from-primary to-primary/80"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Registrar Primera Startup
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {userStartups.map((startup, index) => {
                    const statusInfo = getStatusInfo(startup.status);
                    const StatusIcon = statusInfo.icon;

                    return (
                      <motion.div
                        key={startup.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="border border-border rounded-lg p-6 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold">{startup.name}</h3>
                              <Badge className={statusInfo.color}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusInfo.label}
                              </Badge>
                            </div>
                            
                            <p className="text-muted-foreground mb-2">
                              {startup.description}
                            </p>
                            
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>Enviado el {new Date(startup.submitted_at).toLocaleDateString('es-MX')}</span>
                              <span>•</span>
                              <span>{statusInfo.description}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            {startup.status === 'published' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/startups/${startup.id}`)}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Ver
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/admin/startups/${startup.id}/edit`)}
                            >
                              Editar
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Help Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader>
              <CardTitle className="text-primary">¿Necesitas ayuda?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Proceso de Aprobación</h4>
                  <p className="text-sm text-muted-foreground">
                    Nuestro equipo revisa cada startup para asegurar la calidad del directorio. 
                    Normalmente toma 1-3 días hábiles.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Consejos para la Aprobación</h4>
                  <p className="text-sm text-muted-foreground">
                    Proporciona información completa, logos de alta calidad, y una descripción 
                    clara de tu propuesta de valor.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}