// "Personas" (everyone Bobby knows today, deduplicated, by stage) and the Search Console card of the Funnel tab.
import { useState } from 'react';
import type { Growth, PeopleStage, SearchConsoleData } from '@/lib/admin-client';
import { Card, CardHead, Note, Segmented, TableScroll, Tag, td, th, tr } from './ui';
import { BarsChart, BigNumber } from './charts';
import { fmtCompact, fmtDec, fmtInt, fmtPct, label } from './format';

// Under this base a percentage is noise: show the counts instead.
const MIN_BASE = 5;
const share = (a: number, b: number) => (!b ? '—' : b >= MIN_BASE ? fmtPct(a, b) : `${fmtInt(a)}/${fmtInt(b)}`);

const STAGES: Array<{ key: PeopleStage; label: string; color: string; def: string }> = [
  { key: 'new', label: 'Sin activar', color: '#6CC4FF', def: 'activos en 7 días, nunca han leído' },
  { key: 'active', label: 'Activos', color: '#2E9BFF', def: 'ya leyeron y estuvieron activos en 7 días' },
  { key: 'recurring', label: 'Recurrentes', color: '#4ADE80', def: 'leyeron en 2+ días distintos de los últimos 14' },
  { key: 'pro', label: 'Pro', color: '#F28C38', def: 'tienen Bobby Pro hoy' },
  { key: 'atRisk', label: 'En riesgo', color: '#F06A6A', def: 'sin actividad de 8 a 30 días' },
  { key: 'lost', label: 'Perdidos', color: '#3A3A3C', def: '30+ días sin actividad' },
];

