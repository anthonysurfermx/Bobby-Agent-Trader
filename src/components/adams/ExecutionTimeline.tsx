import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, MessageSquare, CheckCircle2, Zap, AlertTriangle, Activity } from 'lucide-react';

interface ChatMsg {
  id: string;
  role: 'user' | 'advisor';
  text: string;
  timestamp: number;
  isLive?: boolean;
}

interface TimelineEvent {
  id: string;
  type: 'SCAN' | 'DEBATE' | 'EXECUTE' | 'COMMIT' | 'REJECT';
  label: string;
  timestamp: number;
  highlight?: string;
  icon: React.ReactNode;
  color: string;
}

export function ExecutionTimeline({ messages }: { messages: ChatMsg[] }) {
  // Derive events purely from chat history to stay perfectly honest
  const events = useMemo(() => {
    const extracted: TimelineEvent[] = [];
    
    // We iterate backwards to get the most recent ones
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'advisor') continue;
      
      const txt = msg.text.toLowerCase();
      
      // 1. Commit / Resolve Event
      if (txt.includes('commit') && txt.includes('x layer') && txt.includes('tx')) {
        extracted.push({
          id: msg.id + '-commit',
          type: 'COMMIT',
          label: 'On-chain Record Committed',
          highlight: 'X Layer',
          timestamp: msg.timestamp + 2000,
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          color: 'text-blue-400 bg-blue-500/10 border-blue-500/20'
        });
      }
      
      // 2. Execute Event
      if (txt.includes('✅ operación confirmada') || txt.includes('orden enviada') || txt.includes('position opened')) {
        const symbolMatch = msg.text.match(/\b(BTC|ETH|SOL|OKB|NVDA|SPY)\b/i);
        const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : 'ASSET';
        
        extracted.push({
          id: msg.id + '-exec',
          type: 'EXECUTE',
          label: `Trade Executed`,
          highlight: symbol,
          timestamp: msg.timestamp + 1000,
          icon: <Zap className="w-3.5 h-3.5" />,
          color: 'text-green-400 bg-green-500/10 border-green-500/20'
        });
      }
      
      // 3. Reject Event
      if (txt.includes('not executing') || txt.includes('no ejecut') || (txt.includes('conviction') && (txt.includes('too low') || txt.includes('muy baja') || txt.includes('rechazado')))) {
        extracted.push({
          id: msg.id + '-reject',
          type: 'REJECT',
          label: `Trade Rejected`,
          highlight: 'Low Conviction',
          timestamp: msg.timestamp,
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          color: 'text-red-400 bg-red-500/10 border-red-500/20'
        });
      }

      // 4. Debate Event (If it contains Alpha / Red Team sections)
      if (msg.text.includes('ALPHA HUNTER') || msg.text.includes('RED TEAM')) {
        extracted.push({
          id: msg.id + '-debate',
          type: 'DEBATE',
          label: 'AI Agents Debate',
          highlight: '3 Agents',
          timestamp: msg.timestamp - 2000, // Happened before execution
          icon: <MessageSquare className="w-3.5 h-3.5" />,
          color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
        });
        
        // Scan always precedes a debate
        extracted.push({
          id: msg.id + '-scan',
          type: 'SCAN',
          label: 'Market Scan Completed',
          highlight: 'Polymarket/OKX',
          timestamp: msg.timestamp - 5000,
          icon: <Search className="w-3.5 h-3.5" />,
          color: 'text-purple-400 bg-purple-500/10 border-purple-500/20'
        });
      }
      
      if (extracted.length >= 5) break;
    }
    
    // Return top 5, sorted by newest first
    return extracted.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  }, [messages]);

  if (events.length === 0) return null;

  return (
    <div className="hidden lg:block w-64 xl:w-72 flex-shrink-0 border-l border-white/[0.04] bg-white/[0.01] backdrop-blur-sm p-4 pt-6 h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-6 text-white/50 px-2">
        <Activity className="w-4 h-4" />
        <h2 className="font-mono text-[11px] uppercase tracking-[2px]">Execution Timeline</h2>
      </div>
      
      <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-[1px] before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
        {events.map((event, i) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
          >
            {/* Timeline node */}
            <div className={`flex items-center justify-center w-6 h-6 rounded-full border shadow-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 absolute -left-3 ${event.color}`}>
              {event.icon}
            </div>
            
            {/* Content card */}
            <div className={`w-[calc(100%-2rem)] bg-white/[0.02] border border-white/[0.06] p-3 rounded shadow-sm flex flex-col gap-1 ml-6 hover:border-white/20 transition-colors`}>
              <div className="flex justify-between items-center">
                <span className="font-mono text-[10px] uppercase font-bold text-white/70">{event.type}</span>
                <time className="font-mono text-[9px] text-white/30">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
              <div className="text-white/90 text-[12px] font-sans leading-tight">
                {event.label}
              </div>
              {event.highlight && (
                <div className="mt-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono ${event.color.replace('border-', '')}`}>
                    {event.highlight}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
