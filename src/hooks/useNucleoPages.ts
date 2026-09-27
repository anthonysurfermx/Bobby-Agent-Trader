// The protocol and documentation pages wear the Núcleo design (the home and /desk) through
// body.nucleo-pages: set while a page is mounted, so dialogs that portal to <body> are themed too and
// the pages that keep the terminal look are untouched. React runs the old page's layout cleanup
// before the next page's layout effect, so moving between two Núcleo pages never drops the class, and
// a layout effect sets it before the first paint.
import { useLayoutEffect } from 'react';
import '@/styles/nucleo-pages.css';

const FONTS_ID = 'nucleo-fonts';
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&family=Sora:wght@200;300;400;500&display=swap';

export function useNucleoPages(enabled = true) {
  useLayoutEffect(() => {
    if (!enabled) return;
    if (!document.getElementById(FONTS_ID)) {
      const link = document.createElement('link');
      link.id = FONTS_ID;
      link.rel = 'stylesheet';
      link.href = FONTS_HREF;
      document.head.appendChild(link);
    }
    document.body.classList.add('nucleo-pages');
    return () => document.body.classList.remove('nucleo-pages');
  }, [enabled]);
}
