import { useMemo } from 'react';
import { useAuth } from './useAuth';

export type UserRole = 'admin' | 'editor' | 'user' | null;

interface UserRoleHook {
  role: UserRole;
  isAdmin: boolean;
  isEditor: boolean;
  isUser: boolean;
  canCreateBlogPost: boolean;
  canValidateContent: boolean;
  canProposeContent: boolean;
}

// Lista de usuarios con roles administrativos
const USER_ROLES: Record<string, UserRole> = {
  'anthochavez.ra@gmail.com': 'admin',
  'guillermos22@gmail.com': 'editor',
  'fabiancepeda102@gmail.com': 'editor',
};

export function useUserRole(): UserRoleHook {
  const { user } = useAuth();

  const role = useMemo<UserRole>(() => {
    if (!user?.email) return null;

    const userEmail = user.email.toLowerCase().trim();
    return USER_ROLES[userEmail] || 'user';
  }, [user?.email]);

  const isAdmin = role === 'admin';
  const isEditor = role === 'editor';
  const isUser = role === 'user';

  return {
    role,
    isAdmin,
    isEditor,
    isUser,
    canCreateBlogPost: isAdmin || isEditor,
    canValidateContent: isAdmin,
    canProposeContent: isUser || isEditor,
  };
}
