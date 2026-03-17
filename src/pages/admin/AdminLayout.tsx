// src/pages/admin/AdminLayout.tsx
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Calendar,
  Users,
  Menu,
  X,
  ChevronRight,
  Settings,
  Globe,
  UserCheck,
  Briefcase,
  Link2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';

type MenuItem = {
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: string;
  requiredRoles?: string[]; // Roles que pueden ver este item
};

const MOBILE_NAV_ID = 'admin-mobile-sidebar';

const menuItems: MenuItem[] = [
  {
    title: 'Dashboard',
    path: '/admin',
    icon: LayoutDashboard,
    exact: true,
    requiredRoles: ['admin', 'editor']
  },
  {
    title: 'Content Machine',
    path: '/admin/content-machine',
    icon: Zap,
    badge: 'Nuevo',
    requiredRoles: ['admin']
  },
  // Blog, Academia y Video Tutoriales removidos temporalmente
  {
    title: 'Comunidades',
    path: '/admin/comunidades',
    icon: Globe,
    requiredRoles: ['admin', 'editor']
  },
  {
    title: 'Referentes',
    path: '/admin/referentes',
    icon: UserCheck,
    requiredRoles: ['admin', 'editor']
  },
  {
    title: 'Startups',
    path: '/admin/startups',
    icon: Building2,
    requiredRoles: ['admin', 'editor']
  },
  {
    title: 'Trabajos Web3',
    path: '/admin/jobs',
    icon: Briefcase,
    requiredRoles: ['admin', 'editor']
  },
  {
    title: 'Eventos',
    path: '/admin/eventos',
    icon: Calendar,
    requiredRoles: ['admin', 'editor']
  },
  {
    title: 'Short URLs',
    path: '/admin/short-urls',
    icon: Link2,
    requiredRoles: ['admin', 'editor']
  },
  {
    title: 'Usuarios',
    path: '/admin/usuarios',
    icon: Users,
    requiredRoles: ['admin']
  }
];

export default function AdminLayout() {
  const location = useLocation();
  const { getRoles } = useAuth();
  const userRoles = getRoles?.() || [];
  
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('admin.sidebarOpen');
    return saved ? saved === '1' : true;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filtrar items del menú según roles del usuario
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      if (!item.requiredRoles?.length) return true; // Si no tiene restricciones, mostrar
      return item.requiredRoles.some(role => userRoles.includes(role as any));
    });
  }, [userRoles]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('admin.sidebarOpen', sidebarOpen ? '1' : '0');
  }, [sidebarOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const isActive = (path: string, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const currentTitle = useMemo(
    () => filteredMenuItems.find(item => isActive(item.path, item.exact))?.title || 'Admin',
    [location.pathname, filteredMenuItems]
  );

  return (
    <div className="min-h-screen bg-background">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-primary-foreground px-3 py-2 rounded">
        Saltar al contenido
      </a>
      
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={mobileMenuOpen}
          aria-controls={MOBILE_NAV_ID}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Sidebar Desktop */}
      <aside aria-label="Barra lateral de administración" className={`
        hidden lg:block fixed left-0 top-0 h-full bg-card border-r transition-all duration-300 z-30
        ${sidebarOpen ? 'w-64' : 'w-16'}
      `}>
        <div className="p-4 h-full flex flex-col">
          {/* Logo */}
          <div className="flex items-center justify-between mb-8">
            <Link to="/admin" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold">A</span>
              </div>
              {sidebarOpen && (
                <span className="font-bold text-lg">Admin Panel</span>
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Colapsar barra lateral' : 'Expandir barra lateral'}
              aria-pressed={sidebarOpen}
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="space-y-2 flex-1" aria-label="Navegación de administración">
            {filteredMenuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path, item.exact);
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  onClick={(e) => {
                    // Forzar navegación si hay problemas
                    e.stopPropagation();
                  }}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg transition-colors relative cursor-pointer
                    ${active 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-accent hover:text-accent-foreground'
                    }
                  `}
                  title={!sidebarOpen ? item.title : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarOpen && (
                    <>
                      <span className="flex-1">{item.title}</span>
                      {item.badge && (
                        <span className={`
                          text-xs px-2 py-0.5 rounded-full
                          ${item.badge === 'Nuevo' 
                            ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
                            : 'bg-muted'
                          }
                        `}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Settings at bottom */}
          {sidebarOpen && (
            <div className="mt-auto pt-4 border-t">
              <Link
                to="/admin/settings"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Settings className="h-5 w-5" />
                <span>Configuración</span>
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Sidebar Mobile */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
              onClick={() => setMobileMenuOpen(false)}
            />
            
            {/* Sidebar */}
            <motion.aside
              id={MOBILE_NAV_ID}
              aria-label="Navegación móvil de administración"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="lg:hidden fixed left-0 top-0 h-full w-72 bg-card border-r z-50 shadow-xl"
            >
              <div className="p-4 pt-16">
                {/* Logo */}
                <div className="flex items-center gap-2 mb-8">
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center">
                    <span className="text-primary-foreground font-bold">A</span>
                  </div>
                  <span className="font-bold text-lg">Admin Panel</span>
                </div>

                {/* Navigation */}
                <nav className="space-y-2" aria-label="Navegación de administración">
                  {filteredMenuItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path, item.exact);
                    
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`
                          flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                          ${active 
                            ? 'bg-primary text-primary-foreground' 
                            : 'hover:bg-accent hover:text-accent-foreground'
                          }
                        `}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="flex-1">{item.title}</span>
                        {item.badge && (
                          <span className={`
                            text-xs px-2 py-0.5 rounded-full
                            ${item.badge === 'Nuevo' 
                              ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
                              : 'bg-muted'
                            }
                          `}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>

                {/* Settings */}
                <div className="mt-8 pt-4 border-t">
                  <Link
                    to="/admin/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Settings className="h-5 w-5" />
                    <span>Configuración</span>
                  </Link>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main id="admin-main" className={`
        transition-all duration-300
        ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'}
      `}>
        {/* Header */}
        <header className="bg-card border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">
                {currentTitle}
              </h1>
            </div>
            
            {/* User info (temporal) */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:inline">Modo Administrador</span>
              <Link to="/" className="text-sm hover:text-primary transition-colors">
                Ver sitio →
              </Link>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}