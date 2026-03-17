// src/types/roles.ts
export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  USER = 'user'
}

export type Permission =
  // Dashboard y vistas
  | 'view_dashboard'
  | 'view_analytics'

  // Blog
  | 'create_blog'
  | 'edit_blog'
  | 'publish_blog'
  | 'delete_blog'

  // Startups
  | 'propose_startup'
  | 'approve_startup'
  | 'edit_startup'
  | 'delete_startup'

  // Eventos
  | 'propose_event'
  | 'approve_event'
  | 'edit_event'
  | 'delete_event'

  // Comunidades
  | 'propose_community'
  | 'approve_community'
  | 'edit_community'
  | 'delete_community'

  // Referentes
  | 'propose_referent'
  | 'approve_referent'
  | 'edit_referent'
  | 'delete_referent'

  // Academia
  | 'propose_course'
  | 'approve_course'
  | 'edit_course'
  | 'delete_course'
  | 'manage_academia'

  // Sistema
  | 'manage_users'
  | 'manage_all'
  | 'view_settings';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    // Dashboard
    'view_dashboard',
    'view_analytics',

    // Blog
    'create_blog',
    'edit_blog',
    'publish_blog',
    'delete_blog',

    // Startups
    'propose_startup',
    'approve_startup',
    'edit_startup',
    'delete_startup',

    // Eventos
    'propose_event',
    'approve_event',
    'edit_event',
    'delete_event',

    // Comunidades
    'propose_community',
    'approve_community',
    'edit_community',
    'delete_community',

    // Referentes
    'propose_referent',
    'approve_referent',
    'edit_referent',
    'delete_referent',

    // Academia
    'propose_course',
    'approve_course',
    'edit_course',
    'delete_course',
    'manage_academia',

    // Sistema
    'manage_users',
    'manage_all',
    'view_settings'
  ],

  [UserRole.EDITOR]: [
    // Dashboard
    'view_dashboard',

    // Blog
    'create_blog',
    'edit_blog',
    'publish_blog',

    // Propuestas (puede proponer, no aprobar)
    'propose_startup',
    'propose_event',
    'propose_community',
    'propose_referent',
    'propose_course',

    // Academia
    'manage_academia',

    // Puede editar contenido ya aprobado
    'edit_startup',
    'edit_event',
    'edit_community',
    'edit_referent',
    'edit_course'
  ],

  [UserRole.USER]: [
    // Solo puede hacer propuestas
    'propose_startup',
    'propose_event',
    'propose_community',
    'propose_referent',
    'propose_course',

    // Ver configuración personal
    'view_settings'
  ]
};

// Helper para verificar si un rol tiene un permiso
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) || false;
}

// Helper para verificar si un rol tiene alguno de los permisos
export function roleHasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some(permission => roleHasPermission(role, permission));
}

// Helper para verificar si un rol tiene todos los permisos
export function roleHasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every(permission => roleHasPermission(role, permission));
}
