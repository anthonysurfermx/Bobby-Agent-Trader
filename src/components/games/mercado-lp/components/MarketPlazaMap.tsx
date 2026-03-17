import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GameLevel } from '@/components/games/mercado-lp/types/game';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useMarketPlazaAmbient, useSoundMute } from '@/hooks/useMercadoSound';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import {
  PixelStore,
  PixelMango,
  PixelLemon,
  PixelWatermelon,
  PixelBanana,
  PixelChevronLeft,
  PixelVolume,
  PixelMute,
  PixelX,
  PixelInfo,
} from './icons/GameIcons';

// Componente de efecto typewriter para texto
const TypewriterText = ({ text, speed = 30, onComplete }: { text: string; speed?: number; onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setDisplayedText('');
    setIsComplete(false);
    let index = 0;

    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
        setIsComplete(true);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <span>
      {displayedText}
      {!isComplete && <span className="animate-pulse">▌</span>}
    </span>
  );
};

// Helper para resolver URLs de assets evitando 404 o bases inválidas
const resolveAsset = (path: string) => {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const base = import.meta.env.BASE_URL || '/';
    // Asegura base absoluta
    const baseUrl = new URL(base, origin || 'http://localhost');
    return new URL(path, baseUrl).href;
  } catch {
    return path.startsWith('/') ? path : `/${path}`;
  }
};

// Preload de imagen para carga suave
const MAP_IMAGE_URL = resolveAsset('market-plaza.png');
const DEFAULT_PLAYER_IMAGE_URL = resolveAsset('player.png');

// Cache global para evitar recargas
let mapImageCache: HTMLImageElement | null = null;
let playerImageCache: Record<string, HTMLImageElement> = {};

const preloadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

interface MarketPlazaMapProps {
  open: boolean;
  onClose: () => void;
  onEnterLevel: (level: GameLevel) => void;
  autoOpenLevel?: GameLevel | null;
  onAutoOpenConsumed?: () => void;
  playerAvatar?: string;
}

type StallZone = {
  id: GameLevel;
  label: string;
  area: { left: number; top: number; width: number; height: number }; // percentages
};

const stallZones: StallZone[] = [
  {
    id: 1,
    label: 'Doña Jose',
    area: { left: 36, top: 56, width: 10, height: 18 }, // señora con chiles a la izquierda
  },
  {
    id: 2,
    label: 'Don Fede',
    area: { left: 52, top: 55, width: 9, height: 18 }, // puesto de plátanos en el centro
  },
  {
    id: 3,
    label: 'Doña Mari',
    area: { left: 57, top: 76, width: 9, height: 16 }, // señor en aguacates
  },
  {
    id: 4,
    label: 'Don Luis',
    area: { left: 72, top: 58, width: 10, height: 18 }, // puesto a la derecha
  },
];

const stallDialog: Record<GameLevel, { title: string; message: string; subtitle: string }> = {
  1: { title: 'mercadoLP.map.dialog.1.title', subtitle: 'mercadoLP.map.dialog.1.subtitle', message: 'mercadoLP.map.dialog.1.message' },
  2: { title: 'mercadoLP.map.dialog.2.title', subtitle: 'mercadoLP.map.dialog.2.subtitle', message: 'mercadoLP.map.dialog.2.message' },
  3: { title: 'mercadoLP.map.dialog.3.title', subtitle: 'mercadoLP.map.dialog.3.subtitle', message: 'mercadoLP.map.dialog.3.message' },
  4: { title: 'mercadoLP.map.dialog.4.title', subtitle: 'mercadoLP.map.dialog.4.subtitle', message: 'mercadoLP.map.dialog.4.message' },
};

