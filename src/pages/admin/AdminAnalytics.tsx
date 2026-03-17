import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, TrendingUp, TrendingDown, Users, Eye, MessageSquare, Heart, Share2, Download } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

const AdminAnalytics = () => {
  const [timeRange, setTimeRange] = useState("30d");

  const analyticsData = {
    overview: {
      totalVisits: "45,234",
      totalUsers: "12,456",
      pageViews: "89,123",
      bounceRate: "32.5%",
      avgSessionDuration: "4m 23s",
      conversionRate: "8.2%"
    },
    trends: {
      visits: { value: "+15.3%", isPositive: true },
      users: { value: "+8.7%", isPositive: true },
      pageViews: { value: "+22.1%", isPositive: true },
      bounceRate: { value: "-5.2%", isPositive: true },
      sessionDuration: { value: "+12.8%", isPositive: true },
      conversionRate: { value: "+3.1%", isPositive: true }
    },
    topPages: [
      { page: "/startups", views: "15,234", percentage: 34.2 },
      { page: "/comunidades", views: "8,456", percentage: 18.9 },
      { page: "/blog", views: "6,789", percentage: 15.2 },
      { page: "/eventos", views: "4,567", percentage: 10.2 },
      { page: "/", views: "9,654", percentage: 21.5 }
    ],
    userStats: {
      newUsers: "3,456",
      returningUsers: "9,000",
      totalSessions: "18,234",
      avgPagesPerSession: "3.2"
    },
    contentEngagement: [
      { title: "El auge de DeFi en Latinoamérica", views: "2,345", likes: "156", shares: "89" },
      { title: "Cómo las DAOs están transformando la gobernanza", views: "1,892", likes: "134", shares: "67" },
      { title: "CryptoLend MX - Préstamos descentralizados", views: "1,567", likes: "98", shares: "45" },
      { title: "DeFi México Meetup - CDMX", views: "1,234", likes: "87", shares: "34" }
    ],
    realtimeStats: {
      activeUsers: "234",
      pageViews: "1,456",
      topCountries: [
        { country: "México", percentage: 78.5 },
        { country: "Estados Unidos", percentage: 12.3 },
        { country: "Colombia", percentage: 4.2 },
        { country: "Argentina", percentage: 3.1 },
        { country: "España", percentage: 1.9 }
      ]
    }
  };

  const timeRanges = [
    { value: "7d", label: "Últimos 7 días" },
    { value: "30d", label: "Últimos 30 días" },
    { value: "90d", label: "Últimos 3 meses" },
    { value: "1y", label: "Último año" }
  ];

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
            <p className="text-muted-foreground">
              Métricas y estadísticas del ecosistema DeFi México
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeRanges.map(range => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">Total de Visitas</div>
                <div className={`flex items-center text-sm ${
                  analyticsData.trends.visits.isPositive ? "text-green-500" : "text-red-500"
                }`}>
                  {analyticsData.trends.visits.isPositive ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {analyticsData.trends.visits.value}
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {analyticsData.overview.totalVisits}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">Usuarios Únicos</div>
                <div className={`flex items-center text-sm ${
                  analyticsData.trends.users.isPositive ? "text-green-500" : "text-red-500"
                }`}>
                  {analyticsData.trends.users.isPositive ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {analyticsData.trends.users.value}
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {analyticsData.overview.totalUsers}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">Páginas Vistas</div>
                <div className={`flex items-center text-sm ${
                  analyticsData.trends.pageViews.isPositive ? "text-green-500" : "text-red-500"
                }`}>
                  {analyticsData.trends.pageViews.isPositive ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {analyticsData.trends.pageViews.value}
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {analyticsData.overview.pageViews}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">Tasa de Rebote</div>
                <div className={`flex items-center text-sm ${
                  analyticsData.trends.bounceRate.isPositive ? "text-green-500" : "text-red-500"
                }`}>
                  {analyticsData.trends.bounceRate.isPositive ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {analyticsData.trends.bounceRate.value}
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {analyticsData.overview.bounceRate}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">Duración Promedio</div>
                <div className={`flex items-center text-sm ${
                  analyticsData.trends.sessionDuration.isPositive ? "text-green-500" : "text-red-500"
                }`}>
                  {analyticsData.trends.sessionDuration.isPositive ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {analyticsData.trends.sessionDuration.value}
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {analyticsData.overview.avgSessionDuration}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">Tasa de Conversión</div>
                <div className={`flex items-center text-sm ${
                  analyticsData.trends.conversionRate.isPositive ? "text-green-500" : "text-red-500"
                }`}>
                  {analyticsData.trends.conversionRate.isPositive ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {analyticsData.trends.conversionRate.value}
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {analyticsData.overview.conversionRate}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Pages */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Eye className="w-5 h-5 mr-2" />
                Páginas Más Visitadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData.topPages.map((page, index) => (
                  <div key={page.page} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-semibold text-primary">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{page.page}</div>
                        <div className="text-sm text-muted-foreground">{page.views} vistas</div>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {page.percentage}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Real-time Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Estadísticas en Tiempo Real
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Usuarios Activos</span>
                  <span className="text-2xl font-bold text-green-500">
                    {analyticsData.realtimeStats.activeUsers}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Páginas Vistas (Hoy)</span>
                  <span className="text-lg font-semibold text-foreground">
                    {analyticsData.realtimeStats.pageViews}
                  </span>
                </div>
                
                <div className="pt-4">
                  <h4 className="font-medium text-foreground mb-3">Top Países</h4>
                  <div className="space-y-2">
                    {analyticsData.realtimeStats.topCountries.map((country) => (
                      <div key={country.country} className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{country.country}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${country.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10">
                            {country.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content Engagement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <MessageSquare className="w-5 h-5 mr-2" />
              Engagement de Contenido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analyticsData.contentEngagement.map((content, index) => (
                <div key={index} className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground mb-1">{content.title}</h4>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <Eye className="w-3 h-3 mr-1" />
                        {content.views}
                      </div>
                      <div className="flex items-center">
                        <Heart className="w-3 h-3 mr-1" />
                        {content.likes}
                      </div>
                      <div className="flex items-center">
                        <Share2 className="w-3 h-3 mr-1" />
                        {content.shares}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default AdminAnalytics;