import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowRight, PlayCircle, Users, Award, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function AcademyHeroSection() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleStartLearning = () => {
    if (!user) {
      navigate('/login?redirect=/academia');
    } else {
      document.getElementById('cursos')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10 py-20">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <BookOpen className="w-4 h-4" />
                Academia DeFi México
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                Aprende DeFi con los
                <span className="text-primary block mt-2">mejores expertos</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl">
                Domina las finanzas descentralizadas con cursos prácticos,
                desde conceptos básicos hasta estrategias avanzadas de inversión.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                onClick={handleStartLearning}
                className="group"
              >
                {user ? 'Ver Cursos' : 'Comenzar Ahora'}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/academia#premium')}
                className="group"
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                Ver Demo
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-8 border-t">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Users className="w-5 h-5" />
                  <span className="text-2xl font-bold">500+</span>
                </div>
                <p className="text-sm text-muted-foreground">Estudiantes activos</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <PlayCircle className="w-5 h-5" />
                  <span className="text-2xl font-bold">50+</span>
                </div>
                <p className="text-sm text-muted-foreground">Horas de contenido</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Award className="w-5 h-5" />
                  <span className="text-2xl font-bold">100%</span>
                </div>
                <p className="text-sm text-muted-foreground">Práctico</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 blur-3xl" />
            <Card className="relative overflow-hidden aspect-video">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-20 w-20 rounded-full bg-background/80 backdrop-blur hover:bg-background/90"
                  onClick={() => navigate('/academia#demo')}
                >
                  <PlayCircle className="h-12 w-12 text-primary" />
                </Button>
              </div>
              <img
                src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&h=450&fit=crop"
                alt="DeFi Academy Preview"
                className="w-full h-full object-cover opacity-80"
              />
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}