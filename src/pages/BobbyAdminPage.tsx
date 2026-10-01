import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu as MenuIcon, RefreshCw } from 'lucide-react';
import { bobbySupabase } from '@/lib/bobby-db-client';
import { rememberReturn } from '@/lib/access-client';
import { adminMockMode, fetchAdminMe, fetchAdminOverview, type AdminMe, type AdminPeriod, type OverviewResponse } from '@/lib/admin-client';
import { ErrorState, IconBtn, Loading, Segmented, StaleBanner } from '@/components/admin/bobby/ui';
import { integrationProblems } from '@/components/admin/bobby/health';
import { fmtInt, fmtUsd } from '@/components/admin/bobby/format';
import { compareSeries } from '@/components/admin/bobby/deltas';
import { TABS, type TabId } from '@/components/admin/bobby/nav';
import { toAdminError, useLoad } from '@/components/admin/bobby/useLoad';
import Sidebar from '@/components/admin/bobby/Sidebar';
import OverviewTab from '@/components/admin/bobby/OverviewTab';
import FunnelTab from '@/components/admin/bobby/FunnelTab';
import UsersTab from '@/components/admin/bobby/UsersTab';
import MembershipsTab from '@/components/admin/bobby/MembershipsTab';
import CouponsTab from '@/components/admin/bobby/CouponsTab';
import LlmTab from '@/components/admin/bobby/LlmTab';
import IntegrationsTab from '@/components/admin/bobby/IntegrationsTab';

/**
 * /admin — Bobby's owner dashboard: accounts, reads, funnel, memberships, coupons, LLM spend and
 * integrations. The page signs in with the same Apple/Google session as the rest of the web; /api/admin
 * decides who is an admin (401 → sign in, 403 not_admin → switch accounts). Dev: /admin?mock.
 */

const PERIODS: AdminPeriod[] = [7, 30, 90];
const LOGO = '/favicon-bobby-orb-2026-09-30.png';
const COLLAPSE_KEY = 'bobby:admin:sidebar-collapsed';

type Gate =
  | { kind: 'loading' }
  | { kind: 'signin' }
  | { kind: 'not_admin'; email: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; me: AdminMe };

function readTab(): TabId {
  const h = window.location.hash.replace(/^#/, '');
  return (TABS.find((t) => t.id === h)?.id ?? 'resumen') as TabId;
}

async function sessionEmail(): Promise<string | null> {
  if (adminMockMode()) return 'invitado@example.com';
  try { const { data } = await bobbySupabase().auth.getSession(); return data.session?.user?.email ?? null; } catch { return null; }
}

async function signOut() {
  if (adminMockMode()) return;
  try { await bobbySupabase().auth.signOut(); } catch { /* already signed out */ }
}

const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };
const writeCollapsed = (v: boolean) => { try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* private mode */ } };

// ---------------------------------------------------------------- gates

function GateShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-[#0B0B0C] px-4 py-12 font-sans text-[#EDEDED]">
      <div className="flex w-full max-w-[380px] flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#141415] p-6">
        <div className="mb-2 flex items-center gap-2">
          <img src={LOGO} alt="" className="h-6 w-6 rounded-md" />
          <span className="text-[15px] font-medium">Bobby</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#5C5C5C]">admin</span>
        </div>
        {children}
      </div>
    </main>
  );
}

const gateBtn = 'h-11 w-full rounded-xl text-[14px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F28C38] disabled:opacity-60';

function SignInGate() {
  const go = (provider: 'apple' | 'google') => {
    rememberReturn('/admin');
    window.location.assign(`/signin?provider=${provider}`);
  };
  return (
    <GateShell>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#5C5C5C]">Solo administradores</span>
      <h1 className="m-0 text-[24px] font-medium tracking-[-0.02em]">Inicia sesión</h1>
      <p className="m-0 mb-1 text-[14px] leading-relaxed text-[#8B8B8B]">Entra con la cuenta de Apple o Google que tiene acceso de administrador en Bobby.</p>
      <button type="button" onClick={() => go('apple')} className={`${gateBtn} bg-[#EDEDED] text-[#0B0B0C] hover:bg-white`}>Continuar con Apple</button>
      <button type="button" onClick={() => go('google')} className={`${gateBtn} border border-white/[0.08] bg-[#1A1A1B] text-[#EDEDED] hover:bg-[#202021]`}>Continuar con Google</button>
    </GateShell>
  );
}

