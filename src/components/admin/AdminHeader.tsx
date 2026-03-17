import { Search, Bell, Sun, Moon, Clock } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

interface AdminHeaderProps {
  title?: string;
}

export function AdminHeader({ title }: AdminHeaderProps) {
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const generateBreadcrumbs = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs = [];

    pathSegments.forEach((segment, index) => {
      const path = '/' + pathSegments.slice(0, index + 1).join('/');
      const label = segment.charAt(0).toUpperCase() + segment.slice(1);
      
      breadcrumbs.push({
        label,
        path,
        isLast: index === pathSegments.length - 1
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    // Here you would implement actual theme switching
  };

  const formatTime = (date: Date) => {
    return date.toLocaleString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <header className="h-16 flex items-center justify-between border-b border-border bg-card px-6 sticky top-0 z-50 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="hover:bg-accent hover:text-accent-foreground" />
        
        {/* Breadcrumbs */}
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="flex items-center">
                <BreadcrumbItem>
                  {crumb.isLast ? (
                    <BreadcrumbPage className="font-medium text-foreground">
                      {title || crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink 
                      href={crumb.path}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!crumb.isLast && <BreadcrumbSeparator />}
              </div>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-4">
        {/* Global Search */}
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar startups, artículos, eventos... (Ctrl+K)"
            className="pl-10 bg-background/50 border-border focus:bg-background"
          />
        </div>

        {/* Current Time */}
        <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>{formatTime(currentTime)}</span>
        </div>

        {/* Theme Toggle */}
        <Button 
          variant="outline" 
          size="icon"
          onClick={toggleTheme}
          className="hover:bg-accent hover:text-accent-foreground"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="relative hover:bg-accent hover:text-accent-foreground">
              <Bell className="w-4 h-4" />
              <Badge className="absolute -top-2 -right-2 w-5 h-5 text-xs bg-destructive text-destructive-foreground">
                3
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="p-3 border-b">
              <h4 className="font-medium">Notificaciones</h4>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <DropdownMenuItem className="p-3 flex flex-col items-start">
                <div className="font-medium">Nueva startup agregada</div>
                <div className="text-sm text-muted-foreground">Kubo Finance fue registrada hace 2 horas</div>
              </DropdownMenuItem>
              <DropdownMenuItem className="p-3 flex flex-col items-start">
                <div className="font-medium">Evento próximo</div>
                <div className="text-sm text-muted-foreground">Meetup DeFi CDMX en 2 días</div>
              </DropdownMenuItem>
              <DropdownMenuItem className="p-3 flex flex-col items-start">
                <div className="font-medium">Artículo publicado</div>
                <div className="text-sm text-muted-foreground">El futuro de DeFi en LATAM</div>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}