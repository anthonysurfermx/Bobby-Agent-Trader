// ============================================================
// ArticleAudioPlayer — "Listen to this article" like The Economist
// Edge TTS narration, cached in Supabase Storage
// ============================================================

import { useState, useRef, useEffect } from 'react';

interface ArticleAudioPlayerProps {
  slug: string;
  title: string;
  readingTime?: number; // minutes
}

export function ArticleAudioPlayer({ slug, title, readingTime }: ArticleAudioPlayerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<number | null>(null);

  const audioUrl = `/api/blog-audio?slug=${slug}`;

  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlay = async () => {
    if (status === 'playing') {
      audioRef.current?.pause();
      setStatus('paused');
      if (progressInterval.current) clearInterval(progressInterval.current);
      return;
    }

    if (status === 'paused' && audioRef.current) {
      audioRef.current.play();
      setStatus('playing');
      startProgressTracking();
      return;
    }

    // First play — load audio
    setStatus('loading');

    try {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
      });

      audio.addEventListener('ended', () => {
        setStatus('idle');
        setProgress(0);
        setCurrentTime(0);
        if (progressInterval.current) clearInterval(progressInterval.current);
      });

      audio.addEventListener('error', () => {
        setStatus('error');
      });

      await audio.play();
      setStatus('playing');
      startProgressTracking();
    } catch {
      setStatus('error');
    }
  };

  const startProgressTracking = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = window.setInterval(() => {
      if (audioRef.current) {
        const ct = audioRef.current.currentTime;
        const dur = audioRef.current.duration || 1;
        setCurrentTime(ct);
        setProgress((ct / dur) * 100);
      }
    }, 250);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !audioRef.current.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * audioRef.current.duration;
  };

  const listeningTime = duration > 0 ? Math.ceil(duration / 60) : (readingTime ? Math.ceil(readingTime * 0.8) : null);

  return (
    <div style={{
      background: '#111',
      border: '1px solid #222',
      borderRadius: 8,
      padding: '12px 16px',
      marginBottom: 24,
      fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          disabled={status === 'loading'}
          style={{
            width: 40, height: 40,
            borderRadius: '50%',
            border: '2px solid #00ff88',
            background: status === 'playing' ? '#00ff8822' : 'transparent',
            color: '#00ff88',
            fontSize: 16,
            cursor: status === 'loading' ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {status === 'loading' ? (
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          ) : status === 'playing' ? (
            '⏸'
          ) : (
            '▶'
          )}
        </button>

        {/* Info + progress */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
              {status === 'loading' ? 'Generating audio...' : status === 'error' ? 'Audio unavailable' : 'Listen to this article'}
            </span>
            {listeningTime && (
              <span style={{ color: '#666', fontSize: 11 }}>
                {status === 'playing' || status === 'paused'
                  ? `${formatTime(currentTime)} / ${formatTime(duration)}`
                  : `${listeningTime} min`
                }
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div
            onClick={seek}
            style={{
              width: '100%', height: 4,
              background: '#333',
              borderRadius: 2,
              cursor: status === 'playing' || status === 'paused' ? 'pointer' : 'default',
              position: 'relative',
            }}
          >
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: '#00ff88',
              borderRadius: 2,
              transition: 'width 0.2s',
            }} />
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
