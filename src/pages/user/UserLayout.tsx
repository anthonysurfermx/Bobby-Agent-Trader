import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Calendar,
  Users,
  Menu,
  X,
  Settings,
  Globe,
  LogOut,
  Home,
  ArrowLeft
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

type MenuItem = {
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: string;
  editorOnly?: boolean;
};

const menuItems: MenuItem[] = [
  {
    title: 'Dashboard',
    path: '/user',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    title: 'Proponer Startup',
    path: '/user/startups/nueva',
    icon: Building2,
  },
  {
    title: 'Proponer Comunidad',
    path: '/user/comunidades/nueva',
    icon: Globe,
  },
  {
    title: 'Proponer Evento',
    path: '/user/eventos/nuevo',
    icon: Calendar,
  },
  {
    title: 'Proponer Referente',
    path: '/user/referentes/nuevo',
    icon: Users,
  },
  {
    title: 'Publicar Trabajo',
    path: '/user/trabajos/nuevo',
    icon: Briefcase,
  },
  {
    title: 'Configuración',
    path: '/user/settings',
    icon: Settings,
  },
];

export default function UserLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { role, isEditor } = useUserRole();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Filter menu items based on role
  const visibleMenuItems = menuItems.filter(item => {
    if (item.editorOnly && !isEditor) return false;
    return true;
  });

  const handleLogout = async () => {
    await signOut();
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Link to="/" className="text-lg font-bold hover:text-primary transition-colors">
              DeFi México
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/">
                <Home className="h-5 w-5" />
              </Link>
            </Button>
            <Badge variant={isEditor ? "default" : "secondary"}>
              {isEditor ? "Editor" : "Usuario"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r bg-card min-h-screen sticky top-0">
          {/* Logo */}
          <div className="p-6 border-b">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center group-hover:scale-105 transition-transform">
                <span className="text-xl font-bold text-primary-foreground">DM</span>
              </div>
              <div>
                <h2 className="font-bold text-lg group-hover:text-primary transition-colors">DeFi México</h2>
                <p className="text-xs text-muted-foreground">
                  {isEditor ? "Panel Editor" : "Panel Usuario"}
                </p>
              </div>
            </Link>
          </div>

          {/* Back to Home */}
          <div className="px-4 pt-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                <span>Ir a DeFi México</span>
              </Link>
            </Button>
          </div>

          {/* User Info */}
          <div className="p-4 border-b">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.email}</p>
                <Badge variant={isEditor ? "default" : "secondary"} className="text-xs mt-1">
                  {isEditor ? "Editor" : "Usuario"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path, item.exact);

              return (
                <Button
                  key={item.path}
                  variant={active ? "default" : "ghost"}
                  className={`w-full justify-start gap-3 ${
                    active ? 'shadow-md' : ''
                  }`}
                  onClick={() => navigate(item.path)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.title}</span>
                  {item.badge && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </nav>

          {/* Logout Button */}
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span>Cerrar Sesión</span>
            </Button>
          </div>
        </aside>

        {/* Mobile Sidebar */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed left-0 top-16 bottom-0 w-64 bg-card border-r z-40 lg:hidden overflow-y-auto"
              >
                {/* Back to Home */}
                <div className="p-4 border-b">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <Link to="/">
                      <ArrowLeft className="h-4 w-4" />
                      <span>Ir a DeFi México</span>
                    </Link>
                  </Button>
                </div>

                {/* User Info */}
                <div className="p-4 border-b">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user?.email}</p>
                      <Badge variant={isEditor ? "default" : "secondary"} className="text-xs mt-1">
                        {isEditor ? "Editor" : "Usuario"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-1">
                  {visibleMenuItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path, item.exact);

                    return (
                      <Button
                        key={item.path}
                        variant={active ? "default" : "ghost"}
                        className="w-full justify-start gap-3"
                        onClick={() => navigate(item.path)}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.badge && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {item.badge}
                          </Badge>
                        )}
                      </Button>
                    );
                  })}
                </nav>

                {/* Logout Button */}
                <div className="p-4 border-t">
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Cerrar Sesión</span>
                  </Button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
