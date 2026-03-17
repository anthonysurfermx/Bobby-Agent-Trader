import { useState } from 'react';

export function ProWaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return;

    setStatus('loading');
    try {
      const resp = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await resp.json();
      if (data.status === 'ok') {
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="text-cyan-400 text-sm font-mono">
        You're on the list. We'll notify you when Pro launches.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-2 justify-center mt-2">
      <input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-black/50 border border-cyan-500/30 text-cyan-300 px-3 py-2 text-sm font-mono rounded-none focus:border-cyan-400 focus:outline-none w-full sm:w-56 placeholder:text-cyan-700"
        disabled={status === 'loading'}
      />
      <button
        type="submit"
        disabled={status === 'loading' || !email.trim()}
        className="bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 px-4 py-2 text-sm font-mono hover:bg-cyan-500/30 transition-colors disabled:opacity-40 whitespace-nowrap"
      >
        {status === 'loading' ? '...' : 'Join Pro Waitlist'}
      </button>
      {status === 'error' && (
        <span className="text-red-400 text-xs">Failed. Try again.</span>
      )}
    </form>
  );
}