function NotAdminGate({ email, onSignedOut }: { email: string | null; onSignedOut: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <GateShell>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#F06A6A]">Sin acceso</span>
      <h1 className="m-0 text-[24px] font-medium leading-tight tracking-[-0.02em]">Esta cuenta no es administradora</h1>
      <p className="m-0 text-[14px] leading-relaxed text-[#8B8B8B]">
        {email ? <>Entraste como <span className="break-all font-mono text-[12.5px] text-[#EDEDED]">{email}</span>. </> : null}
        Cierra sesión y entra con la cuenta que tiene acceso.
      </p>
      <button
        type="button" disabled={busy}
        onClick={async () => { setBusy(true); await signOut(); onSignedOut(); }}
        className={`${gateBtn} border border-white/[0.08] bg-[#1A1A1B] text-[#EDEDED] hover:bg-[#202021]`}
      >
        {busy ? 'Cerrando sesión…' : 'Cerrar sesión y cambiar de cuenta'}
      </button>
      <a href="/desk" className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#5C5C5C] hover:text-[#8B8B8B]">Volver a Bobby</a>
    </GateShell>
  );
}

// ---------------------------------------------------------------- dashboard

function headerCount(tab: TabId, d: OverviewResponse | null): string | null {
  if (!d) return null;
  const o = d.overview;
  switch (tab) {
    case 'resumen': case 'usuarios': return `${fmtInt(o.accounts.total)} cuentas`;
    case 'funnel': return `${fmtInt(o.funnel.web.visitors)} visitantes`;
    case 'membresias': return `${fmtInt(o.subscriptions.active)} activas`;
    case 'cupones': return `${fmtInt(o.coupons.active)} activos`;
    case 'ia': return `${fmtUsd(o.llm.providers.anthropic.month + o.llm.providers.openai.month)} 30d`;
    case 'integraciones': { const n = integrationProblems(d.integrations).length; return n ? `${n} pendientes` : 'todo conectado'; }
  }
}

