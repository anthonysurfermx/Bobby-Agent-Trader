import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

const StatsCard = ({ title, value, description, icon: Icon, trend }: StatsCardProps) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Card className="bg-gradient-dark border-border hover:border-primary/30 transition-all duration-300 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-glow opacity-50" />
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            {trend && (
              <div className={`text-sm font-medium ${
                trend.isPositive ? 'text-neon-green' : 'text-destructive'
              }`}>
                {trend.isPositive ? '+' : ''}{trend.value}
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-foreground">{value}</h3>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default StatsCard;