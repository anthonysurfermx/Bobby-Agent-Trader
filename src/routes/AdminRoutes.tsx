import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AdminDashboard } from '@/pages/admin/Dashboard';
import { StartupsManager } from '@/pages/admin/StartupsManager';
import { EventsManager } from '@/pages/admin/EventsManager';
import { UsersManager } from '@/pages/admin/UsersManager';
import { BlogManager } from '@/pages/admin/BlogManager';
import { Analytics } from '@/pages/admin/Analytics';

export function AdminRoutes() {
  const { user, role } = useAuth();

  if (!user || role !== 'admin') {
    return <Navigate to="/unauthorized" />;
  }

  return (
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      <Route path="/startups" element={<StartupsManager />} />
      <Route path="/events" element={<EventsManager />} />
      <Route path="/users" element={<UsersManager />} />
      <Route path="/blog" element={<BlogManager />} />
      <Route path="/analytics" element={<Analytics />} />
    </Routes>
  );
}
