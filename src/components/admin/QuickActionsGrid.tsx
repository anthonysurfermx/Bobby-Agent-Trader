import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Rocket, Calendar, Users, MapPin, Briefcase } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuickAction {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: string;
}

const quickActions: QuickAction[] = [
  {
    title: "Nueva Startup",
    description: "Agregar una nueva startup al catálogo",
    icon: Rocket,
    href: "/admin/startups/new",
    color: "from-primary to-primary/80"
  },
  {
    title: "Nueva Comunidad",
    description: "Crear una nueva comunidad Web3",
    icon: MapPin,
    href: "/admin/comunidades/new",
    color: "from-blue-500 to-blue-400"
  },
  {
    title: "Nuevo Trabajo",
    description: "Publicar oferta de trabajo Web3",
    icon: Briefcase,
    href: "/admin/jobs/new",
    color: "from-amber-500 to-amber-400"
  },
  {
    title: "Gestionar Eventos",
    description: "Administrar eventos y crear nuevos",
    icon: Calendar,
    href: "/admin/eventos",
    color: "from-accent to-accent/80"
  },
  {
    title: "Gestionar Usuarios",
    description: "Administrar usuarios y roles",
    icon: Users,
    href: "/admin/usuarios",
    color: "from-purple-500 to-purple-400"
  },
];

export function QuickActionsGrid() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Plus className="w-5 h-5 text-primary" />
        Acciones Rápidas
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
        {quickActions.map((action, index) => {
          const Icon = action.icon;
          
          return (
            <motion.div
              key={action.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card className="bg-gradient-dark border-border hover:border-primary/30 transition-all duration-300 overflow-hidden cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(action.href);
                    }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl bg-gradient-to-r ${action.color}`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground mb-1">
                        {action.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}