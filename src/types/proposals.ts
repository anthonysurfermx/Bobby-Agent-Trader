// src/types/proposals.ts

// Tipos de contenido que pueden ser propuestos
export type ContentType = 'startup' | 'event' | 'community' | 'referent' | 'blog' | 'course' | 'job';

// Estados de una propuesta
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'draft';

// Categorías de referentes
export type ReferentCategory =
  | 'programadores'
  | 'abogados'
  | 'financieros'
  | 'diseñadores'
  | 'marketers'
  | 'otros';

// Perfil de usuario (extendido de Supabase)
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: 'admin' | 'editor' | 'user';
  bio?: string;
  twitter_url?: string;
  linkedin_url?: string;
  github_url?: string;
  website_url?: string;
  is_active: boolean;
  email_verified: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

// Propuesta genérica
export interface Proposal {
  id: string;
  content_type: ContentType;
  status: ProposalStatus;
  proposed_by: string;
  reviewed_by?: string;
  content_data: Record<string, any>;
  review_notes?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;

  // Relaciones (cuando se hace un SELECT con join)
  proposed_by_profile?: UserProfile;
  reviewed_by_profile?: UserProfile;
}

// Startup aprobada
export interface Startup {
  id: string;
  proposal_id?: string;
  name: string;
  slug: string;
  description: string;
  short_description?: string;
  logo_url?: string;
  cover_image_url?: string;
  category: string;
  tags: string[];
  country: string;
  city?: string;
  website_url?: string;
  twitter_url?: string;
  linkedin_url?: string;
  github_url?: string;
  funding_stage?: string;
  total_funding?: number;
  employee_count?: number;
  founded_year?: number;
  meta_title?: string;
  meta_description?: string;
  is_featured: boolean;
  is_active: boolean;
  view_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Evento aprobado
export interface Event {
  id: string;
  proposal_id?: string;
  title: string;
  slug: string;
  description: string;
  short_description?: string;
  cover_image_url?: string;
  event_type?: string; // 'conference', 'meetup', 'workshop', 'webinar'
  format?: string; // 'presencial', 'virtual', 'híbrido'
  start_date: string;
  end_date?: string;
  timezone: string;
  location?: string;
  venue_name?: string;
  address?: string;
  city?: string;
  country: string;
  registration_url?: string;
  website_url?: string;
  streaming_url?: string;
  organizer_name?: string;
  organizer_logo_url?: string;
  sponsors: string[];
  max_attendees?: number;
  current_attendees: number;
  is_free: boolean;
  price_info?: string;
  tags: string[];
  topics: string[];
  is_featured: boolean;
  is_active: boolean;
  view_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Comunidad aprobada
export interface Community {
  id: string;
  proposal_id?: string;
  name: string;
  slug: string;
  description: string;
  short_description?: string;
  logo_url?: string;
  cover_image_url?: string;
  community_type?: string; // 'dao', 'telegram', 'discord', 'meetup', 'otros'
  focus_area?: string; // 'defi', 'nft', 'desarrollo', 'inversión', 'educación'
  main_url?: string;
  telegram_url?: string;
  discord_url?: string;
  twitter_url?: string;
  github_url?: string;
  member_count?: number;
  is_verified: boolean;
  city?: string;
  country: string;
  tags: string[];
  is_featured: boolean;
  is_active: boolean;
  view_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Referente aprobado
export interface Referent {
  id: string;
  proposal_id?: string;
  name: string;
  slug: string;
  description: string;
  avatar_url?: string;
  category: ReferentCategory;
  twitter_url?: string;
  github_url?: string;
  linkedin_url?: string;
  website_url?: string;
  company?: string;
  position?: string;
  location?: string;
  expertise_areas: string[];
  is_active: boolean;
  is_verified: boolean;
  view_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Blog Post
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  cover_image_url?: string;
  author_id: string;
  category?: string;
  tags: string[];
  meta_title?: string;
  meta_description?: string;
  status: ProposalStatus;
  published_at?: string;
  view_count: number;
  read_time_minutes?: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;

