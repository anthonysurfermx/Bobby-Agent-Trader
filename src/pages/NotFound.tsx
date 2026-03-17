// src/pages/NotFound.tsx
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PixelHelpCircle,
  PixelHome,
  PixelArrowLeft,
  PixelSearch,
  PixelCompass
} from '@/components/ui/pixel-icons';

export default function NotFound() {
  const navigate = useNavigate();

  // Sugerencias de páginas populares
  const suggestions = [
    { path: '/startups', label: 'Explorar Startups', Icon: PixelCompass },
    { path: '/eventos', label: 'Ver Eventos', Icon: PixelSearch },
    { path: '/comunidades', label: 'Comunidades DeFi', Icon: PixelCompass },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      {/* Decoración de fondo */}
      <div className="absolute inset-0 bg-grid-white/10 bg-grid-16 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
      
      <Card className="w-full max-w-md relative z-10 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse" />
            <div className="relative p-4 bg-primary/10 rounded-full">
              <PixelHelpCircle size={48} className="text-primary animate-bounce" />
            </div>
          </div>
          
          <CardTitle className="text-3xl font-bold">
            404
          </CardTitle>
          
          <CardDescription className="text-lg mt-2">
            Página No Encontrada
          </CardDescription>
        </CardHeader>
        
        <CardContent className="text-center space-y-6">
          <p className="text-muted-foreground">
            Lo sentimos, la página que buscas no existe o ha sido movida.
          </p>
          
          {/* Sugerencias */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              Tal vez te interese:
            </p>
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <Link
                  key={suggestion.path}
                  to={suggestion.path}
                  className="flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <suggestion.Icon size={16} className="text-primary" />
                  <span className="text-sm">{suggestion.label}</span>
                </Link>
              ))}
            </div>
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
        </CardFooter>
      </Card>
    </div>
  );
}