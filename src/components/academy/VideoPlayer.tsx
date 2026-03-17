import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  PlayCircle,
  Lock,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  FileText,
  Download,
  CheckCircle,
  Clock
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface VideoModule {
  id: string;
  title: string;
  duration: number;
  completed: boolean;
  locked: boolean;
  youtubeId: string;
}

interface VideoPlayerProps {
  courseId: string;
  courseTitle: string;
  modules: VideoModule[];
  currentModuleIndex?: number;
  isPremium?: boolean;
}

export function VideoPlayer({
  courseId,
  courseTitle,
  modules,
  currentModuleIndex = 0,
  isPremium = false
}: VideoPlayerProps) {
  const { user } = useAuth();
  const [currentModule, setCurrentModule] = useState(currentModuleIndex);
  const [completedModules, setCompletedModules] = useState<Set<string>>(new Set());

  const activeModule = modules[currentModule];
  const hasAccess = !isPremium || user?.user_metadata?.role === 'premium';
  const progress = (completedModules.size / modules.length) * 100;

  const handleModuleComplete = () => {
    setCompletedModules(prev => new Set([...prev, activeModule.id]));
  };

  const handleNextModule = () => {
    if (currentModule < modules.length - 1) {
      setCurrentModule(currentModule + 1);
    }
  };

  const handlePreviousModule = () => {
    if (currentModule > 0) {
      setCurrentModule(currentModule - 1);
    }
  };

  const getYouTubeEmbedUrl = (youtubeId: string) => {
    return `https://www.youtube.com/embed/${youtubeId}?modestbranding=1&rel=0`;
  };

  if (!hasAccess) {
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <Lock className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Contenido Premium</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Este curso requiere una suscripción premium para acceder al contenido completo.
          </p>
          <Button onClick={() => window.location.href = '/academia#premium'}>
            Obtener Acceso Premium
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="aspect-video bg-black relative">
          {activeModule.locked && !hasAccess ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center text-white">
                <Lock className="w-12 h-12 mx-auto mb-4" />
                <p>Este módulo requiere acceso premium</p>
              </div>
            </div>
          ) : (
            <iframe
              src={getYouTubeEmbedUrl(activeModule.youtubeId)}
              title={activeModule.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>

        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl">{activeModule.title}</CardTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{activeModule.duration} min</span>
                </div>
                <Badge variant={completedModules.has(activeModule.id) ? "default" : "secondary"}>
                  {completedModules.has(activeModule.id) ? "Completado" : "En progreso"}
                </Badge>
              </div>
            </div>
            {!completedModules.has(activeModule.id) && (
              <Button onClick={handleModuleComplete}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Marcar como completado
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              onClick={handlePreviousModule}
              disabled={currentModule === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              {currentModule + 1} de {modules.length} módulos
            </span>
            <Button
              variant="outline"
              onClick={handleNextModule}
              disabled={currentModule === modules.length - 1}
            >
              Siguiente
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progreso del curso</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="modules" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="modules">Módulos</TabsTrigger>
          <TabsTrigger value="resources">Recursos</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="space-y-2">
          {modules.map((module, index) => (
            <Card
              key={module.id}
              className={`cursor-pointer transition-colors ${
                index === currentModule ? 'border-primary' : ''
              } ${module.locked && !hasAccess ? 'opacity-50' : ''}`}
              onClick={() => !module.locked || hasAccess ? setCurrentModule(index) : null}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    completedModules.has(module.id)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}>
                    {completedModules.has(module.id) ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-medium">{index + 1}</span>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium">{module.title}</h4>
                    <p className="text-sm text-muted-foreground">{module.duration} min</p>
                  </div>
                </div>
                {module.locked && !hasAccess ? (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                ) : index === currentModule ? (
                  <PlayCircle className="w-5 h-5 text-primary" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Guía del curso</p>
                  <p className="text-sm text-muted-foreground">PDF - 2.5 MB</p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Descargar
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Ejercicios prácticos</p>
                  <p className="text-sm text-muted-foreground">ZIP - 1.8 MB</p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Descargar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground text-center py-8">
                Las notas del curso estarán disponibles próximamente.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}