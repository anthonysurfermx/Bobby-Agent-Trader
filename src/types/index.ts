// src/types/index.ts - Tipos completos de la aplicación
import { Database } from './database.types';

// =====================================================
// TIPOS DE TABLAS
// =====================================================
export type BlogPost = Database['public']['Tables']['blog_posts']['Row'];
export type Community = Database['public']['Tables']['communities']['Row'];
export type ContactForm = Database['public']['Tables']['contact_forms']['Row'];
export type EventRegistration = Database['public']['Tables']['event_registrations']['Row'];
export type EventSpeaker = Database['public']['Tables']['event_speakers']['Row'];
export type Event = Database['public']['Tables']['events']['Row'];
export type EventOld = Database['public']['Tables']['events_old']['Row'];
export type Founder = Database['public']['Tables']['founders']['Row'];
export type Log = Database['public']['Tables']['logs']['Row'];
export type NewsletterSubscriber = Database['public']['Tables']['newsletter_subscribers']['Row'];
export type PlatformStats = Database['public']['Tables']['platform_stats']['Row'];
export type StartupApplication = Database['public']['Tables']['startup_applications']['Row'];
export type Startup = Database['public']['Tables']['startups']['Row'];
export type UserRole = Database['public']['Tables']['user_roles']['Row'];

// =====================================================
// TIPOS PARA INSERT Y UPDATE
// =====================================================
export type BlogPostInsert = Database['public']['Tables']['blog_posts']['Insert'];
export type BlogPostUpdate = Database['public']['Tables']['blog_posts']['Update'];
export type CommunityInsert = Database['public']['Tables']['communities']['Insert'];
export type CommunityUpdate = Database['public']['Tables']['communities']['Update'];
export type ContactFormInsert = Database['public']['Tables']['contact_forms']['Insert'];
export type ContactFormUpdate = Database['public']['Tables']['contact_forms']['Update'];
export type EventRegistrationInsert = Database['public']['Tables']['event_registrations']['Insert'];
export type EventRegistrationUpdate = Database['public']['Tables']['event_registrations']['Update'];
export type EventSpeakerInsert = Database['public']['Tables']['event_speakers']['Insert'];
export type EventSpeakerUpdate = Database['public']['Tables']['event_speakers']['Update'];
export type EventInsert = Database['public']['Tables']['events']['Insert'];
export type EventUpdate = Database['public']['Tables']['events']['Update'];
export type FounderInsert = Database['public']['Tables']['founders']['Insert'];
export type FounderUpdate = Database['public']['Tables']['founders']['Update'];
export type LogInsert = Database['public']['Tables']['logs']['Insert'];
export type LogUpdate = Database['public']['Tables']['logs']['Update'];
export type NewsletterSubscriberInsert = Database['public']['Tables']['newsletter_subscribers']['Insert'];
export type NewsletterSubscriberUpdate = Database['public']['Tables']['newsletter_subscribers']['Update'];
export type PlatformStatsInsert = Database['public']['Tables']['platform_stats']['Insert'];
export type PlatformStatsUpdate = Database['public']['Tables']['platform_stats']['Update'];
export type StartupApplicationInsert = Database['public']['Tables']['startup_applications']['Insert'];
export type StartupApplicationUpdate = Database['public']['Tables']['startup_applications']['Update'];
export type StartupInsert = Database['public']['Tables']['startups']['Insert'];
export type StartupUpdate = Database['public']['Tables']['startups']['Update'];
export type UserRoleInsert = Database['public']['Tables']['user_roles']['Insert'];
export type UserRoleUpdate = Database['public']['Tables']['user_roles']['Update'];

// =====================================================
// ENUMS (basados en tu esquema real de Supabase)
// =====================================================
export type ApplicationStatus = Database['public']['Enums']['application_status'];
export type ContactPriority = Database['public']['Enums']['contact_priority'];
export type ContactSource = Database['public']['Enums']['contact_source'];
export type ContactStatus = Database['public']['Enums']['contact_status'];
export type FundingStage = Database['public']['Enums']['funding_stage'];
export type LogLevel = Database['public']['Enums']['log_level'];
export type NewsletterSource = Database['public']['Enums']['newsletter_source'];
export type NewsletterStatus = Database['public']['Enums']['newsletter_status'];
export type RegistrationStatus = Database['public']['Enums']['registration_status'];
export type UserRoleType = Database['public']['Enums']['user_role'];

// =====================================================
// VISTAS
// =====================================================
export type ActiveUserRoles = Database['public']['Views']['active_user_roles']['Row'];
export type ContactFormAnalytics = Database['public']['Views']['contact_form_analytics']['Row'];
export type EventAttendanceAnalytics = Database['public']['Views']['event_attendance_analytics']['Row'];
export type ReviewerWorkload = Database['public']['Views']['reviewer_workload']['Row'];
export type StartupApplicationPipeline = Database['public']['Views']['startup_application_pipeline']['Row'];

// =====================================================
// INTERFACES EXTENDIDAS
// =====================================================

// Interfaz para los links sociales (guardados como JSON)
export interface SocialLinks {
  twitter?: string;
  discord?: string;
  telegram?: string;
  linkedin?: string;
  github?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
  medium?: string;
  website?: string;
}

