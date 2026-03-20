import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Bug, Lightbulb, Send } from 'lucide-react';

interface FeedbackWidgetProps {
  userEmail?: string;
  walletAddress?: string;
  page?: string;
  context?: Record<string, unknown>;
}

export function FeedbackWidget({ userEmail, walletAddress, page, context }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'bug' | 'feature' | 'general'>('general');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim() || message.trim().length < 3) return;
    setSending(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message, page, context, user_email: userEmail, wallet_address: walletAddress }),
      });
      setSent(true);
      setTimeout(() => { setSent(false); setIsOpen(false); setMessage(''); }, 2000);
    } catch { /* silent */ }
    setSending(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 z-50 w-10 h-10 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-green-400 hover:border-green-500/30 transition-all"
        title="Feedback"
      >
        {isOpen ? <X className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-32 right-4 z-50 w-72 bg-[#171b26] border border-white/[0.06] rounded-lg p-4 shadow-2xl"
          >
            {sent ? (
              <div className="text-center py-6">
                <span className="text-green-400 text-2xl">✓</span>
                <p className="text-white/60 text-xs font-mono mt-2">¡Gracias! Lo revisaremos.</p>
              </div>
            ) : (
              <>
                <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-white/50 mb-3">Feedback</h3>

                {/* Type selector */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setType('bug')}
                    className={`flex items-center gap-1 px-2 py-1 text-[9px] font-mono rounded transition-all ${
                      type === 'bug' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-white/30 border border-white/[0.06] hover:text-white/50'
                    }`}
                  >
                    <Bug className="w-3 h-3" /> Bug
                  </button>
                  <button
                    onClick={() => setType('feature')}
                    className={`flex items-center gap-1 px-2 py-1 text-[9px] font-mono rounded transition-all ${
                      type === 'feature' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'text-white/30 border border-white/[0.06] hover:text-white/50'
                    }`}
                  >
                    <Lightbulb className="w-3 h-3" /> Idea
                  </button>
                  <button
                    onClick={() => setType('general')}
                    className={`flex items-center gap-1 px-2 py-1 text-[9px] font-mono rounded transition-all ${
                      type === 'general' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-white/30 border border-white/[0.06] hover:text-white/50'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" /> General
                  </button>
                </div>

                {/* Message */}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="¿Qué salió mal? ¿Qué mejorarías?"
                  className="w-full h-20 bg-[#0f131e] border border-white/[0.06] rounded p-2 text-xs text-white/80 font-mono placeholder:text-white/20 resize-none focus:outline-none focus:border-green-500/30"
                  maxLength={2000}
                />

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={sending || message.trim().length < 3}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-mono bg-green-500/10 border border-green-500/20 text-green-400 rounded hover:bg-green-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send className="w-3 h-3" />
                  {sending ? 'Enviando...' : 'Enviar'}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
