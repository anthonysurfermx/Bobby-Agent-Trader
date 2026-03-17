import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Briefcase, Calendar, BookOpen, TrendingUp, Activity } from 'lucide-react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

interface DashboardStats {
  totalUsers: number;
  totalStartups: number;
  totalEvents: number;
  totalPosts: number;
  weeklyGrowth: number;
  activeUsers: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Cargar estadísticas
      const [users, startups, events, posts] = await Promise.all([
        supabase.from('profiles').select('count'),
        supabase.from('startups').select('count').eq('status', 'approved'),
        supabase.from('events').select('count').eq('status', 'upcoming'),
        supabase.from('blog_posts').select('count').eq('status', 'published')
      ]);

      setStats({
        totalUsers: users.count || 0,
        totalStartups: startups.count || 0,
        totalEvents: events.count || 0,
        totalPosts: posts.count || 0,
        weeklyGrowth: 12.5, // Calcular real
        activeUsers: 85 // Calcular real
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Cargando dashboard...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Dashboard DeFi México Hub</h1>
      
      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Usuarios Totales</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers}</div>
            <p className="text-xs text-muted-foreground">+12.5% desde la semana pasada</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Startups Activas</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalStartups}</div>
            <p className="text-xs text-muted-foreground">3 pendientes de aprobación</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Eventos Próximos</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalEvents}</div>
            <p className="text-xs text-muted-foreground">2 esta semana</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Artículos Blog</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPosts}</div>
            <p className="text-xs text-muted-foreground">5 en borrador</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficas y más estadísticas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Crecimiento de Usuarios</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Aquí iría la gráfica con Chart.js */}
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Gráfica de crecimiento
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center">
                <Activity className="h-4 w-4 mr-2" />
                <span className="text-sm">Nueva startup registrada: TechMX</span>
              </div>
              <div className="flex items-center">
                <Activity className="h-4 w-4 mr-2" />
                <span className="text-sm">Evento creado: Meetup DeFi Enero</span>
              </div>
              <div className="flex items-center">
                <Activity className="h-4 w-4 mr-2" />
                <span className="text-sm">Nuevo usuario: maria@example.com</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
