import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ShortRedirect() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) { navigate('/', { replace: true }); return; }

    const resolve = async () => {
      const db = supabase as any;
      const { data, error: err } = await db
        .from('short_urls')
        .select('target_path, click_count')
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle();

      if (err || !data) {
        setError(true);
        setTimeout(() => navigate('/', { replace: true }), 2000);
        return;
      }

      // Fire-and-forget click count increment (silently fails if no UPDATE policy)
      db.from('short_urls').update({ click_count: ((data as any).click_count || 0) + 1 }).eq('code', code).then(() => {});

      // Redirect (only allow same-origin or relative paths)
      const target = data.target_path;
      if (target.startsWith('/')) {
        navigate(target, { replace: true });
      } else if (target.startsWith('http')) {
        try {
          const url = new URL(target);
          const allowed = ['defimexico.org', 'www.defimexico.org'];
          if (allowed.includes(url.hostname)) {
            window.location.replace(target);
          } else {
            setError(true);
            setTimeout(() => navigate('/', { replace: true }), 2000);
          }
        } catch {
          setError(true);
          setTimeout(() => navigate('/', { replace: true }), 2000);
        }
      } else {
        navigate(target, { replace: true });
      }
    };

    resolve();
  }, [code, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        {error ? (
          <>
            <p className="text-lg font-medium text-foreground">Link no encontrado</p>
            <p className="text-sm text-muted-foreground">Redirigiendo al inicio...</p>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Redirigiendo...</p>
          </>
        )}
      </div>
    </div>
  );
}
