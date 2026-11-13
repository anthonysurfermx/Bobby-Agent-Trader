import { useEffect } from 'react';

// Load optional typefaces after the route renders so blocked fonts never reject its CSS chunk.
export function useNucleoFonts(enabled = true) {
  useEffect(() => {
    if (!enabled || document.getElementById('nucleo-fonts')) return;
    const link = document.createElement('link');
    link.id = 'nucleo-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&family=Sora:wght@200;300;400;500&display=swap';
    document.head.appendChild(link);
  }, [enabled]);
}
