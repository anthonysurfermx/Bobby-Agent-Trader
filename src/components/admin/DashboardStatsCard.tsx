import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface DashboardStatsCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  sparklineData?: Array<{ value: number }>;
}

export function DashboardStatsCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend,
  sparklineData 
}: DashboardStatsCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Card className="bg-gradient-dark border-border hover:border-primary/30 transition-all duration-300 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-glow opacity-30" />
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            {trend && (
              <div className={`flex items-center gap-1 text-sm font-medium ${
                trend.isPositive ? 'text-neon-green' : 'text-destructive'
              }`}>
                {trend.isPositive ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                {trend.value}
              </div>
            )}
          </div>
          
          <div className="space-y-2 mb-4">
            <h3 className="text-3xl font-bold text-foreground">{value}</h3>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>

          {/* Mini Sparkline Chart */}
          {sparklineData && sparklineData.length > 0 && (
            <div className="h-12">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}