// Community extendida con campos virtuales para compatibilidad
export interface CommunityExtended extends Community {
  is_verified?: boolean; // Podemos usar is_active como proxy
  active_members_count?: number; // Calculado o derivado
  moderators?: Record<string, any>; // Si necesitas esto
}

// =====================================================
// TIPOS DE RESPUESTA DE SERVICIOS
// =====================================================
export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
  metadata?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

// =====================================================
// FILTROS Y OPCIONES
// =====================================================
export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

export interface CommunityFilters extends PaginationOptions {
  category?: string;
  searchTerm?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  tags?: string[];
  location?: string;
  minMembers?: number;
  maxMembers?: number;
}

export interface ContactFormFilters extends PaginationOptions {
  status?: ContactStatus;
  priority?: ContactPriority;
  source?: ContactSource;
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
  searchTerm?: string;
}

export interface EventFilters extends PaginationOptions {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  location?: string;
  tags?: string[];
  searchTerm?: string;
}

export interface StartupFilters extends PaginationOptions {
  categories?: string[];
  featured?: boolean;
  status?: string;
  foundedYear?: number;
  searchTerm?: string;
}

export interface StartupApplicationFilters extends PaginationOptions {
  status?: ApplicationStatus;
  fundingStage?: FundingStage;
  industry?: string;
  reviewedBy?: string;
  dateFrom?: string;
  dateTo?: string;
  searchTerm?: string;
}

export interface NewsletterSubscriberFilters extends PaginationOptions {
  status?: NewsletterStatus;
  source?: NewsletterSource;
  interests?: string[];
  dateFrom?: string;
  dateTo?: string;
  searchTerm?: string;
}

// =====================================================
// TIPOS DE ESTADÍSTICAS
// =====================================================
export interface CommunityStats {
  total: number;
  active: number;
  featured: number;
  totalMembers: number;
  categories: Record<string, number>;
  averageMembersPerCommunity: number;
  growthRate?: number;
}

export interface EventStats {
  totalEvents: number;
  upcomingEvents: number;
  pastEvents: number;
  totalRegistrations: number;
  averageAttendance: number;
  byLocation: Record<string, number>;
  byMonth: Record<string, number>;
}

export interface StartupStats {
  total: number;
  featured: number;
  byCategory: Record<string, number>;
  byFundingStage: Record<string, number>;
  totalFunding?: number;
  averageTeamSize?: number;
}

export interface PlatformStatsExtended extends PlatformStats {
  recentGrowthPercentage?: number;
  topCommunities?: Community[];
  recentContacts?: ContactForm[];
  activeEvents?: Event[];
  pendingApplications?: StartupApplication[];
}

// =====================================================
// TIPOS DE FORMULARIOS
// =====================================================
export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  company?: string;
  phone?: string;
  priority?: ContactPriority;
  source?: ContactSource;
  metadata?: Record<string, any>;
}

export interface EventRegistrationFormData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  job_title?: string;
  dietary_restrictions?: string;
  accessibility_needs?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  expectations?: string;
  how_did_you_hear?: string;
  networking_opt_in?: boolean;
  marketing_opt_in?: boolean;
}

export interface StartupApplicationFormData {
  startup_name: string;
  founder_name: string;
  founder_email: string;
  description: string;
  problem_statement: string;
  solution: string;
  target_market: string;
  business_model: string;
  competitive_advantage: string;
  traction: string;
  industry: string;
  location: string;
  funding_stage: FundingStage;
  funding_amount_sought?: number;
  team_size?: number;
  website?: string;
  pitch_deck_url?: string;
  demo_url?: string;
  linkedin_profile?: string;
  github_url?: string;
  co_founders?: string;
  technology_stack?: string;
  additional_info?: string;
  tags?: string[];
}

// =====================================================
// TIPOS DE NOTIFICACIONES
// =====================================================
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
}

// =====================================================
// TIPOS DE SESIÓN Y AUTENTICACIÓN
// =====================================================
export interface UserSession {
  id: string;
  email: string;
  role: UserRoleType;
  permissions?: string[];
  metadata?: Record<string, any>;
  expiresAt?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: UserSession | null;
  loading: boolean;
  error: string | null;
}

// =====================================================
// RE-EXPORTS
// =====================================================
export type { Database };
export type { Json } from './database.types';

// Export de constantes útiles
export const Constants = {
  ApplicationStatus: ['submitted', 'under_review', 'approved', 'rejected', 'waitlisted'] as const,
  ContactPriority: ['low', 'medium', 'high', 'urgent'] as const,
  ContactSource: ['website', 'social', 'referral', 'event', 'other'] as const,
  ContactStatus: ['pending', 'in_progress', 'resolved', 'closed'] as const,
  FundingStage: ['pre_seed', 'seed', 'series_a', 'series_b', 'later', 'bootstrap'] as const,
  LogLevel: ['debug', 'info', 'warn', 'error', 'fatal'] as const,
  NewsletterSource: ['website', 'event', 'social', 'referral', 'import'] as const,
  NewsletterStatus: ['active', 'unsubscribed', 'bounced', 'complained'] as const,
  RegistrationStatus: ['pending', 'confirmed', 'cancelled', 'attended', 'no_show'] as const,
  UserRole: ['user', 'moderator', 'admin', 'super_admin'] as const,
};