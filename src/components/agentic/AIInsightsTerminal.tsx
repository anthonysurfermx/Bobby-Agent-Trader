import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface AIInsightsTerminalProps {
  context: string;
  data: Record<string, any>;
  commandLabel?: string;
  buttonLabel?: string;
  className?: string;
}

// Highlight numbers, percentages, dollar amounts, and keywords
function highlightLine(line: string): JSX.Element {
  // Remove leading ">" if present
  const clean = line.startsWith('>') ? line.slice(1).trimStart() : line;

  // Split by patterns and colorize
  const parts = clean.split(/(\$[\d,.]+[KMB]?|[\d,.]+%|\b(?:AGENT|BOT|HUMAN|MIXED|LIKELY|PROXY|VAULT|HIGH|LOW|SNIPER|WHALE|MARKET.MAKER|HYBRID|MOMENTUM|LATENCY|SPREAD|DIRECTIONAL|BIMODAL)\b)/gi);

  return (
    <span>
      <span className="text-cyan-500 mr-1">{'>'}</span>
      {parts.map((part, i) => {
        // Dollar amounts
        if (/^\$[\d,.]+[KMB]?$/i.test(part)) {
          return <span key={i} className="text-amber-400 font-bold">{part}</span>;
        }
        // Percentages
        if (/^[\d,.]+%$/.test(part)) {
          const num = parseFloat(part);
          const color = num > 50 ? 'text-green-400' : num < 0 ? 'text-red-400' : 'text-amber-400';
          return <span key={i} className={`${color} font-bold`}>{part}</span>;
        }
        // Keywords
        if (/^(AGENT|BOT|LIKELY|PROXY|VAULT)$/i.test(part)) {
          return <span key={i} className="text-red-400 font-bold">{part}</span>;
        }
        if (/^HUMAN$/i.test(part)) {
          return <span key={i} className="text-green-400 font-bold">{part}</span>;
        }
        if (/^(MIXED|HIGH|LOW|SNIPER|WHALE|MOMENTUM|LATENCY|DIRECTIONAL)$/i.test(part)) {
          return <span key={i} className="text-amber-400 font-bold">{part}</span>;
        }
        if (/^(MARKET.MAKER|HYBRID|SPREAD|BIMODAL)$/i.test(part)) {
          return <span key={i} className="text-violet-400 font-bold">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export function AIInsightsTerminal({
  context,
  data,
  commandLabel,
  buttonLabel = 'EXPLAIN WITH AI',
  className = '',
}: AIInsightsTerminalProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [lines, setLines] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Sync language with i18n state
  const language = i18n.language?.startsWith('es') ? 'es' : 'en' as const;
  const toggleLanguage = () => {
    i18n.changeLanguage(language === 'en' ? 'es' : 'en');
  };
  const terminalRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  const runExplanation = useCallback(async () => {
    setStreaming(true);
    setError(null);
    setLines([]);
    setTags([]);
    setStarted(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, data, language }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const eventLines = buffer.split('\n');
        buffer = eventLines.pop() || '';

        for (const eventLine of eventLines) {
          if (!eventLine.startsWith('data: ')) continue;
          const payload = eventLine.slice(6);

          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              setError(parsed.error);
              break;
            }
            if (parsed.text) {
              fullText += parsed.text;

              // Split into lines by newlines
              const textLines = fullText.split('\n');
              // Keep incomplete last line in buffer, show complete lines
              const completeLines = textLines.slice(0, -1).filter((l: string) => l.trim());
              const partial = textLines[textLines.length - 1];

              // Extract tags if present
              const tagLine = completeLines.find((l: string) => l.replace(/^>\s*/, '').startsWith('TAGS:'));
              if (tagLine) {
                const tagStr = tagLine.replace(/^>\s*/, '').replace('TAGS:', '').trim();
                setTags(tagStr.split(',').map((t: string) => t.trim()).filter(Boolean));
              }

              // Show all non-tag lines + partial
              const displayLines = completeLines.filter((l: string) => !l.replace(/^>\s*/, '').startsWith('TAGS:'));
              if (partial.trim()) {
                setLines([...displayLines, partial]);
              } else {
                setLines(displayLines);
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to connect');
      }
    } finally {
      setStreaming(false);
    }
  }, [context, data, language]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const cmd = commandLabel || `openclaw --explain ${context}`;

  const handleClick = () => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }
    runExplanation();
  };

  // Not started yet: show button
  if (!started) {
    return (
      <div className={`font-mono ${className}`}>
        <div className="flex items-center gap-3">
          <div className="relative group">
            {/* Animated rotating border glow */}
            <div className="absolute -inset-[2px] rounded-sm bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 opacity-75 blur-[3px] group-hover:opacity-100 transition-opacity animate-glow-spin" />
            <button
              onClick={handleClick}
              className="relative flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-amber-900/80 to-amber-800/80 border border-amber-400/60 text-amber-300 hover:text-amber-100 text-sm font-bold tracking-wide transition-all hover:scale-[1.02]"
            >
              <Sparkles className="w-4 h-4" />
              {buttonLabel}
            </button>
          </div>
          <button
            onClick={toggleLanguage}
            className="px-2 py-3 border border-cyan-500/20 text-cyan-400/60 hover:text-cyan-400 text-[10px] transition-colors"
          >
            {language.toUpperCase()}
          </button>
        </div>

        {/* Login prompt */}
        {showLoginPrompt && (
          <div className="mt-3 border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-400/80" />
              <span className="text-amber-400/80 text-[11px]">
                {language === 'es' ? 'Inicia sesion para usar el AI Analyzer' : 'Sign in to use the AI Analyzer'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search))}
                className="text-[10px] px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors"
              >
                {language === 'es' ? 'INICIAR SESION' : 'SIGN IN'}
              </button>
              <button
                onClick={() => navigate('/register?redirect=' + encodeURIComponent(window.location.pathname + window.location.search))}
                className="text-[10px] px-3 py-1.5 border border-cyan-500/30 text-cyan-400/60 hover:text-cyan-400 transition-colors"
              >
                {language === 'es' ? 'CREAR CUENTA' : 'SIGN UP'}
              </button>
            </div>
          </div>
        )}

        {/* Glow animation */}
        <style>{`
          @keyframes glow-spin {
            0% { filter: hue-rotate(0deg) blur(3px); }
            50% { filter: hue-rotate(15deg) blur(4px); }
            100% { filter: hue-rotate(0deg) blur(3px); }
          }
          .animate-glow-spin {
            animation: glow-spin 3s ease-in-out infinite;
          }
        `}</style>
      </div>
    );
  }

  // Terminal view
  return (
    <div className={`border border-cyan-500/30 bg-black/60 overflow-hidden font-mono ${className}`}>
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <div className="w-2 h-2 rounded-full bg-green-500/60" />
        </div>
        <span className="text-cyan-400 text-[10px] ml-1">{cmd}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleLanguage}
            className="px-1.5 py-0.5 text-[9px] border border-cyan-500/20 text-cyan-400/40 hover:text-cyan-400 transition-colors"
          >
            {language.toUpperCase()}
          </button>
          {streaming ? (
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          ) : (
            <button
              onClick={runExplanation}
              className="text-[10px] text-cyan-400/40 hover:text-cyan-400 transition-colors"
            >
              re-run
            </button>
          )}
        </div>
      </div>

      {/* Terminal body */}
      <div
        ref={terminalRef}
        className="px-3 py-3 max-h-[300px] overflow-y-auto space-y-1"
      >
        {lines.length === 0 && streaming && (
          <div className="text-cyan-400/60 text-[11px] animate-pulse">
            {'>'} Connecting to AI analyst...
          </div>
        )}

        {lines.map((line, i) => (
          <div
            key={i}
            className="text-[11px] text-cyan-300 leading-relaxed"
            style={{ animation: `fadeIn 0.15s ease-out ${i * 0.03}s both` }}
          >
            {highlightLine(line)}
          </div>
        ))}

        {streaming && lines.length > 0 && (
          <span className="inline-block w-1.5 h-3 bg-cyan-400 animate-pulse" />
        )}

        {error && (
          <div className="text-red-400 text-[11px] mt-2">
            {'>'} ERROR: {error}
          </div>
        )}
      </div>

      {/* Tags footer */}
      {tags.length > 0 && !streaming && (
        <div className="px-3 py-2 border-t border-cyan-500/15 flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span
              key={i}
              className="text-[9px] px-2 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* CSS animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
