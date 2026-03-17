import { useRef, useState, useEffect, useCallback } from 'react';
import { AvatarSceneManager } from './AvatarScene';

interface UseAvatarRendererResult {
  staticImages: Map<string, string>;
  isReady: boolean;
  isWebGLSupported: boolean;
  attachLive: (container: HTMLElement, slug: string) => void;
  detachLive: () => void;
}

export function useAvatarRenderer(slugs: string[]): UseAvatarRendererResult {
  const managerRef = useRef<AvatarSceneManager | null>(null);
  const [staticImages, setStaticImages] = useState<Map<string, string>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const [isWebGLSupported, setIsWebGLSupported] = useState(true);

  useEffect(() => {
    const manager = new AvatarSceneManager();
    managerRef.current = manager;

    if (!manager.isSupported) {
      setIsWebGLSupported(false);
      setIsReady(true);
      return () => manager.dispose();
    }

    // Batch pre-render using requestIdleCallback or setTimeout fallback
    const schedule = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 0));

    schedule(() => {
      if (!managerRef.current) return;
      const images = managerRef.current.renderBatch(slugs);
      setStaticImages(images);
      setIsReady(true);
    });

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
  }, [slugs.join(',')]);

  const attachLive = useCallback((container: HTMLElement, slug: string) => {
    managerRef.current?.attachLiveCanvas(container, slug);
  }, []);

  const detachLive = useCallback(() => {
    managerRef.current?.detachLiveCanvas();
  }, []);

  return { staticImages, isReady, isWebGLSupported, attachLive, detachLive };
}
