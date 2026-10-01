import type { OverviewResponse } from '@/lib/admin-client';
import { Card, Empty, Note, Row } from './ui';
import { BarsChart, BigNumber, HeroCard, StatusBars, type StatusRow } from './charts';
import { growthWindows, windowDelta, type CompareSeries } from './deltas';
import { fmtCompact, fmtInt, fmtPct } from './format';
import type { Fill } from './tokens';

interface Step { label: string; value: number | null; missing?: string }

/** Funnel steps as status bars, scaled to the largest step, with the conversion from the previous step. */
function steps(list: Step[], fill: Fill): StatusRow[] {
  const top = Math.max(0, ...list.map((s) => s.value ?? 0));
  return list.map((s, i) => {
    const prev = i > 0 ? list[i - 1].value : null;
    return {
      label: s.label,
      value: s.value ?? 0,
      fill,
      missing: s.value == null ? s.missing : undefined,
      display: s.value == null ? '—' : fmtInt(s.value),
      sub: i === 0 ? (top ? '100%' : '—') : prev != null && s.value != null ? fmtPct(s.value, prev) : '—',
    };
  });
}

function Ranked({ title, rows, base, uppercase }: { title: string; rows: Array<{ name: string; visitors: number }>; base: number; uppercase: boolean }) {
  const total = base > 0 ? base : rows.reduce((s, r) => s + r.visitors, 0);
  return (
    <Card>
      <BigNumber label={title} value={fmtInt(rows.length)} caption={rows.length === 1 ? 'fuente' : 'fuentes'} />
      {rows.length ? (
        <StatusBars
          uppercase={uppercase}
          labelWidth={130}
          rows={rows.map((r, i) => ({ label: r.name, value: r.visitors, fill: i === 0 ? 'orange' : 'blue', sub: fmtPct(r.visitors, total) }))}
        />
      ) : <Empty>Sin datos todavía</Empty>}
    </Card>
  );
}

export default function FunnelTab({ data, period, cmp }: { data: OverviewResponse; period: number; cmp: CompareSeries | null }) {
  const { overview: o, integrations: i } = data;
  const w = o.funnel.web;
  const ios = o.funnel.ios;
  const store = i.appStore;
  const downloads = store.configured && store.totals ? store.totals.downloads : null;
  const storeMissing = store.configured ? 'App Store Connect con error' : 'Conecta App Store Connect';
  const refName = (r: string) => (!r || r === 'direct' ? '(directo)' : r);

  return (
    <div className="flex flex-col gap-4">
      <Note tag="Datos">Los eventos web empiezan a registrarse hoy (1 oct 2026); las lecturas guardan 35 días.</Note>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BigNumber label="Web" value={fmtInt(w.visitors)} caption={`visitantes únicos · ${period}d`} />
          <StatusBars
            labelWidth={96}
            rows={steps([
              { label: 'Visitantes', value: w.visitors },
              { label: 'Desk', value: w.deskVisitors },
              { label: 'Invitados', value: w.guestReaders },
              { label: 'Cuentas', value: w.accounts },
              { label: 'Pro', value: w.pro },
            ], 'blue')}
          />
          <div className="mt-5 border-t border-white/[0.06] pt-2">
            <Row label="Clics a App Store" value={fmtInt(w.appStoreClicks)} hint={fmtPct(w.appStoreClicks, w.visitors)} />
            <Row label="Inicios de sesión" value={fmtInt(w.signinStarts)} hint={fmtPct(w.signinStarts, w.visitors)} />
            <Row label="Paywall vistos" value={fmtInt(w.paywallViews)} />
          </div>
        </Card>
        <Card>
          <BigNumber label="iOS" value={downloads != null ? fmtInt(downloads) : '—'} caption={downloads != null ? `descargas · ${period}d` : 'descargas sin conectar'} />
          <StatusBars
            labelWidth={96}
            rows={steps([
              { label: 'Descargas', value: downloads, missing: storeMissing },
              { label: 'Invitados', value: ios.guestReaders },
              { label: 'Cuentas', value: ios.accounts },
              { label: 'Pro', value: ios.pro },
            ], 'orange')}
          />
          <div className="mt-5 border-t border-white/[0.06] pt-2">
            <Row label="Paywall vistos" value={fmtInt(ios.paywallViews)} />
            {store.totals && (
              <>
                <Row label="Re-descargas" value={fmtInt(store.totals.redownloads)} />
                <Row label="Actualizaciones" value={fmtInt(store.totals.updates)} />
              </>
            )}
            {store.error && <Row label="App Store Connect" value={<span className="text-[#F06A6A]">error</span>} hint={store.error} />}
          </div>
        </Card>
      </div>

      <HeroCard
        title="Visitas web por día"
        value={fmtCompact(o.funnel.visitsDaily.reduce((a, b) => a + b, 0))}
        delta={windowDelta(cmp?.visits, period)}
        chips={growthWindows(cmp?.visits)}
      >
        <BarsChart days={o.days} values={o.funnel.visitsDaily} height={200} emptyLabel="Todavía no hay visitas registradas" />
      </HeroCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Ranked title="Superficies más visitadas" uppercase base={w.visitors} rows={o.funnel.topSurfaces.map((r) => ({ name: r.surface || 'other', visitors: r.visitors }))} />
        <Ranked title="De dónde llegan" uppercase={false} base={w.visitors} rows={o.funnel.topReferrers.map((r) => ({ name: refName(r.referrer), visitors: r.visitors }))} />
      </div>
    </div>
  );
}
