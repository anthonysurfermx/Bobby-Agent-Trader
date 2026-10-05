import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider, type FilledContext } from 'react-helmet-async';
import { AnimatePresence } from 'framer-motion';
import BobbyAppLandingWorld from '../src/pages/BobbyAppLandingWorld';
import { APP_LANGUAGES, APP_LOCALES, appLanguage, appLocale } from '../src/lib/app-language';

export { APP_LANGUAGES, APP_LOCALES, appLanguage, appLocale };

/** Render the public marketing component only. Effects never run on the server. */
export function renderApp(language: string, locale: string) {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalFetch = globalThis.fetch;
  const values = new Map([['bobby_lang', language], ['bobby_locale', locale]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      setItem: () => { throw new Error('Prerender must not write storage'); },
      removeItem: () => { throw new Error('Prerender must not write storage'); },
      clear: () => { throw new Error('Prerender must not write storage'); },
    },
  });
  globalThis.fetch = (() => { throw new Error('Prerender must not make network requests'); }) as typeof fetch;
  try {
    const context = {} as FilledContext;
    // Keep the static first paint readable. The existing client still owns animations.
    const body = renderToStaticMarkup(
      <HelmetProvider context={context}>
        <AnimatePresence initial={false}><BobbyAppLandingWorld /></AnimatePresence>
      </HelmetProvider>,
    );
    return {
      body,
      htmlAttributes: context.helmet.htmlAttributes.toString(),
      title: context.helmet.title.toString(),
      meta: context.helmet.meta.toString(),
      link: context.helmet.link.toString(),
    };
  } finally {
    globalThis.fetch = originalFetch;
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