  // Relación
  author?: UserProfile;
}

// Curso (Academia)
export interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  short_description?: string;
  cover_image_url?: string;
  syllabus?: Record<string, any>;
  learning_outcomes: string[];
  prerequisites: string[];
  instructor_id?: string;
  instructor_name?: string;
  difficulty_level?: string; // 'principiante', 'intermedio', 'avanzado'
  duration_hours?: number;
  language: string;
  is_free: boolean;
  price?: number;
  currency: string;
  enrollment_url?: string;
  course_url?: string;
  category?: string;
  tags: string[];
  enrolled_count: number;
  rating?: number;
  review_count: number;
  is_featured: boolean;
  is_active: boolean;
  status: ProposalStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Relación
  instructor?: UserProfile;
}

// Notificación
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: string; // 'proposal_approved', 'proposal_rejected', 'new_proposal', etc.
  related_type?: ContentType;
  related_id?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

// Activity Log (Auditoría)
export interface ActivityLog {
  id: string;
  user_id?: string;
  action: string; // 'create', 'update', 'delete', 'approve', 'reject'
  entity_type?: ContentType;
  entity_id?: string;
  old_data?: Record<string, any>;
  new_data?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;

  // Relación
  user?: UserProfile;
}

// Tipos para formularios de propuesta
export interface StartupProposalData {
  name: string;
  description: string;
  short_description?: string;
  logo_url?: string;
  cover_image_url?: string;
  category: string;
  tags?: string[];
  country?: string;
  city?: string;
  website_url?: string;
  twitter_url?: string;
  linkedin_url?: string;
  github_url?: string;
  funding_stage?: string;
  total_funding?: number;
  employee_count?: number;
  founded_year?: number;
}

export interface EventProposalData {
  title: string;
  description: string;
  short_description?: string;
  cover_image_url?: string;
  event_type?: string;
  format?: string;
  start_date: string;
  end_date?: string;
  timezone?: string;
  location?: string;
  venue_name?: string;
  address?: string;
  city?: string;
  country?: string;
  registration_url?: string;
  website_url?: string;
  streaming_url?: string;
  organizer_name?: string;
  organizer_logo_url?: string;
  sponsors?: string[];
  max_attendees?: number;
  is_free?: boolean;
  price_info?: string;
  tags?: string[];
  topics?: string[];
}

export interface CommunityProposalData {
  name: string;
  description: string;
  short_description?: string;
  logo_url?: string;
  cover_image_url?: string;
  community_type?: string;
  focus_area?: string;
  main_url?: string;
  telegram_url?: string;
  discord_url?: string;
  twitter_url?: string;
  github_url?: string;
  member_count?: number;
  city?: string;
  country?: string;
  tags?: string[];
}

export interface ReferentProposalData {
  name: string;
  description: string;
  avatar_url?: string;
  category: ReferentCategory;
  twitter_url?: string;
  github_url?: string;
  linkedin_url?: string;
  website_url?: string;
  company?: string;
  position?: string;
  location?: string;
  expertise_areas?: string[];
}

export interface CourseProposalData {
  title: string;
  description: string;
  short_description?: string;
  cover_image_url?: string;
  syllabus?: Record<string, any>;
  learning_outcomes?: string[];
  prerequisites?: string[];
  instructor_name?: string;
  difficulty_level?: string;
  duration_hours?: number;
  language?: string;
  is_free?: boolean;
  price?: number;
  currency?: string;
  enrollment_url?: string;
  course_url?: string;
  category?: string;
  tags?: string[];
}

export interface JobProposalData {
  title: string;
  company: string;
  company_logo?: string;
  description: string;
  location?: string;
  job_type?: 'remote' | 'hybrid' | 'onsite';
  category?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  experience_level?: string;
  requirements?: string;
  benefits?: string;
  tags?: string[];
  apply_url?: string;
  apply_email?: string;
}

// Tipo union para todos los datos de propuestas
export type ProposalData =
  | StartupProposalData
  | EventProposalData
  | CommunityProposalData
  | ReferentProposalData
  | CourseProposalData
  | JobProposalData;
