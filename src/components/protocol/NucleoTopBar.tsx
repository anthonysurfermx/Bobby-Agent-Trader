// The home's top bar for the protocol pages: the small "Bobby" wordmark back to "/", the pages as
// quiet mono links, and one way into the app. Styles live in src/styles/nucleo-pages.css (.np-*).
import { Link, useLocation } from 'react-router-dom';
import { lang, locale, t, LANGS, LANG_NAME, setLang } from '@/lib/companions/i18n';

type NavLink = readonly [label: string, href: string];

const PROTOCOL_LINKS: ReadonlyArray<NavLink> = [
  ['Protocol', '/protocol'],
  ['Calls', '/protocol/calls'],
  ['Record', '/record'],
  ['Docs', '/protocol/docs'],
  ['Heartbeat', '/protocol/heartbeat'],
];

export default function NucleoTopBar({ links = PROTOCOL_LINKS }: { links?: ReadonlyArray<NavLink> }) {
  const { pathname } = useLocation();
  const language = lang();
  const spanishLabels: Record<string, string> = { Protocol: 'Protocolo', Calls: 'Consultas', Record: 'Historial', Docs: 'Documentación', Heartbeat: 'Actividad', App: 'App' };
  const localizedHref = (href: string) => {
    if (!href.startsWith('/') || href.startsWith('//')) return href;
    const url = new URL(href, window.location.origin);
    url.searchParams.set('lang', language);
    url.searchParams.set('locale', locale());
    return url.pathname + url.search + url.hash;
  };
  return (
    <header className="np-topbar">
      {/* "/" is a static page served before the SPA, so it takes a real page load */}
      <a className="np-wordmark" href={localizedHref('/')} aria-label={t('Bobby, home', 'Bobby, inicio')}>Bobby</a>
      <nav className="np-nav" aria-label="Bobby Protocol">
        {links.map(([label, href]) => {
          const active = href === pathname;
          const className = `np-navlink${active ? ' on' : ''}`;
          // In-app routes navigate inside the SPA; page anchors and "/" stay plain links.
          return href.startsWith('/') && href !== '/'
            ? <Link key={href} to={localizedHref(href)} className={className} aria-current={active ? 'page' : undefined}>{t(label, spanishLabels[label] ?? label)}</Link>
            : <a key={href} href={localizedHref(href)} className={className}>{t(label, spanishLabels[label] ?? label)}</a>;
        })}
      </nav>
      <div className="np-actions">
        <select className="np-language" value={language} aria-label={t('Language', 'Idioma')} onChange={event => {
          const next = event.target.value as typeof language;
          if (!LANGS.includes(next)) return;
          setLang(next);
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set('lang', next);
          nextUrl.searchParams.delete('locale');
          window.location.assign(nextUrl.href);
        }}>
          {LANGS.map(code => <option key={code} value={code}>{LANG_NAME[code]}</option>)}
        </select>
        <Link className="np-app" to={localizedHref('/desk')}>{t('App', 'App')}</Link>
      </div>
    </header>
  );
}
