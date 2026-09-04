// /agentic-world/bobby/trader-land/worlds — first the five worlds we built,
// then the islands their builders chose to share. Public, read-only.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowUpRight, Globe, Hammer, Link2, RotateCw, Sparkles } from 'lucide-react';
import KineticShell from '@/components/kinetic/KineticShell';
import IslandThumb from '@/components/companion/IslandThumb';
import { useLandManifest } from '@/lib/trader-land/useLandManifest';
import { isSpanish, t } from '@/lib/companions/i18n';
import { DISTRICTS, DISTRICT_META, KIND_LABEL, STUDIO_PATH, artOf, fetchPublicWorlds, itemLabel, visitorPath, type CatalogItem, type PublicWorld } from '@/lib/trader-land/public';

const KIND_ORDER = ['ground', 'path_pavement', 'decor', 'building', 'landmark'];

export default function TraderLandWorldsPage() {
  const { manifest, failed: artFailed } = useLandManifest();
  const [worlds, setWorlds] = useState<PublicWorld[] | null>(null);
  const [catalog, setCatalog] = useState<Map<string, CatalogItem>>(new Map());
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetchPublicWorlds(controller.signal).then((value) => {
      setWorlds(Array.isArray(value.worlds) ? value.worlds : []);
      setCatalog(new Map((value.catalog ?? []).map((item) => [item.id, item])));
    }).catch(() => { if (!controller.signal.aborted) setError(t('The community islands could not load.', 'No se pudieron cargar las islas de la comunidad.')); });
    return () => controller.abort();
  }, [attempt]);
  const locale = isSpanish() ? 'es-MX' : 'en-US';

  return (
    <KineticShell minimalNav>
      <Helmet><title>{t('Worlds · Trader Land | Bobby', 'Mundos · Trader Land | Bobby')}</title><meta name="description" content={t('The five worlds of Trader Land and the islands the community shares.', 'Los cinco mundos de Trader Land y las islas que comparte la comunidad.')} /></Helmet>
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 text-[#ecf5e9] sm:px-6">
        <section className="pt-6 sm:pt-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-200/65">BOBBY WORLD · {t('WORLDS', 'MUNDOS')}</span>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">{t('Worlds to explore.', 'Mundos para explorar.')} <span className="text-[#b6ee9e]">{t('Islands to share.', 'Islas para compartir.')}</span></h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-emerald-50/65 sm:text-base">{t('First, the five worlds we built: each one grows from one trader virtue. Then the islands their builders decided to open. Nothing here is bought; every piece came from a real decision.', 'Primero, los cinco mundos que construimos: cada uno nace de una virtud del trader. Después, las islas que sus constructores decidieron abrir. Aquí nada se compra; cada pieza nació de una decisión real.')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={STUDIO_PATH} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d1edb8] px-5 text-sm font-semibold text-[#17251a] transition hover:bg-[#e2f7cf]"><Hammer size={16} />{t('Build my island', 'Construir mi isla')}</Link>
            <a href="#comunidad" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm text-[#e6eddf] transition hover:border-emerald-200/40"><Globe size={16} />{t('See shared islands', 'Ver islas compartidas')}</a>
          </div>
        </section>

        <section id="mundos" className="mt-14" aria-labelledby="worlds-title">
          <div className="flex items-end justify-between gap-4">
            <div><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-200/65">01</span><h2 id="worlds-title" className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('The five worlds', 'Los cinco mundos')}</h2></div>
            <p className="hidden max-w-xs text-right text-xs text-emerald-50/50 sm:block">{t('Five districts, five pieces each, plus the Aura Core every island starts with.', 'Cinco distritos, cinco piezas cada uno, más el Aura Core con el que empieza toda isla.')}</p>
          </div>
          {artFailed && <p role="alert" className="mt-6 rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">{t('The art catalog could not load. Reload the page.', 'No se pudo cargar el catálogo de arte. Recarga la página.')}</p>}
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {DISTRICTS.map((district) => {
              const meta = DISTRICT_META[district];
              const pieces = (manifest?.items ?? []).filter((item) => item.district === district).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
              return (
                <article key={district} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5" style={{ boxShadow: `inset 0 1px 0 ${meta.color}22` }}>
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: meta.color, boxShadow: `0 0 12px ${meta.color}88` }} aria-hidden="true" />
                    <h3 className="text-lg font-semibold">{meta.name}</h3>
                    <span className="ml-auto rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-100/80">{t(...meta.trait)}</span>
                  </div>
                  <p className="mt-2 text-sm text-emerald-50/60">{t(...meta.line)}</p>
                  <ul className="mt-4 grid grid-cols-5 gap-2" aria-label={t('Pieces', 'Piezas')}>
                    {pieces.length ? pieces.map((item) => {
                      const art = artOf(item);
                      return (
                        <li key={item.id} className="flex flex-col items-center gap-1 text-center">
                          <img src={art.thumb?.url ?? art.albedo.url} alt="" loading="lazy" width="64" height="64" className="h-14 w-14 object-contain sm:h-16 sm:w-16" />
                          <span className="text-[11px] leading-tight text-emerald-50/85">{itemLabel(item.id, district, catalog)}</span>
                          <span className="text-[9px] uppercase tracking-[0.12em] text-emerald-200/50">{t(...(KIND_LABEL[item.kind] ?? [item.kind, item.kind]))}</span>
                        </li>
                      );
                    }) : Array.from({ length: 5 }, (_, index) => <li key={index} className="h-20 animate-pulse rounded-lg bg-white/[0.03]" />)}
                  </ul>
                </article>
              );
            })}
            <article className="flex flex-col justify-between rounded-2xl border border-dashed border-emerald-200/20 p-5">
              <div><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-200/65">{t('HOW YOU EARN THEM', 'CÓMO SE GANAN')}</span><p className="mt-3 text-sm leading-relaxed text-emerald-50/70">{t('A completed read plants a seed. A respected no-trade or a closed thesis makes it bloom. Only bloomed pieces can be built.', 'Una lectura completa planta una semilla. Un no-trade respetado o una tesis cerrada la hace florecer. Solo las piezas florecidas se construyen.')}</p></div>
              <Link to="/agentic-world/bobby" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#d1edb8]">{t('Start at the desk', 'Empezar en el desk')}<ArrowUpRight size={16} /></Link>
            </article>
          </div>
        </section>

        <section id="comunidad" className="mt-16 scroll-mt-24" aria-labelledby="community-title">
          <div className="flex items-end justify-between gap-4">
            <div><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-200/65">02</span><h2 id="community-title" className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('Community islands', 'Islas de la comunidad')}</h2></div>
            {worlds && worlds.length > 0 && <span className="font-mono text-xs text-emerald-100/70">{worlds.length} {t(worlds.length === 1 ? 'island' : 'islands', worlds.length === 1 ? 'isla' : 'islas')}</span>}
          </div>
          {error && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100"><span>{error}</span><button onClick={() => setAttempt((value) => value + 1)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs"><RotateCw size={14} />{t('Retry', 'Reintentar')}</button></div>}
          {!error && worlds === null && <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="aspect-[4/3] animate-pulse rounded-2xl bg-white/[0.03]" />)}</div>}
          {!error && worlds && worlds.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-white/[0.1] p-8 text-center">
              <Sparkles className="mx-auto text-[#b6ee9e]" size={22} />
              <h3 className="mt-3 text-lg font-semibold">{t('No island has been shared yet.', 'Todavía nadie ha compartido su isla.')}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-emerald-50/60">{t('Build yours, open it from the Share button on your island, and it will appear here for everyone.', 'Construye la tuya, ábrela desde el botón Compartir de tu isla y aparecerá aquí para todos.')}</p>
              <Link to={STUDIO_PATH} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d1edb8] px-5 text-sm font-semibold text-[#17251a]"><Hammer size={16} />{t('Be the first', 'Ser la primera isla')}</Link>
            </div>
          )}
          {!error && worlds && worlds.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {worlds.map((world) => {
                const name = world.title || t('Untitled island', 'Isla sin nombre');
                return (
                  <Link key={world.code} to={visitorPath(world.code)} className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition hover:border-emerald-200/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">
                    <div className="bg-[radial-gradient(ellipse_at_center,#20423755,transparent_70%)] bg-[#101e1b]">
                      {manifest ? <IslandThumb manifest={manifest} placements={world.placements} size={world.size} title={name} className="block w-full" /> : <div className="aspect-[800/520] animate-pulse bg-white/[0.03]" />}
                    </div>
                    <div className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{name}</h3>
                        <p className="mt-1 text-xs text-emerald-50/55">{world.stats.pieces} {t('pieces', 'piezas')} · {world.stats.districts.length} {t(world.stats.districts.length === 1 ? 'world' : 'worlds', world.stats.districts.length === 1 ? 'mundo' : 'mundos')}{world.publishedAt ? ` · ${new Date(world.publishedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}` : ''}</p>
                        <div className="mt-2 flex gap-1.5" aria-hidden="true">{world.stats.districts.map((district) => <span key={district} className="h-2 w-2 rounded-full" style={{ background: DISTRICT_META[district as keyof typeof DISTRICT_META]?.color ?? '#7da6ff' }} />)}</div>
                      </div>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-200/10 text-emerald-100 transition group-hover:bg-emerald-200/20"><ArrowUpRight size={16} /></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-16 rounded-2xl border border-white/[0.06] bg-gradient-to-r from-[#152b27] via-[#10201e] to-[#0c1517] p-6 sm:p-8" aria-labelledby="share-title">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-200/65">03</span>
          <h2 id="share-title" className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('Share yours', 'Comparte la tuya')}</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              [t('Build', 'Construye'), t('Place the pieces you earned. Move, rotate, undo until it feels like yours.', 'Coloca las piezas que ganaste. Mueve, gira y deshaz hasta que se sienta tuya.')],
              [t('Publish', 'Publica'), t('On your island, tap Share, give it a name and publish. It appears here.', 'En tu isla, toca Compartir, ponle nombre y publica. Aparece aquí.')],
              [t('Send the link', 'Manda el enlace'), t('Anyone can visit without an account. Hide it whenever you want.', 'Cualquiera la visita sin cuenta. Ocúltala cuando quieras.')],
            ].map(([title, body], index) => (
              <li key={title} className="rounded-xl border border-white/[0.06] bg-black/20 p-4"><span className="font-mono text-[10px] text-emerald-200/60">0{index + 1}</span><h3 className="mt-1 font-semibold">{title}</h3><p className="mt-1 text-sm text-emerald-50/60">{body}</p></li>
            ))}
          </ol>
          <Link to={STUDIO_PATH} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d1edb8] px-5 text-sm font-semibold text-[#17251a] transition hover:bg-[#e2f7cf]"><Link2 size={16} />{t('Open my island', 'Abrir mi isla')}</Link>
        </section>
      </div>
    </KineticShell>
  );
}
