// src/components/auth/OAuthButtons.tsx
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Github, Chrome } from 'lucide-react';

export default function OAuthButtons() {
  const [loading, setLoading] = useState<'google' | 'github' | null>(null);

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    try {
      setLoading(provider);
      
      // Determinar URL de redirección - IMPORTANTE: usar /auth/callback
      const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const redirectTo = `${siteUrl}/auth/callback`;
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
      
      // Supabase manejará la redirección automáticamente
      
    } catch (error: any) {
      console.error(`Error con ${provider}:`, error);
      toast.error(`Error al iniciar sesión con ${provider}`);
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Separador */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-gray-300 dark:border-gray-600" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">
            O continúa con
          </span>
        </div>
      </div>

      {/* Botones OAuth */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleOAuthLogin('google')}
          disabled={loading !== null}
          className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === 'google' ? (
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Chrome className="w-5 h-5" />
          )}
          <span className="font-medium">Google</span>
        </button>

        <button
          type="button"
          onClick={() => handleOAuthLogin('github')}
          disabled={loading !== null}
          className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === 'github' ? (
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Github className="w-5 h-5" />
          )}
          <span className="font-medium">GitHub</span>
        </button>
      </div>
    </div>
  );
}