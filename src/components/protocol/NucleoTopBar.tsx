// The home's top bar for the protocol pages: the small "Bobby" wordmark back to "/", the pages as
// quiet mono links, and one way into the app. Styles live in src/styles/nucleo-pages.css (.np-*).
import { Link, useLocation } from 'react-router-dom';

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
  return (
    <header className="np-topbar">
      {/* "/" is a static page served before the SPA, so it takes a real page load */}
      <a className="np-wordmark" href="/" aria-label="Bobby, home">Bobby</a>
      <nav className="np-nav" aria-label="Bobby Protocol">
        {links.map(([label, href]) => {
          const active = href === pathname;
          const className = `np-navlink${active ? ' on' : ''}`;
          // In-app routes navigate inside the SPA; page anchors and "/" stay plain links.
          return href.startsWith('/') && href !== '/'
            ? <Link key={href} to={href} className={className} aria-current={active ? 'page' : undefined}>{label}</Link>
            : <a key={href} href={href} className={className}>{label}</a>;
        })}
      </nav>
      <Link className="np-app" to="/desk">App</Link>
    </header>
  );
}
