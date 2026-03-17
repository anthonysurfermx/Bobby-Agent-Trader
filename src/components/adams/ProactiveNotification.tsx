import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SB_URL = import.meta.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

const POLL_INTERVAL = 30_000; // 30s

interface ProactiveAlert {
  id: string;
  message: string;
  created_at: string;
  advisor_name: string;
}

const OPEN_CHAT_LABEL: Record<string, string> = { es: 'Abrir chat', en: 'Open chat', pt: 'Abrir chat' };

export function ProactiveNotification({ walletAddress }: { walletAddress?: string }) {
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // Read user language preference
  const lang = (() => {
    try { const p = JSON.parse(localStorage.getItem('bobby_profile') || '{}'); return p.language || 'en'; } catch { return 'en'; }
  })();

  const fetchUnread = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/agent_messages?wallet_address=eq.${walletAddress}&read=eq.false&order=created_at.desc&limit=3`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setAlerts(data.filter((a: ProactiveAlert) => !dismissed.has(a.id)));
      }
    } catch { /* silent */ }
  }, [walletAddress, dismissed]);

  // Poll every 30s
  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const markRead = async (id: string) => {
    setDismissed(prev => new Set(prev).add(id));
    setAlerts(prev => prev.filter(a => a.id !== id));
    try {
      await fetch(`${SB_URL}/rest/v1/agent_messages?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ read: true }),
      });
    } catch { /* silent */ }
  };

  const goToChat = (id: string) => {
    markRead(id);
    navigate('/agentic-world/bobby');
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[90] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {alerts.map(alert => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="bg-neutral-950 border border-green-500/30 shadow-lg shadow-green-500/5 p-4 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                  <Bell className="w-3 h-3 text-green-400" />
                </div>
                <span className="text-[11px] font-bold font-mono text-green-400 tracking-wider">
                  {(alert.advisor_name || 'BOBBY').toUpperCase()}
                </span>
              </div>
              <button onClick={() => markRead(alert.id)} className="text-white/20 hover:text-white/60 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[12px] text-green-200/80 font-mono leading-relaxed line-clamp-3">
              {alert.message.slice(0, 200)}{alert.message.length > 200 ? '...' : ''}
            </p>

            <button
              onClick={() => goToChat(alert.id)}
              className="flex items-center gap-1.5 text-[10px] text-green-400/70 hover:text-green-400 transition-colors font-mono"
            >
              {OPEN_CHAT_LABEL[lang] || OPEN_CHAT_LABEL.en} <ArrowRight className="w-3 h-3" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