export const MarketPlazaMap = ({
  open,
  onClose,
  onEnterLevel,
  autoOpenLevel = null,
  onAutoOpenConsumed,
  playerAvatar = DEFAULT_PLAYER_IMAGE_URL,
}: MarketPlazaMapProps) => {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(false);
  const [selected, setSelected] = useState<GameLevel | null>(null);
  const [dogPos, setDogPos] = useState<{ x: number; y: number }>({ x: 50, y: 70 });
  const [dialogZone, setDialogZone] = useState<StallZone | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const { play: playAmbientSound, stop: stopAmbientSound } = useMarketPlazaAmbient();
  const { isMuted, toggleMute } = useSoundMute();

  // Preload de imágenes cuando el mapa se abre
  useEffect(() => {
    if (!open) return;

    // Detectar mobile (simple breakpoint)
    const detectMobile = () => setIsMobile(window.innerWidth < 768);
    detectMobile();
    window.addEventListener('resize', detectMobile);

    const avatarSrc = playerAvatar || DEFAULT_PLAYER_IMAGE_URL;

    // Si ya están en cache, mostrar inmediatamente
    if (mapImageCache && playerImageCache[avatarSrc]) {
      setImagesLoaded(true);
      setLoadingProgress(100);
      return;
    }

    let cancelled = false;

    const loadImages = async () => {
      try {
        setLoadingProgress(20);

        // Cargar ambas imágenes en paralelo
        const [mapImg, playerImg] = await Promise.all([
          mapImageCache || preloadImage(MAP_IMAGE_URL),
          playerImageCache[avatarSrc] || preloadImage(avatarSrc)
        ]);

        if (cancelled) return;

        // Guardar en cache
        mapImageCache = mapImg;
        playerImageCache[avatarSrc] = playerImg;

        setLoadingProgress(100);

        // Pequeño delay para transición suave
        setTimeout(() => {
          if (!cancelled) setImagesLoaded(true);
        }, 150);
      } catch (error) {
        console.error('Error loading map images:', error);
        // Mostrar de todos modos si hay error
        if (!cancelled) setImagesLoaded(true);
      }
    };

    loadImages();

    return () => {
      cancelled = true;
      window.removeEventListener('resize', detectMobile);
    };
  }, [open, playerAvatar]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      let { x, y } = dogPos;
      const step = 4;
      if (key === 'arrowup' || key === 'w') y = Math.max(5, y - step);
      if (key === 'arrowdown' || key === 's') y = Math.min(95, y + step);
      if (key === 'arrowleft' || key === 'a') x = Math.max(5, x - step);
      if (key === 'arrowright' || key === 'd') x = Math.min(95, x + step);
      if (x !== dogPos.x || y !== dogPos.y) {
        e.preventDefault();
        setDogPos({ x, y });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [dogPos, open]);

  const nearStall = useMemo(() => {
    return stallZones.find(zone => {
      return (
        dogPos.x >= zone.area.left &&
        dogPos.x <= zone.area.left + zone.area.width &&
        dogPos.y >= zone.area.top &&
        dogPos.y <= zone.area.top + zone.area.height
      );
    });
  }, [dogPos.x, dogPos.y]);

  useEffect(() => {
    if (open && autoOpenLevel && !autoOpened) {
      const zone = stallZones.find(z => z.id === autoOpenLevel);
      if (zone) {
        setAutoOpened(true);
        setTimeout(() => {
          openDialogForZone(zone);
          onAutoOpenConsumed?.();
        }, 300);
      }
    }
    if (!open) {
      setAutoOpened(false);
    }
  }, [open, autoOpenLevel, autoOpened]);

  // Handle mute - stop sound immediately when muted
  useEffect(() => {
    if (isMuted) {
      stopAmbientSound();
    }
  }, [isMuted, stopAmbientSound]);

  // Play ambient sound when map is fully loaded and not muted
  useEffect(() => {
    if (!open || !imagesLoaded || isMuted) return;

    // Small delay to ensure smooth transition
    const timer = setTimeout(() => {
      playAmbientSound();
    }, 300);

    return () => {
      clearTimeout(timer);
      stopAmbientSound();
    };
  }, [open, imagesLoaded, isMuted, playAmbientSound, stopAmbientSound]);

  if (!open) return null;

  const openDialogForZone = (zone: StallZone) => {
    setSelected(zone.id);
    setDialogZone(zone);
  };

  const handleContinue = () => {
    if (!dialogZone) return;
    onEnterLevel(dialogZone.id);
    setDialogZone(null);
    onClose();
  };

  // Pantalla de carga suave mientras se cargan las imágenes
  if (!imagesLoaded) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: '#f2a95c' }}
      >
        {/* Botón pixel para regresar al home */}
        <Link
          to="/"
          className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-2 pixel-tag text-amber-900 hover:text-amber-950 transition-all duration-200 group"
        >
          <PixelChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          <span className="font-medium text-xs">DeFi México Hub</span>
        </Link>

        {/* Control de audio y selector de idioma */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className="relative z-50 p-2 pixel-tag text-amber-900 hover:bg-amber-200 transition-all duration-200 cursor-pointer"
            title={isMuted ? 'Activar sonido' : 'Silenciar'}
          >
            {isMuted ? <PixelMute size={16} /> : <PixelVolume size={16} />}
          </button>
        </div>

        <div className="text-center space-y-6">
          <div className="animate-bounce flex justify-center">
            <PixelStore size={64} className="text-amber-900" />
          </div>
          <h2 className="text-2xl font-bold text-amber-900">{t('mercadoLP.map.loading')}</h2>

          {/* Barra de progreso */}
          <div className="w-48 mx-auto">
            <div className="h-3 bg-amber-200 rounded-full overflow-hidden border-2 border-amber-700">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300 ease-out"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>

          <div className="flex justify-center gap-3 items-center">
            <span className="animate-pulse"><PixelMango size={28} /></span>
            <span className="animate-pulse" style={{ animationDelay: '0.15s' }}><PixelLemon size={28} /></span>
            <span className="animate-pulse" style={{ animationDelay: '0.3s' }}><PixelWatermelon size={28} /></span>
            <span className="animate-pulse" style={{ animationDelay: '0.45s' }}><PixelBanana size={28} /></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-center bg-cover animate-fade-in"
      style={{
        backgroundImage: `url('${MAP_IMAGE_URL}')`,
        backgroundColor: '#f2a95c',
      }}
    >
      <div className="relative w-full h-full overflow-hidden">

        {/* Botón pixel para regresar al home */}
        <Link
          to="/"
          className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10 flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 pixel-tag text-amber-900 hover:text-amber-950 transition-all duration-200 group text-[11px] sm:text-xs"
        >
          <PixelChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          <span className="font-medium text-xs">DeFi México Hub</span>
        </Link>

        {/* Control de audio y selector de idioma */}
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-50 flex items-center gap-1.5 sm:gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className="relative z-50 p-1.5 sm:p-2 pixel-tag text-amber-900 hover:bg-amber-200 transition-all duration-200 cursor-pointer"
            title={isMuted ? 'Activar sonido' : 'Silenciar'}
          >
            {isMuted ? <PixelMute size={16} /> : <PixelVolume size={16} />}
          </button>
          <Button
            variant="secondary"
            size="sm"
            className="pixel-button h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
            onClick={onClose}
          >
            {t('mercadoLP.map.enter')}
          </Button>
        </div>

        <div className="hidden sm:block absolute top-3 left-1/2 -translate-x-1/2 pixel-card bg-card/60 backdrop-blur-sm px-4 py-2 text-sm font-bold tracking-wide">
          {t('mercadoLP.header.title')}
        </div>

        <div className="absolute inset-0">
          {stallZones.map((zone, index) => {
            // Different float delays for each NPC - Pokemon style!
            const floatClass = [
              'animate-float',
              'animate-float-delayed-1',
              'animate-float-delayed-2',
              'animate-float-delayed-3',
            ][index % 4];

            return (
              <div
                key={zone.id}
                className={cn(
                  "absolute cursor-pointer flex flex-col items-center justify-center text-center",
                  selected === zone.id ? 'animate-bounce-slow' : ''
                )}
                style={{
                  left: `${zone.area.left}%`,
                  top: `${zone.area.top}%`,
                  width: `${zone.area.width}%`,
                  height: `${zone.area.height}%`,
                  transform: 'translate(-10%, -10%)',
                }}
                onClick={() => {
                  openDialogForZone(zone);
                }}
              >
                <div className={cn(
                  "text-[11px] sm:text-xs mt-1 pixel-tag",
                  floatClass
                )}>
                  <span className="text-emerald-700 font-bold">N{zone.id}</span>
                  {!isMobile && (
                    <span className="text-amber-800"> - {t(stallDialog[zone.id].title)}</span>
                  )}
                </div>
              </div>
            );
          })}

          <img
            src={playerImageCache[playerAvatar]?.src || playerAvatar || DEFAULT_PLAYER_IMAGE_URL}
            alt="Jugador con perrito"
            className="absolute w-12 sm:w-16 h-auto animate-bob-slow pointer-events-none select-none drop-shadow-[0_4px_2px_rgba(0,0,0,0.35)]"
            style={{
              left: `${dogPos.x}%`,
              top: `${dogPos.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />

          {!isMobile && nearStall && !dialogZone && (
            <div className="absolute left-1/2 bottom-3 sm:bottom-4 -translate-x-1/2 pixel-dialog px-3 py-3 sm:px-4 text-xs sm:text-sm flex items-center gap-2 sm:gap-3 animate-slide-up max-w-[92vw]">
              <PixelInfo size={20} className="text-amber-700" />
              <div>
                <p className="font-semibold text-amber-900">
                  {t(stallDialog[nearStall.id].title)} · {t(stallDialog[nearStall.id].subtitle)}
                </p>
              </div>
              <Button
                className="pixel-button bg-green-600 hover:bg-green-700 border-green-800 h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
                onClick={() => {
                  if (nearStall.id) {
                    openDialogForZone(nearStall);
                  }
                }}
              >
                {t('mercadoLP.map.enter')}
              </Button>
            </div>
          )}

          {!isMobile && dialogZone && (
            <div
              className="absolute w-[92vw] max-w-[340px] sm:max-w-[360px] sm:w-[320px] pixel-dialog animate-slide-up z-20"
              style={{
                // Posicionar debajo del personaje seleccionado
                left: `${Math.min(Math.max(dialogZone.area.left - 5, 5), 65)}%`,
                top: `${Math.min(dialogZone.area.top + dialogZone.area.height + 2, 75)}%`,
              }}
            >
              {/* Botón de cerrar pixel */}
              <button
                onClick={() => setDialogZone(null)}
                className="absolute -top-3 -right-3 pixel-close-btn"
                title="Cerrar"
              >
                <PixelX size={12} />
              </button>

              <div className="pixel-dialog-header">
                <p className="text-sm font-bold tracking-wide text-white">{t(stallDialog[dialogZone.id].title)}</p>
                <p className="text-xs text-emerald-200 font-medium">
                  {t(stallDialog[dialogZone.id].subtitle)}
                </p>
              </div>
              <div className="px-3 sm:px-4 py-3 text-sm leading-relaxed text-amber-900">
                <p className="truncate">
                  {t(stallDialog[dialogZone.id].title)} · {t(stallDialog[dialogZone.id].subtitle)}
                </p>
              </div>
              <div className="px-3 sm:px-4 py-3 flex justify-end gap-2 border-t-2 border-amber-700/30">
                <Button variant="outline" className="pixel-button text-xs h-9 px-3 sm:h-10 sm:px-4" size="sm" onClick={() => setDialogZone(null)}>
                  {t('mercadoLP.map.close')}
                </Button>
                <Button className="pixel-button bg-green-600 hover:bg-green-700 border-green-800 text-xs h-9 px-3 sm:h-10 sm:px-4" size="sm" onClick={handleContinue}>
                  {t('mercadoLP.map.enter')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
