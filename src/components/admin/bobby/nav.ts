// The dashboard's sections, in sidebar order.
import { BadgeCheck, Filter, LayoutGrid, MapPin, Plug, Sparkles, Ticket, Users } from 'lucide-react';

export const TABS = [
  { id: 'resumen', label: 'Resumen', icon: LayoutGrid },
  { id: 'funnel', label: 'Funnel', icon: Filter },
  { id: 'audiencia', label: 'Audiencia', icon: MapPin },
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'membresias', label: 'Membresías', icon: BadgeCheck },
  { id: 'cupones', label: 'Cupones', icon: Ticket },
  { id: 'ia', label: 'IA', icon: Sparkles },
  { id: 'integraciones', label: 'Integraciones', icon: Plug },
] as const;
export type TabId = typeof TABS[number]['id'];
