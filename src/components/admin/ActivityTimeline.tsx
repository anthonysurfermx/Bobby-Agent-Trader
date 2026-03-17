import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Rocket, 
  FileText, 
  Calendar, 
  Edit, 
  Plus, 
  Trash2,
  Eye,
  Clock
} from "lucide-react";

interface ActivityItem {
  id: string;
  type: 'startup' | 'blog' | 'event' | 'edit' | 'delete' | 'view';
  action: string;
  item: string;
  time: string;
  user?: string;
}

const activityData: ActivityItem[] = [
  { id: '1', type: 'startup', action: 'Startup agregada', item: 'Kubo Finance', time: 'hace 2 horas', user: 'Admin' },
  { id: '2', type: 'blog', action: 'Artículo publicado', item: 'El futuro de DeFi en LATAM', time: 'hace 5 horas', user: 'Admin' },
  { id: '3', type: 'event', action: 'Evento creado', item: 'Meetup DeFi CDMX', time: 'hace 1 día', user: 'Admin' },
  { id: '4', type: 'edit', action: 'Startup editada', item: 'Solarity', time: 'hace 2 días', user: 'Admin' },
  { id: '5', type: 'blog', action: 'Artículo borrador', item: 'Análisis de TVL', time: 'hace 3 días', user: 'Admin' },
  { id: '6', type: 'startup', action: 'Startup aprobada', item: 'DeFi Latam', time: 'hace 4 días', user: 'Admin' },
  { id: '7', type: 'delete', action: 'Evento eliminado', item: 'Workshop Obsoleto', time: 'hace 5 días', user: 'Admin' },
  { id: '8', type: 'view', action: 'Dashboard accedido', item: 'Panel administrativo', time: 'hace 6 días', user: 'Admin' },
];

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'startup': return Rocket;
    case 'blog': return FileText;
    case 'event': return Calendar;
    case 'edit': return Edit;
    case 'delete': return Trash2;
    case 'view': return Eye;
    default: return Plus;
  }
};

const getActivityColor = (type: string) => {
  switch (type) {
    case 'startup': return 'text-primary bg-primary/10';
    case 'blog': return 'text-secondary bg-secondary/10';
    case 'event': return 'text-accent bg-accent/10';
    case 'edit': return 'text-yellow-500 bg-yellow-500/10';
    case 'delete': return 'text-destructive bg-destructive/10';
    case 'view': return 'text-muted-foreground bg-muted/10';
    default: return 'text-primary bg-primary/10';
  }
};

export function ActivityTimeline() {
  return (
    <Card className="bg-gradient-dark border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Clock className="w-5 h-5 text-primary" />
          Actividad Reciente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activityData.map((activity, index) => {
            const Icon = getActivityIcon(activity.type);
            const colorClass = getActivityColor(activity.type);
            
            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className={`p-2 rounded-full ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground text-sm">
                      {activity.action}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {activity.user}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {activity.item}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activity.time}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}