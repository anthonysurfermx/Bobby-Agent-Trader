import { useCallback, useEffect, useRef, useState } from 'react';

const SOUND_BASE_PATH = '/sounds/mercado-lp';
const MUTE_STORAGE_KEY = 'mercado_lp_sound_muted';

export type MercadoSoundType =
  | 'home'
  | 'swap'
  | 'add-liquidity'
  | 'remove-liquidity'
  | 'create-token'
  | 'bid'
  | 'level-up'
  | 'badge'
  | 'xp-gain'
  | 'error'
  | 'success'
  | 'click';

interface UseMercadoSoundOptions {
  volume?: number;
  loop?: boolean;
  maxPlays?: number; // Limit number of times sound can play
}

interface UseMercadoSoundReturn {
  play: () => void;
  stop: () => void;
  isPlaying: boolean;
}

export const useMercadoSound = (
  sound: MercadoSoundType,
  options: UseMercadoSoundOptions = {}
): UseMercadoSoundReturn => {
  const { volume = 0.5, loop = false, maxPlays } = options;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playCountRef = useRef(0);
  const isPlayingRef = useRef(false);

  // Initialize audio element
  useEffect(() => {
    const soundMap: Record<MercadoSoundType, string> = {
      home: 'Home.wav',
      swap: 'Swap.wav',
      'add-liquidity': 'AddLiquidity.wav',
      'remove-liquidity': 'RemoveLiquidity.wav',
      'create-token': 'CreateToken.wav',
      bid: 'Bid.wav',
      'level-up': 'LevelUp.wav',
      badge: 'Badge.wav',
      'xp-gain': 'XPGain.wav',
      error: 'Error.wav',
      success: 'Success.wav',
      click: 'Click.wav',
    };

    const fileName = soundMap[sound];
    const audio = new Audio(`${SOUND_BASE_PATH}/${fileName}`);
    audio.volume = volume;
    audio.loop = loop;

    audio.addEventListener('ended', () => {
      isPlayingRef.current = false;

      // Check if muted before replaying
      const currentlyMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
      if (currentlyMuted) return;

      // If loop is false but we have maxPlays, replay if under limit
      if (!loop && maxPlays && playCountRef.current < maxPlays) {
        playCountRef.current += 1;
        audio.currentTime = 0;
        audio.play().catch(() => {});
        isPlayingRef.current = true;
      }
    });

    audio.addEventListener('error', (e) => {
      console.warn(`Failed to load sound: ${fileName}`, e);
    });

    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [sound, volume, loop, maxPlays]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Check if muted globally
    const isMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    if (isMuted) return;

    // Check if we've reached max plays
    if (maxPlays && playCountRef.current >= maxPlays) {
      return;
    }

    // Reset if already playing
    if (isPlayingRef.current) {
      audio.currentTime = 0;
    } else {
      playCountRef.current = 1; // First play counts as 1
    }

    audio.play()
      .then(() => {
        isPlayingRef.current = true;
      })
      .catch((error) => {
        // Autoplay might be blocked - that's okay
        console.debug('Sound playback blocked:', error.message);
      });
  }, [maxPlays]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    console.log('🛑 Stopping audio');
    audio.pause();
    audio.currentTime = 0;
    isPlayingRef.current = false;
  }, []);

  return {
    play,
    stop,
    isPlaying: isPlayingRef.current,
  };
};

// Storage key for sound rotation queue
const SOUND_QUEUE_KEY = 'mercado_lp_sound_queue';

// Hook specifically for the Market Plaza ambient sound with random variants
export const useMarketPlazaAmbient = () => {
  const [variant] = useState(() => {
    const allVariants = ['Home.wav', 'Home_2.wav', 'Home_3.wav', 'Home_4.wav', 'Home_5.wav'];

    // Get the queue from localStorage
    let queue: string[] = [];
    try {
      const stored = localStorage.getItem(SOUND_QUEUE_KEY);
      if (stored) {
        queue = JSON.parse(stored);
      }
    } catch {
      queue = [];
    }

    // If queue is empty or invalid, create a new shuffled queue
    if (!queue || queue.length === 0) {
      // Shuffle all variants (Fisher-Yates)
      queue = [...allVariants];
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      console.log('🔀 New shuffled queue:', queue);
    }

    // Take the first one from the queue
    const selected = queue.shift()!;

    // Save the remaining queue
    localStorage.setItem(SOUND_QUEUE_KEY, JSON.stringify(queue));

    console.log('🎲 Playing variant:', selected, '| Remaining in queue:', queue.length);
    return selected;
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    const audio = new Audio(`${SOUND_BASE_PATH}/${variant}`);
    audio.volume = 0.3;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [variant]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    console.log('🎵 Attempting to play:', {
      hasAudio: !!audio,
      hasPlayed: hasPlayedRef.current,
      variant
    });

    if (!audio || hasPlayedRef.current) return;

    const isMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    console.log('🔇 Mute status:', isMuted);
    if (isMuted) return;

    hasPlayedRef.current = true;
    console.log('▶️ Playing sound:', variant);
    audio.play().catch((error) => {
      console.debug('Sound playback blocked:', error.message);
    });
  }, [variant]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
  }, []);

  return { play, stop };
};

// Global mute state hook
export const useSoundMute = () => {
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  });

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newValue = !prev;
      console.log('🔊 Toggle mute:', newValue ? 'MUTED' : 'UNMUTED');
      localStorage.setItem(MUTE_STORAGE_KEY, String(newValue));
      return newValue;
    });
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    setIsMuted(muted);
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
  }, []);

  return { isMuted, toggleMute, setMuted };
};
