// ============================================================
// LandSeedCard — what a read just grew in Trader Land, shown on the desk
// once /api/progress answers with its grant (sync.ts getGrant):
//   · a read planted a SEED: its piece, and the horizon choice — 24 h
//     (selected), 3 days · building, 7 days · landmark, each with the piece
//     it would bloom into; a longer one asks to confirm ("You can't shorten
//     it later") and extends the seed through POST /api/trader-land
//   · a respected NO TRADE bloomed a 1×1 piece at once: no picker
// A new read replaces the card; an extend still in flight then reports
// through a toast instead of vanishing (seed.ts submitExtend).
// One question = one seed; patience decides the piece (GROWTH-v1 §4).
// ============================================================
import { useEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Sprout, X } from 'lucide-react';
import { isSpanish, t } from '@/lib/companions/i18n';
import { sfxSuccess, sfxTock } from '@/lib/companions/sfx';
import { getGrant, onGrants, progressHeaders, setGrant } from '@/lib/companions/sync';
import { artOf, STUDIO_PATH } from '@/lib/trader-land/public';
import { useLandManifest } from '@/lib/trader-land/useLandManifest';
import { NO_SHORTEN, horizonLabel, horizonOptionLabel, pieceName, tierLabel, type HorizonHours, type PieceSummary } from '@/lib/trader-land/growth';
import { seedCardReducer, seedOptions, submitExtend } from '@/lib/trader-land/seed';

