import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Rocket,
  Calendar,
  Settings,
  LogOut,
  Briefcase,
  Users,
  MapPin,
  Star,
  Video
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import LogoDeFiMx from "@/components/ui/LogoDeFiMx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Startups", url: "/admin/startups", icon: Rocket },
  { title: "Comunidades", url: "/admin/comunidades", icon: MapPin },
  { title: "Trabajos Web3", url: "/admin/jobs", icon: Briefcase },
  { title: "Eventos", url: "/admin/eventos", icon: Calendar },
  { title: "Referentes", url: "/admin/referentes", icon: Star },
  { title: "Video Tutoriales", url: "/admin/academia/videos", icon: Video },
  { title: "Usuarios", url: "/admin/usuarios", icon: Users },
  { title: "Configuración", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === "/admin") {
      return currentPath === path;
    }
    return currentPath.startsWith(path);
  };

  const getNavCls = (path: string) => {
    const baseClasses = "relative transition-all duration-200 rounded-lg";
    if (isActive(path)) {
      return `${baseClasses} bg-gradient-primary text-primary-foreground font-medium shadow-neon border-l-4 border-primary`;
    }
    return `${baseClasses} hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground`;
  };

  return (
    <Sidebar className={`${collapsed ? "w-16" : "w-60"} transition-all duration-300`} collapsible="icon">
      <SidebarContent className="bg-sidebar border-r border-sidebar-border">
        {/* Header with Logo */}
        <SidebarHeader className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <LogoDeFiMx className="w-8 h-8" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-lg text-sidebar-foreground">DeFi México</span>
                <span className="text-xs text-sidebar-foreground/60">Admin Panel</span>
              </div>
            )}
          </div>
        </SidebarHeader>

        {/* Admin Profile */}
        {!collapsed && (
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src="/api/placeholder/40/40" alt="Admin" />
                <AvatarFallback className="bg-primary text-primary-foreground">AD</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium text-sm text-sidebar-foreground">Admin User</span>
                <span className="text-xs text-sidebar-foreground/60">admin@defimexico.com</span>
              </div>
            </div>
          </div>
        )}

        {/* Main Navigation */}
        <SidebarGroup className="flex-1">
          <SidebarGroupLabel className="text-sidebar-foreground/60">Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={getNavCls(item.url)}>
                      <item.icon className="w-5 h-5" />
                      {!collapsed && (
                        <span>{item.title}</span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Footer with Logout */}
        <SidebarFooter className="p-4 border-t border-sidebar-border">
          <Button 
            variant="outline" 
            size={collapsed ? "icon" : "default"}
            className="w-full justify-start text-sidebar-foreground border-sidebar-border hover:bg-destructive hover:text-destructive-foreground"
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span className="ml-2">Cerrar Sesión</span>}
          </Button>
        </SidebarFooter>
      </SidebarContent>
    </Sidebar>
  );
}