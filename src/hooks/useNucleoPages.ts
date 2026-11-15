// The protocol and documentation pages wear the Núcleo design (the home and /desk) through
// body.nucleo-pages: set while a page is mounted, so dialogs that portal to <body> are themed too and
// the pages that keep the terminal look are untouched. React runs the old page's layout cleanup
// before the next page's layout effect, so moving between two Núcleo pages never drops the class, and
// a layout effect sets it before the first paint.
import { useLayoutEffect } from 'react';
import { useNucleoFonts } from './useNucleoFonts';
import '@/styles/nucleo-pages.css';

export function useNucleoPages(enabled = true) {
  useNucleoFonts(enabled);
  useLayoutEffect(() => {
    if (!enabled) return;
    document.body.classList.add('nucleo-pages');
    return () => document.body.classList.remove('nucleo-pages');
  }, [enabled]);
}