export default function LandSeedCard({ eventId, onClose, compact = false }: { eventId: string; onClose: () => void; compact?: boolean }) {
  const grant = useSyncExternalStore(onGrants, () => getGrant(eventId), () => getGrant(eventId));
  const { manifest } = useLandManifest();
  const [state, dispatch] = useReducer(seedCardReducer, { phase: 'choose' });
  // Whether this card is still on screen when its extend settles (a new read unmounts it).
  const onScreen = useRef(true);
  useEffect(() => { onScreen.current = true; return () => { onScreen.current = false; }; }, []);
  if (!grant || !grant.item) return null;
  const spanish = isSpanish();
  const art = (piece: PieceSummary | null) => {
    const item = piece ? manifest?.items.find((entry) => entry.id === piece.id) : undefined;
    if (!item) return null;
    const value = artOf(item);
    return value.thumb?.url ?? value.albedo.url;
  };
  const name = (piece: PieceSummary | null) => pieceName(piece, spanish);
  const shell = `relative rounded-2xl border border-emerald-200/20 bg-emerald-200/[0.04] ${compact ? 'p-4' : 'p-5'}`;
  const close = <button type="button" onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-white/60" aria-label={t('Close', 'Cerrar')}><X size={14} /></button>;

  if (grant.state === 'bloomed') {
    const [w, h] = grant.item.footprint;
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={shell} data-testid="land-bloomed-card">
        {close}
        <div className="font-mono text-[10px] tracking-[0.2em] text-emerald-200/80">{t('TRADER LAND · PIECE READY', 'TRADER LAND · PIEZA LISTA')}</div>
        <div className="mt-3 flex items-center gap-3 pr-8">
          {art(grant.item) && <img src={art(grant.item)!} alt="" width="56" height="56" className="h-14 w-14 shrink-0 object-contain" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{name(grant.item)} <span className="font-mono text-[11px] text-white/50">{w}×{h}</span></div>
            <div className="mt-1 text-xs text-white/60">{t('Respecting NO TRADE bloomed it at once. Give it a place on your island.', 'Respetar el NO TRADE la hizo florecer al instante. Dale un lugar en tu isla.')}</div>
          </div>
        </div>
        <Link to={STUDIO_PATH} className="mt-3 inline-flex min-h-10 items-center font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-200">{t('Open my island', 'Abrir mi isla')} →</Link>
      </motion.div>
    );
  }

  // An older server sends no horizon: the seed is planted at 24 h and there is nothing to choose.
  const options = seedOptions(grant).filter((option) => grant.horizon || option.current);
  const asking = state.phase === 'confirm' || state.phase === 'saving' || state.phase === 'error' ? options.find((option) => option.hours === state.hours) ?? null : null;
  const pick = (hours: HorizonHours) => { sfxTock(); dispatch({ type: 'pick', hours, options }); };
  const submit = async () => {
    if (!asking || !grant.inventoryId || (state.phase !== 'confirm' && state.phase !== 'error')) return;
    dispatch({ type: 'submit' });
    // The identity that synced this grant is the one that owns the seed.
    const outcome = await submitExtend({
      auth: progressHeaders(), eventId, grant, hours: asking.hours, pieceLabel: name, saveGrant: setGrant,
      onScreen: () => onScreen.current,
      card: (result) => dispatch(result.ok ? { type: 'success' } : { type: 'failure', message: result.message }),
      notice: (result) => { if (result.ok) toast.success(result.message); else toast.error(result.message); },
    });
    if (outcome.ok) sfxSuccess();
  };
  const reviewAt = grant.horizon?.reviewAt ? new Date(grant.horizon.reviewAt) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={shell} data-testid="land-seed-card">
      {close}
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-emerald-200/80"><Sprout size={12} />{t('TRADER LAND · SEED PLANTED', 'TRADER LAND · SEMILLA PLANTADA')}</div>
      <div className="mt-2 pr-8 text-sm text-white">{t('One question = one seed. Patience decides the piece.', 'Una pregunta = una semilla. La paciencia decide la pieza.')}</div>
      <div role="radiogroup" aria-label={t('How long this seed grows', 'Cuánto crece esta semilla')} className="mt-3 grid gap-2">
        {options.map((option) => {
          const thumb = art(option.piece);
          const chosen = asking ? asking.hours === option.hours : option.current;
          return (
            <button key={option.hours} type="button" role="radio" aria-checked={option.current} disabled={state.phase === 'saving' || (!option.current && !option.available)} onClick={() => pick(option.hours)}
              className={`flex items-center gap-2 rounded-xl border p-2 text-left transition disabled:cursor-default disabled:opacity-40 ${chosen ? 'border-emerald-200/60 bg-emerald-200/[0.10]' : 'border-white/[0.08] bg-white/[0.02] hover:border-emerald-200/30'}`}>
              {thumb ? <img src={thumb} alt="" width="40" height="40" className="h-10 w-10 shrink-0 object-contain" /> : <span className="h-10 w-10 shrink-0 rounded-lg bg-white/[0.04]" aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-emerald-100/90">{horizonOptionLabel(option.hours)}</span>
                <span className="block truncate text-xs text-white/75">{option.piece ? name(option.piece) : '—'}</span>
                {option.current && <span className="mt-0.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-emerald-300"><Check size={10} />{t('Planted', 'Plantada')}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {asking && (
        <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-3 text-xs text-amber-100" role="group" aria-label={t('Confirm the new horizon', 'Confirma el nuevo horizonte')}>
          <div>{asking.piece
            ? t(`Give it ${horizonLabel(asking.hours)}? It will bloom as ${name(asking.piece)}.`, `¿Darle ${horizonLabel(asking.hours)}? Florecerá como ${name(asking.piece)}.`)
            : t(`Give it ${horizonLabel(asking.hours)}? It will bloom as a ${tierLabel(asking.tier)} ${asking.footprint[0]}×${asking.footprint[1]}.`, `¿Darle ${horizonLabel(asking.hours)}? Florecerá como ${tierLabel(asking.tier)} ${asking.footprint[0]}×${asking.footprint[1]}.`)} <strong>{NO_SHORTEN()}</strong></div>
          {state.phase === 'error' && <div role="alert" className="mt-2 text-red-200">{state.message}</div>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void submit()} disabled={state.phase === 'saving'} className="rounded-lg bg-emerald-300 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-black disabled:opacity-50">{state.phase === 'saving' ? t('Saving…', 'Guardando…') : t('Confirm', 'Confirmar')}</button>
            <button type="button" onClick={() => dispatch({ type: 'cancel' })} disabled={state.phase === 'saving'} className="rounded-lg border border-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/70">{t('Cancel', 'Cancelar')}</button>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {reviewAt && !Number.isNaN(reviewAt.getTime()) && <span className="font-mono text-[10px] text-white/45">{t('Review from', 'Revisable desde')} {reviewAt.toLocaleString(spanish ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
        <Link to={STUDIO_PATH} className="inline-flex min-h-10 items-center font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-200">{t('Open my island', 'Abrir mi isla')} →</Link>
      </div>
    </motion.div>
  );
}