export function PeopleCard({ people, includeInternal }: { people: Growth['people']; includeInternal: boolean }) {
  const p = people;
  const classified = STAGES.reduce((s, x) => s + p.stages[x.key], 0);
  const base = Math.max(p.total, classified);
  const rest = Math.max(0, p.total - classified);
  const platforms = Object.entries(p.byPlatform).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const excluded = p.excluded.accounts + p.excluded.guests;

  return (
    <Card>
      <BigNumber
        label="Personas"
        value={fmtInt(p.total)}
        caption={`${fmtInt(p.accounts)} cuentas + ${fmtInt(p.guests)} instalaciones sin cuenta`}
        right={platforms.length ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] uppercase text-[#5C5C5C]">
            {platforms.map(([k, v]) => <span key={k}>{label(k)} <span className="text-[#8B8B8B]">{fmtInt(v)}</span></span>)}
          </div>
        ) : undefined}
      />
      <div className="-mt-3 mb-5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[#5C5C5C]">
        <span>una cuenta y sus instalaciones cuentan una vez; no son humanos únicos (una persona con dos navegadores sin cuenta cuenta dos)</span>
        {!includeInternal && excluded > 0 && (
          <span className="text-[#8B8B8B]">sin el equipo: −{fmtInt(p.excluded.accounts)} cuentas, −{fmtInt(p.excluded.guests)} instalaciones</span>
        )}
        {includeInternal && <span className="text-[#F7A04B]">incluye al equipo</span>}
        {p.wallets > 0 && <span>{fmtInt(p.wallets)} identidades wallet, fuera</span>}
      </div>

      {base > 0 ? (
        <>
          <div className="flex h-[18px] w-full gap-[2px] overflow-hidden rounded-full bg-[#1F1F20]" role="img"
            aria-label={STAGES.map((x) => `${x.label} ${fmtInt(p.stages[x.key])}`).join(', ')}>
            {STAGES.map((x) => p.stages[x.key] > 0 && (
              <div key={x.key} className="h-full first:rounded-l-full last:rounded-r-full" title={`${x.label}: ${fmtInt(p.stages[x.key])}`}
                style={{ width: `${(p.stages[x.key] / base) * 100}%`, background: x.color, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' }} />
            ))}
          </div>
          <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-x-4 gap-y-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
            {STAGES.map((x) => (
              <li key={x.key} className="min-w-0">
                <div className="flex items-center gap-1.5 text-[12px] text-[#8B8B8B]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: x.color }} aria-hidden />{x.label}
                </div>
                <div className="mt-1 font-mono text-[15px] text-[#EDEDED]">
                  {fmtInt(p.stages[x.key])} {base >= MIN_BASE && <span className="text-[11px] text-[#5C5C5C]">{fmtPct(p.stages[x.key], base)}</span>}
                </div>
              </li>
            ))}
          </ul>
          {base < MIN_BASE && <p className="m-0 mt-3 font-mono text-[11px] text-[#5C5C5C]">Muestra pequeña: con {fmtInt(base)} personas se muestran conteos, no porcentajes.</p>}
          {rest > 0 && <p className="m-0 mt-3 font-mono text-[11px] text-[#5C5C5C]">{fmtInt(rest)} sin clasificar</p>}
        </>
      ) : <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Todavía no hay personas registradas.</p>}

      {(p.proInactive > 0 || p.accountsNeverRead > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {p.proInactive > 0 && <Tag tone="red">{fmtInt(p.proInactive)} Pro sin usar Bobby en 14+ días</Tag>}
          {p.accountsNeverRead > 0 && <Tag tone="orange">{fmtInt(p.accountsNeverRead)} {p.accountsNeverRead === 1 ? 'cuenta nunca ha leído' : 'cuentas nunca han leído'}</Tag>}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Activas en 7 días', p.active7d, 'abrieron Bobby o leyeron'],
          ['Leyeron en 7 días', p.readers7d, `de ${fmtInt(p.readers)} que han leído alguna vez`],
          ['Activas en 30 días', p.active30d, `de ${fmtInt(p.total)}`],
          ['Nuevas en el periodo', p.newInPeriod, 'vistas por primera vez'],
        ].map(([k, v, sub]) => (
          <div key={k as string} className="min-w-0 rounded-xl border border-white/[0.06] bg-[#1A1A1B] px-3 py-2.5 font-mono">
            <div className="truncate text-[10.5px] text-[#8B8B8B]">{k}</div>
            <div className="mt-1 text-[15px] text-[#EDEDED]">{fmtInt(v as number)}</div>
            <div className="mt-0.5 truncate text-[10.5px] text-[#5C5C5C]" title={sub as string}>{sub}</div>
          </div>
        ))}
      </div>

      <p className="m-0 mt-4 border-t border-white/[0.06] pt-3 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
        {STAGES.map((x) => `${x.label.toLowerCase()} = ${x.def}`).join(' · ')} · Pro va primero aunque esté inactivo
      </p>
    </Card>
  );
}

const path = (url: string) => { try { const u = new URL(url); return u.pathname === '/' ? u.host : u.pathname; } catch { return url; } };

export function SearchConsoleCard({ sc, period }: { sc: SearchConsoleData; period: number }) {
  const [metric, setMetric] = useState<'clicks' | 'impressions'>('clicks');
  if (!sc.configured) {
    return (
      <Card>
        <CardHead title="Google Search Console" right={<Tag>Sin conectar</Tag>} />
        <p className="m-0 text-[13px] leading-relaxed text-[#8B8B8B]">
          Conecta Search Console para ver impresiones, clics, búsquedas y páginas de Google arriba del embudo web.
        </p>
        <ol className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 font-mono text-[11.5px] text-[#8B8B8B]">
          <li><span className="text-[#5C5C5C]">1.</span> Google Cloud → crea una cuenta de servicio y descarga su llave JSON.</li>
          <li><span className="text-[#5C5C5C]">2.</span> Search Console → Configuración → Usuarios → agrega el email de la cuenta de servicio.</li>
          <li><span className="text-[#5C5C5C]">3.</span> Vercel → <code className="text-[#F7A04B]">GSC_SERVICE_ACCOUNT_JSON</code> = el JSON completo (opcional <code className="text-[#F7A04B]">GSC_SITE</code>, por defecto https://bobbyprotocol.xyz/).</li>
        </ol>
      </Card>
    );
  }
  if (sc.error || !sc.totals) {
    return (
      <Card>
        <CardHead title="Google Search Console" right={<Tag tone="red">Con error</Tag>} />
        <Note tone="red">{sc.error ?? 'Search Console no devolvió datos.'}</Note>
      </Card>
    );
  }
  const t = sc.totals;
  const days = sc.days ?? [];
  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-[#EDEDED]/90">Google Search Console</span>
            <Segmented<'clicks' | 'impressions'> label="Métrica" value={metric} onChange={setMetric} options={[{ value: 'clicks', label: 'Clics' }, { value: 'impressions', label: 'Impresiones' }]} />
          </div>
          <div className="mt-2 font-mono text-[30px] font-medium leading-none tracking-[-0.02em] text-[#EDEDED]">{fmtCompact(metric === 'clicks' ? t.clicks : t.impressions)}</div>
          <div className="mt-2 font-mono text-[12px] text-[#8B8B8B]">{metric === 'clicks' ? 'clics' : 'impresiones'} · {period}d{sc.site ? ` · ${path(sc.site)}` : ''}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ['Impresiones', fmtCompact(t.impressions)],
            ['Clics', fmtCompact(t.clicks)],
            // Google's own CTR over its impressions; with few impressions it is noise.
            ['CTR', t.impressions >= MIN_BASE ? fmtPct(t.ctr, 1) : share(t.clicks, t.impressions)],
            ['Posición media', t.position != null ? fmtDec(t.position) : '—'],
          ].map(([k, v]) => (
            <div key={k} className="min-w-[84px] rounded-xl border border-white/[0.06] bg-[#1A1A1B] px-3 py-2 font-mono">
              <div className="text-[10.5px] text-[#8B8B8B]">{k}</div>
              <div className="mt-0.5 text-[13px] text-[#EDEDED]">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <BarsChart days={days} values={(metric === 'clicks' ? sc.clicks : sc.impressions) ?? []} height={180} emptyLabel="Sin datos de Google en el periodo" />
      <p className="m-0 mt-3 font-mono text-[11px] leading-relaxed text-[#5C5C5C]">
        Datos de Google: población distinta al embudo (búsquedas y clics, no personas ni instalaciones){days.length ? `; último día publicado: ${days[days.length - 1]}` : ''}.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#5C5C5C]">Búsquedas</div>
          <TableScroll minWidth={420}>
            <thead><tr><th className={th}>Búsqueda</th><th className={`${th} text-right`}>Clics</th><th className={`${th} text-right`}>Impr.</th><th className={`${th} text-right`}>CTR</th><th className={`${th} text-right`}>Pos.</th></tr></thead>
            <tbody>
              {(sc.topQueries ?? []).map((q) => (
                <tr key={q.query} className={tr}>
                  <td className={td}><div className="max-w-[220px] truncate text-[12.5px]" title={q.query}>{q.query}</div></td>
                  <td className={`${td} text-right font-mono text-[12px]`}>{fmtInt(q.clicks)}</td>
                  <td className={`${td} text-right font-mono text-[12px] text-[#8B8B8B]`}>{fmtCompact(q.impressions)}</td>
                  <td className={`${td} text-right font-mono text-[12px] text-[#8B8B8B]`}>{q.impressions >= MIN_BASE ? fmtPct(q.ctr, 1) : share(q.clicks, q.impressions)}</td>
                  <td className={`${td} text-right font-mono text-[12px] text-[#8B8B8B]`}>{q.position != null ? fmtDec(q.position) : '—'}</td>
                </tr>
              ))}
              {!sc.topQueries?.length && <tr><td className={`${td} font-mono text-[11px] text-[#5C5C5C]`} colSpan={5}>Sin búsquedas todavía</td></tr>}
            </tbody>
          </TableScroll>
        </div>
        <div className="min-w-0">
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#5C5C5C]">Páginas</div>
          <TableScroll minWidth={320}>
            <thead><tr><th className={th}>Página</th><th className={`${th} text-right`}>Clics</th><th className={`${th} text-right`}>Impr.</th></tr></thead>
            <tbody>
              {(sc.topPages ?? []).map((p) => (
                <tr key={p.page} className={tr}>
                  <td className={td}><div className="max-w-[240px] truncate font-mono text-[12px]" title={p.page}>{path(p.page)}</div></td>
                  <td className={`${td} text-right font-mono text-[12px]`}>{fmtInt(p.clicks)}</td>
                  <td className={`${td} text-right font-mono text-[12px] text-[#8B8B8B]`}>{fmtCompact(p.impressions)}</td>
                </tr>
              ))}
              {!sc.topPages?.length && <tr><td className={`${td} font-mono text-[11px] text-[#5C5C5C]`} colSpan={3}>Sin páginas todavía</td></tr>}
            </tbody>
          </TableScroll>
        </div>
      </div>
    </Card>
  );
}
