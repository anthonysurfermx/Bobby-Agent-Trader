// src/hooks/usePermissions.ts
import { useMemo } from 'react';
import { useAuth } from './useAuth';
import {
  ROLE_PERMISSIONS,
  UserRole,
  Permission,
  roleHasPermission,
  roleHasAnyPermission,
  roleHasAllPermissions
} from '@/types/roles';

export function usePermissions() {
  const { user, getRoles } = useAuth();

  // Obtener el rol principal del usuario
  const userRole = useMemo((): UserRole | null => {
    if (!user) return null;

    const roles = getRoles?.() || [];

    // Prioridad: admin > editor > user
    if (roles.includes('admin')) return UserRole.ADMIN;
    if (roles.includes('editor')) return UserRole.EDITOR;
    if (roles.includes('user') || roles.includes('startup_owner')) return UserRole.USER;

    return null;
  }, [user, getRoles]);

  // Verificar si el usuario tiene un permiso específico
  const hasPermission = useMemo(() => {
    return (permission: Permission): boolean => {
      if (!userRole) return false;
      return roleHasPermission(userRole, permission);
    };
  }, [userRole]);

  // Verificar si el usuario tiene alguno de los permisos
  const hasAnyPermission = useMemo(() => {
    return (permissions: Permission[]): boolean => {
      if (!userRole) return false;
      return roleHasAnyPermission(userRole, permissions);
    };
  }, [userRole]);

  // Verificar si el usuario tiene todos los permisos
  const hasAllPermissions = useMemo(() => {
    return (permissions: Permission[]): boolean => {
      if (!userRole) return false;
      return roleHasAllPermissions(userRole, permissions);
    };
  }, [userRole]);

  // Verificar roles específicos
  const isAdmin = useMemo(() => userRole === UserRole.ADMIN, [userRole]);
  const isEditor = useMemo(() => userRole === UserRole.EDITOR, [userRole]);
  const isUser = useMemo(() => userRole === UserRole.USER, [userRole]);

  // Obtener todos los permisos del usuario
  const permissions = useMemo((): Permission[] => {
    if (!userRole) return [];
    return ROLE_PERMISSIONS[userRole] || [];
  }, [userRole]);

  // Helpers específicos para contenido
  const canApprove = useMemo(() => {
    return (contentType: 'startup' | 'event' | 'community' | 'referent' | 'course'): boolean => {
      const permissionMap: Record<string, Permission> = {
        startup: 'approve_startup',
        event: 'approve_event',
        community: 'approve_community',
        referent: 'approve_referent',
        course: 'approve_course'
      };

      const permission = permissionMap[contentType];
      return permission ? hasPermission(permission) : false;
    };
  }, [hasPermission]);

  const canPropose = useMemo(() => {
    return (contentType: 'startup' | 'event' | 'community' | 'referent' | 'course'): boolean => {
      const permissionMap: Record<string, Permission> = {
        startup: 'propose_startup',
        event: 'propose_event',
        community: 'propose_community',
        referent: 'propose_referent',
        course: 'propose_course'
      };

      const permission = permissionMap[contentType];
      return permission ? hasPermission(permission) : false;
    };
  }, [hasPermission]);

  const canEdit = useMemo(() => {
    return (contentType: 'startup' | 'event' | 'community' | 'referent' | 'course' | 'blog'): boolean => {
      const permissionMap: Record<string, Permission> = {
        startup: 'edit_startup',
        event: 'edit_event',
        community: 'edit_community',
        referent: 'edit_referent',
        course: 'edit_course',
        blog: 'edit_blog'
      };

      const permission = permissionMap[contentType];
      return permission ? hasPermission(permission) : false;
    };
  }, [hasPermission]);

  const canDelete = useMemo(() => {
    return (contentType: 'startup' | 'event' | 'community' | 'referent' | 'course' | 'blog'): boolean => {
      const permissionMap: Record<string, Permission> = {
        startup: 'delete_startup',
        event: 'delete_event',
        community: 'delete_community',
        referent: 'delete_referent',
        course: 'delete_course',
        blog: 'delete_blog'
      };

      const permission = permissionMap[contentType];
      return permission ? hasPermission(permission) : false;
    };
  }, [hasPermission]);

  return {
    // Estado
    role: userRole,
    permissions,

    // Verificadores de permisos
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,

    // Verificadores de roles
    isAdmin,
    isEditor,
    isUser,

    // Helpers específicos
    canApprove,
    canPropose,
    canEdit,
    canDelete
  };
}