function Dashboard({ me, onAuthLost, onSignedOut }: { me: AdminMe; onAuthLost: (status: number) => void; onSignedOut: () => void }) {
  const [period, setPeriod] = useState<AdminPeriod>(30);
  const [tab, setTab] = useState<TabId>(readTab);
  const [refreshKey, setRefreshKey] = useState(0);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);
  const [flash, setFlash] = useState<{ id: number; text: string; ok: boolean } | null>(null);
  const flashId = useRef(0);
  const overview = useLoad(() => fetchAdminOverview(period), `${period}|${refreshKey}`);
  // Twice the window, for "vs periodo anterior". Optional: if it fails the deltas just do not show.
  const compare = useLoad(() => fetchAdminOverview(Math.min(period * 2, 365), { compare: true }), `cmp|${period}|${refreshKey}`);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const s = overview.error?.status;
    if (s === 401 || s === 403) onAuthLost(s);
  }, [overview.error, onAuthLost]);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);

  const selectTab = useCallback((id: TabId) => {
    setTab(id);
    setDrawer(false);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${id}`);
  }, []);
  const openSearch = useCallback(() => { selectTab('usuarios'); setFocusSearch(true); }, [selectTab]);

  // "/" anywhere (outside a text field) jumps to the user search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      openSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  const toggleCollapse = () => setCollapsed((c) => { writeCollapsed(!c); return !c; });
  const notify = useCallback((text: string, ok = true) => setFlash({ id: ++flashId.current, text, ok }), []);
  const reloadOverview = overview.reload;
  const reloadCompare = compare.reload;
  const onChanged = useCallback(() => { void reloadOverview(true); void reloadCompare(true); }, [reloadOverview, reloadCompare]);
  const onSearchFocused = useCallback(() => setFocusSearch(false), []);
  const doSignOut = useCallback(async () => { await signOut(); onSignedOut(); }, [onSignedOut]);

  const needsOverview = tab !== 'usuarios' && tab !== 'cupones';
  const o = overview.data && overview.dataKey?.split('|')[0] === String(period) ? overview.data : null;
  // Never mix ranges: the comparison is used only when it was loaded for this exact period and refresh, and
  // the overview only while its data belongs to the selected period (a refresh may keep showing it).
  const cmp = compare.data && !compare.stale && !compare.error ? compareSeries(compare.data.overview) : null;
  const current = TABS.find((t) => t.id === tab)!;
  const count = headerCount(tab, o);
  const reads = o?.overview.activity.readsDaily;
  const platforms = reads ? { web: reads.web.reduce((a, b) => a + b, 0), ios: reads.ios.reduce((a, b) => a + b, 0) } : null;
  const email = me.email ?? me.identityId;

  const sidebarProps = { tab, onSelect: selectTab, onSearch: () => { setDrawer(false); openSearch(); }, email, onSignOut: () => void doSignOut(), platforms };

  return (
    <div className="min-h-[100svh] bg-[#0B0B0C] font-sans text-[#EDEDED]">
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden border-r border-white/[0.06] bg-[#0F0F10] md:block"
        style={{ width: collapsed ? 64 : 240 }}
      >
        <Sidebar {...sidebarProps} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </aside>

      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 md:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] border-r border-white/[0.06] bg-[#0F0F10] text-[#EDEDED] shadow-2xl focus:outline-none md:hidden">
            <Dialog.Title className="sr-only">Menú</Dialog.Title>
            <Dialog.Description className="sr-only">Secciones del panel de Bobby</Dialog.Description>
            <Sidebar {...sidebarProps} collapsed={false} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className={collapsed ? 'md:pl-16' : 'md:pl-[240px]'}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-white/[0.06] bg-[#0B0B0C]/85 px-4 backdrop-blur-md md:px-6">
          <IconBtn label="Abrir menú" className="-ml-1.5 md:hidden" onClick={() => setDrawer(true)}><MenuIcon className="h-4 w-4" strokeWidth={1.6} /></IconBtn>
          <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
            <h1 className="m-0 shrink-0 text-[14px] font-medium">{current.label}</h1>
            {count && <span className="hidden truncate font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#5C5C5C] sm:inline">{count}</span>}
            {adminMockMode() && <span className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-[#F7A04B] sm:inline">mock</span>}
          </div>
          <Segmented<AdminPeriod> label="Periodo" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: `${p}D` }))} />
          <span className="hidden max-w-[220px] truncate font-mono text-[11px] text-[#5C5C5C] lg:inline" title={email}>{email}</span>
          <IconBtn label="Actualizar" onClick={() => setRefreshKey((k) => k + 1)} disabled={overview.loading && !!o}>
            <RefreshCw className={`h-4 w-4 ${overview.loading && o ? 'animate-spin' : ''}`} strokeWidth={1.6} />
          </IconBtn>
        </header>

        <main className="mx-auto w-full max-w-[1240px] px-4 py-5 md:px-6 md:py-6" aria-label={current.label}>
          {needsOverview && !o ? (
            overview.error ? <ErrorState message={overview.error.message} onRetry={() => void overview.reload()} /> : <Loading label="Cargando el resumen" />
          ) : (
            <>
              {needsOverview && overview.error && (
                <div className="mb-4"><StaleBanner error={overview.error} onRetry={() => void overview.reload()} /></div>
              )}
              {tab === 'resumen' && o && <OverviewTab data={o} period={period} cmp={cmp} />}
              {tab === 'funnel' && o && <FunnelTab data={o} period={period} cmp={cmp} refreshKey={refreshKey} notify={notify} />}
              {tab === 'usuarios' && <UsersTab me={me} refreshKey={refreshKey} notify={notify} onChanged={onChanged} focusSearch={focusSearch} onSearchFocused={onSearchFocused} />}
              {tab === 'membresias' && o && <MembershipsTab data={o} period={period} refreshKey={refreshKey} cmp={cmp} />}
              {tab === 'cupones' && <CouponsTab refreshKey={refreshKey} notify={notify} onChanged={onChanged} />}
              {tab === 'ia' && o && <LlmTab data={o} period={period} cmp={cmp} notify={notify} onChanged={onChanged} />}
              {tab === 'integraciones' && o && <IntegrationsTab data={o} period={period} refreshKey={refreshKey} />}
            </>
          )}
        </main>
      </div>

      <div aria-live="polite" className={`pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 ${collapsed ? 'md:pl-16' : 'md:pl-[240px]'}`}>
        {flash && (
          <div
            key={flash.id}
            className={`pointer-events-auto flex max-w-[480px] items-center gap-2.5 rounded-xl border bg-[#141415] px-4 py-2.5 text-[13px] shadow-2xl ${flash.ok ? 'border-white/[0.08] text-[#EDEDED]' : 'border-[#F06A6A]/35 text-[#F3B0B0]'}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${flash.ok ? 'bg-[#4ADE80]' : 'bg-[#F06A6A]'}`} aria-hidden />
            {flash.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function BobbyAdminPage() {
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });

  const check = useCallback(async () => {
    setGate({ kind: 'loading' });
    try {
      setGate({ kind: 'ok', me: await fetchAdminMe() });
    } catch (e) {
      const err = toAdminError(e);
      if (err.status === 401) setGate({ kind: 'signin' });
      else if (err.status === 403) setGate({ kind: 'not_admin', email: await sessionEmail() });
      else setGate({ kind: 'error', message: err.message });
    }
  }, []);
  useEffect(() => { void check(); }, [check]);

  const onAuthLost = useCallback((status: number) => {
    if (status === 401) setGate({ kind: 'signin' });
    else void sessionEmail().then((email) => setGate({ kind: 'not_admin', email }));
  }, []);
  const onSignedOut = useCallback(() => setGate({ kind: 'signin' }), []);

  return (
    <>
      <Helmet>
        <title>Admin | Bobby</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      {gate.kind === 'loading' && <main className="min-h-[100svh] bg-[#0B0B0C]"><Loading label="Revisando tu cuenta" /></main>}
      {gate.kind === 'signin' && <SignInGate />}
      {gate.kind === 'not_admin' && <NotAdminGate email={gate.email} onSignedOut={onSignedOut} />}
      {gate.kind === 'error' && (
        <GateShell>
          <ErrorState message={gate.message} onRetry={() => void check()} />
        </GateShell>
      )}
      {gate.kind === 'ok' && <Dashboard me={gate.me} onAuthLost={onAuthLost} onSignedOut={onSignedOut} />}
    </>
  );
}
