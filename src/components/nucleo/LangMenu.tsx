// The language menu, the React twin of the home's (public/home/index.html): a small glass globe
// that unfolds into a glass capsule with Español · English · Português, the current one marked by
// a small cyan dot. Choosing one stores it in `bobby_lang` and reloads, so every t() on the page
// reads the new choice (the strings are resolved at render time, and a reload is the one
// re-render that reaches all of them, sheets and portals included).
// `LangSegment` is the same choice inline, for the profile's Language row.
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LANGS, LANG_NAME, lang, setLang, t, type Lang } from '@/lib/companions/i18n';
import { sfxTock } from '@/lib/companions/sfx';

const BCP47: Record<Lang, string> = { es: 'es', en: 'en', pt: 'pt-BR' };

/** Store the choice and reload. Returns false when it is already the current language. */
function choose(next: Lang): boolean {
  if (next === lang()) return false;
  setLang(next);
  window.location.reload();
  return true;
}

/** The home's globe: the meridian narrows as the capsule opens, as if the globe turned a quarter. */
function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" />
      <ellipse className="n-lang-mer" cx="12" cy="12" rx="3.7" ry="8.6" />
      <path d="M3.9 9.2h16.2M3.9 14.8h16.2" />
    </svg>
  );
}

export default function LangMenu() {
  const [open, setOpen] = useState(false);
  const current = lang();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusAt = useRef<'current' | 'first' | 'last'>('current');
  const label = t('Language', 'Idioma', 'Idioma');

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus({ preventScroll: true });
  };
  const openMenu = (at: 'current' | 'first' | 'last' = 'current') => { focusAt.current = at; setOpen(true); };

  // Opening puts focus on the current language (once the capsule is visible, so it is focusable);
  // a tap anywhere outside closes it.
  useEffect(() => {
    if (!open) return;
    const at = focusAt.current;
    const index = at === 'first' ? 0 : at === 'last' ? LANGS.length - 1 : Math.max(0, LANGS.indexOf(current));
    const frame = requestAnimationFrame(() => itemRefs.current[index]?.focus({ preventScroll: true }));
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    // Escape from anywhere (the menu's own handler marks the events it already took).
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { setOpen(false); buttonRef.current?.focus({ preventScroll: true }); } };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', onPointer, true); document.removeEventListener('keydown', onKey); };
  }, [open, current]);

  const onButtonKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(event.key === 'ArrowUp' ? 'last' : 'current'); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); close(true); }
  };

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => { event.preventDefault(); items[(to + items.length) % items.length]?.focus(); };
    switch (event.key) {
      case 'ArrowDown': move(at + 1); break;
      case 'ArrowUp': move(at - 1); break;
      case 'Home': move(0); break;
      case 'End': move(items.length - 1); break;
      case 'Escape': event.preventDefault(); close(true); break;
      case 'Tab': setOpen(false); break;
      default: break;
    }
  };

  return (
    <div ref={rootRef} className="n-lang">
      <button
        ref={buttonRef}
        type="button"
        className="n-lang-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${label}: ${LANG_NAME[current]}`}
        title={`${label} · ${LANG_NAME[current]}`}
        onClick={() => { sfxTock(); if (open) close(false); else openMenu(); }}
        onKeyDown={onButtonKey}
      >
        <GlobeIcon />
      </button>
      {/* Always mounted, like the home's: `visibility: hidden` keeps it out of the tab order and the
          accessibility tree while closed, and the clip-path unfolds it from a globe-sized bead. */}
      <div
        id={menuId}
        role="menu"
        aria-label={label}
        className={`n-lang-menu ${open ? 'open' : ''}`}
        onKeyDown={onMenuKey}
        // Focus leaving for somewhere else on the page closes it. A null target (Safari does not
        // focus buttons on click) is left to the outside-tap listener, or the tap on an option
        // would close the menu before its click lands.
        onBlur={(event) => { const next = event.relatedTarget as Node | null; if (next && !rootRef.current?.contains(next)) setOpen(false); }}
      >
        {LANGS.map((l, i) => (
          <button
            key={l}
            ref={(el) => { itemRefs.current[i] = el; }}
            type="button"
            role="menuitemradio"
            aria-checked={l === current}
            tabIndex={-1}
            lang={BCP47[l]}
            className="n-lang-opt"
            onClick={() => { sfxTock(); if (!choose(l)) close(true); }}
          >
            {LANG_NAME[l]}<i aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** The same three choices inline (the profile's Language row): ES · EN · PT. */
export function LangSegment() {
  const current = lang();
  return (
    <div className="n-seg n-lang-seg" role="group" aria-label={t('Language', 'Idioma', 'Idioma')}>
      {LANGS.map((l) => (
        <button key={l} type="button" lang={BCP47[l]} aria-pressed={l === current} aria-label={LANG_NAME[l]} title={LANG_NAME[l]}
          onClick={() => { sfxTock(); choose(l); }}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
