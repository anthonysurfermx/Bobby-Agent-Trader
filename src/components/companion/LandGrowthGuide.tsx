import React from 'react';
import { Link } from 'react-router-dom';
import { Globe, Sprout } from 'lucide-react';
import { t } from '@/lib/companions/i18n';
import { WORLDS_PATH } from '@/lib/trader-land/public';
import { coreStateLabel, growthLabel, horizonLabel, type LandCore, type LandGrowth } from '@/lib/trader-land/growth';

type Props = {
  practice: boolean;
  available: number;
  seeds: number;
  reviewReady: number;
  /** island side (8/10/12/16) and how close it is to the next ring — account islands */
  size?: number;
  growth?: LandGrowth | null;
  core?: LandCore | null;
  /** pieces standing on the island (the core wakes at 5) */
  pieces?: number;
  /** what the next seed of each horizon blooms into (tiers[].next) */
  nextByHorizon?: Array<{ hours: number; name: string }>;
  waitingUntil?: string;
  disabled: boolean;
  onReview: () => void;
  onBuild: () => void;
  onSignIn: () => void;
};

export default function LandGrowthGuide(props: Props) {
  const { practice, available, seeds, reviewReady, size, growth, core, pieces = 0, nextByHorizon = [], waitingUntil, disabled } = props;
  const next = practice ? t('Try building, then start your earned island.', 'Prueba construir y empieza tu isla ganada.')
    : reviewReady ? t('Review a thesis to make its seed bloom.', 'Revisa una tesis para hacer florecer su semilla.')
    : available ? t('You have pieces ready. Give them a place.', 'Tienes piezas listas. Dales un lugar.')
    : seeds ? t('Your seeds are waiting for their thesis review.', 'Tus semillas esperan la revisión de su tesis.')
    : t('Ask a question at the desk: one question plants one seed.', 'Haz una pregunta en el desk: una pregunta planta una semilla.');
  const canGrow = Boolean(growth && growth.threshold !== null && growth.nextSize !== null);
  return <section className="land-growth" aria-label={t('Grow your island', 'Haz crecer tu isla')}>
    <span className="land-eyebrow"><Sprout size={14} />{practice ? t('PRACTICE ISLAND', 'ISLA DE PRÁCTICA') : t('YOUR NEXT STEP', 'TU SIGUIENTE PASO')}</span>
    <h3>{next}</h3>
    {practice ? <p>{t('To earn pieces: ask at the desk → choose how long its seed grows → review the thesis → build. This practice layout stays in your browser, separate from your earned island.', 'Para ganar piezas: pregunta en el desk → elige cuánto crece su semilla → revisa la tesis → construye. Esta práctica se guarda en tu navegador, separada de tu isla ganada.')}</p> : <>
      <p>{available} {t('ready to build', 'listas para construir')} · {seeds} {t('seeds', 'semillas')}</p>
      {size && <><label className="land-route-label" htmlFor="land-growth-progress">{t('Island', 'Isla')} <span>{growthLabel(size, growth)}</span></label>
        {canGrow && <progress id="land-growth-progress" max={growth!.threshold!} value={Math.min(growth!.occupied, growth!.threshold!)} />}
        {canGrow && <p>{t(`At ${growth!.threshold} cells in use it grows to ${growth!.nextSize}×${growth!.nextSize}.`, `Con ${growth!.threshold} casillas ocupadas crece a ${growth!.nextSize}×${growth!.nextSize}.`)}</p>}</>}
      {core && <p>{coreStateLabel(core, pieces)}</p>}
      {nextByHorizon.length > 0 && <p>{t('Next pieces', 'Siguientes piezas')}: {nextByHorizon.map((entry, index) => <React.Fragment key={entry.hours}>{index > 0 && ' · '}{horizonLabel(entry.hours)} → <strong>{entry.name}</strong></React.Fragment>)}</p>}
      {seeds > 0 && !reviewReady && waitingUntil && <p>{t('Next review', 'Próxima revisión')}: {waitingUntil}</p>}
    </>}
    {practice ? <button className="land-text-link" disabled={disabled} onClick={props.onSignIn}>{t('Start my earned island', 'Empezar mi isla ganada')} →</button>
      : reviewReady ? <button className="land-text-link" disabled={disabled} onClick={props.onReview}>{t('Review thesis', 'Revisar tesis')} →</button>
      : available ? <button className="land-text-link" disabled={disabled} onClick={props.onBuild}>{t('Place a ready piece', 'Colocar una pieza lista')} →</button>
      : <Link className="land-text-link" to="/desk">{t('Go to the desk', 'Ir al desk')} →</Link>}
    <details>
      <summary>{t('How does my island grow?', '¿Cómo crece mi isla?')}</summary>
      <ol>
        <li>{t('One question = one seed. Every completed read at the desk plants one (up to 3 a day).', 'Una pregunta = una semilla. Cada lectura completa en el desk planta una (hasta 3 al día).')}</li>
        <li>{t('Patience decides the piece. A seed given 24 hours blooms into a 1×1 piece, 3 days into a 2×1 building, 7 days into a 2×2 landmark. You can extend a seed until its review opens, never shorten it.', 'La paciencia decide la pieza. Una semilla con 24 horas florece en una pieza de 1×1, con 3 días en un edificio de 2×1, con 7 días en un hito de 2×2. Puedes extender una semilla hasta que abra su revisión, nunca acortarla.')}</li>
        <li>{t('When its review is ready, review the thesis: the seed blooms whatever the verdict. Patience earns the piece, P&L never does. A respected NO TRADE blooms a 1×1 piece at once.', 'Cuando su revisión esté lista, revisa la tesis: la semilla florece sea cual sea el veredicto. La paciencia gana la pieza, el P&L nunca. Un NO TRADE respetado florece una pieza de 1×1 al instante.')}</li>
        <li>{t('Build. Each tier repeats its own sequence in the open, so you always know the next piece. As pieces fill it, the island grows: 8×8 → 10×10 → 12×12 → 16×16. The Aura Core wakes once 5 pieces stand on it, and you can move it like a piece.', 'Construye. Cada nivel repite su propia secuencia a la vista, así siempre sabes la siguiente pieza. Conforme la llenas, la isla crece: 8×8 → 10×10 → 12×12 → 16×16. El Aura Core despierta cuando hay 5 piezas en ella y puedes moverlo como una pieza.')}</li>
      </ol>
      <p>{t('Moving pieces or visiting islands does not award XP.', 'Mover piezas o visitar islas no da XP.')}</p>
    </details>
    <Link className="land-discover-link" to={`${WORLDS_PATH}#comunidad`}><Globe size={16} /><span>{t('Get ideas from other islands', 'Inspírate en otras islas')} →</span></Link>
  </section>;
}
