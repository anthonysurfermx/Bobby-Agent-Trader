// The dashboard's left rail: workspace row, sections as nav items, a search shortcut, external links
// (ACCESOS) and platforms. Collapses to icons on desktop and lives in a drawer on phones.
import type { ComponentType, ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronsUpDown, LogOut, PanelLeftClose, PanelLeftOpen, Search, type LucideProps } from 'lucide-react';
import { fmtCompact } from './format';
import { TABS, type TabId } from './nav';


const ACCESS = [
  { name: 'bobbyprotocol.xyz', href: 'https://bobbyprotocol.xyz', tag: 'Sitio', color: '#F28C38' },
  { name: 'App Store Connect', href: 'https://appstoreconnect.apple.com/apps/6804460489', tag: 'Apple', color: '#4FB3FF' },
  { name: 'RevenueCat', href: 'https://app.revenuecat.com', tag: 'Pagos', color: '#F25A5A' },
  { name: 'Vercel', href: 'https://vercel.com/anthonysurfermxs-projects/bobby-agent-trader', tag: 'Hosting', color: '#EDEDED' },
  { name: 'Supabase', href: 'https://supabase.com/dashboard/project/qbvdqkknnuweatptjohi', tag: 'Datos', color: '#3ECF8E' },
];

const LOGO = '/favicon-bobby-orb-2026-09-30.png';

function Item({ icon: Icon, label, active, collapsed, onClick, right }: {
  icon: ComponentType<LucideProps>; label: string; active?: boolean; collapsed?: boolean; onClick: () => void; right?: ReactNode;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined}
      className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C38] ${collapsed ? 'justify-center' : ''} ${active ? 'bg-white/[0.05] text-[#EDEDED]' : 'text-[#BDBDBD] hover:bg-white/[0.03] hover:text-[#EDEDED]'}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#EDEDED]' : 'text-[#8B8B8B]'}`} strokeWidth={1.6} aria-hidden />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && right}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1.5 pt-6 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#5C5C5C]">{children}</div>;
}

export default function Sidebar({ tab, onSelect, onSearch, collapsed, onToggleCollapse, email, onSignOut, platforms }: {
  tab: TabId; onSelect: (id: TabId) => void; onSearch: () => void; collapsed: boolean; onToggleCollapse?: () => void;
  email: string; onSignOut: () => void; platforms: { web: number; ios: number; days: number } | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col font-sans">
      <div className={`flex h-14 shrink-0 items-center gap-1 px-3 ${collapsed ? 'justify-center' : ''}`}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C38]"
              aria-label="Cambiar de espacio"
            >
              <img src={LOGO} alt="" className="h-5 w-5 shrink-0 rounded-md" />
              {!collapsed && <span className="truncate text-[14px] font-medium text-[#EDEDED]">Bobby</span>}
              {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[#5C5C5C]" aria-hidden />}
            </button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content align="start" sideOffset={6} className="z-[60] min-w-[220px] rounded-xl border border-white/[0.08] bg-[#141415] p-1 font-sans text-[13px] text-[#EDEDED] shadow-2xl">
              <Menu.Label className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#5C5C5C]">Bobby · Admin</Menu.Label>
              <Menu.Item asChild><a href="/desk" className="flex cursor-pointer items-center rounded-lg px-2 py-1.5 outline-none data-[highlighted]:bg-white/[0.06]">Abrir Bobby</a></Menu.Item>
              <Menu.Item asChild><a href="/protocol" className="flex cursor-pointer items-center rounded-lg px-2 py-1.5 outline-none data-[highlighted]:bg-white/[0.06]">Protocolo</a></Menu.Item>
              <Menu.Separator className="my-1 h-px bg-white/[0.06]" />
              <Menu.Item onSelect={onSignOut} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[#F06A6A] outline-none data-[highlighted]:bg-white/[0.06]">
                <LogOut className="h-3.5 w-3.5" aria-hidden />Cerrar sesión
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
        {onToggleCollapse && !collapsed && (
          <button
            type="button" onClick={onToggleCollapse} aria-label="Contraer barra lateral" title="Contraer barra lateral"
            className="ml-auto rounded-md p-1.5 text-[#5C5C5C] hover:bg-white/[0.04] hover:text-[#EDEDED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C38]"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}
      </div>

      <nav aria-label="Secciones" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
        <div className="flex flex-col gap-0.5">
          <Item
            icon={Search} label="Buscar" collapsed={collapsed} onClick={onSearch}
            right={<kbd className="rounded border border-white/[0.08] px-1.5 font-mono text-[10px] text-[#5C5C5C]">/</kbd>}
          />
          {TABS.map((t) => <Item key={t.id} icon={t.icon} label={t.label} active={tab === t.id} collapsed={collapsed} onClick={() => onSelect(t.id)} />)}
        </div>

        {!collapsed && (
          <>
            <SectionLabel>Accesos</SectionLabel>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {ACCESS.map((a) => (
                <li key={a.name}>
                  <a
                    href={a.href} target="_blank" rel="noreferrer"
                    className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13.5px] text-[#BDBDBD] hover:bg-white/[0.03] hover:text-[#EDEDED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C38]"
                  >
                    <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: a.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-[#5C5C5C]">{a.tag}</span>
                  </a>
                </li>
              ))}
            </ul>

            <SectionLabel>{platforms ? `Lecturas · ${platforms.days}D` : 'Plataformas'}</SectionLabel>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {([['Web', '#4FB3FF', platforms?.web], ['iOS', '#F28C38', platforms?.ios]] as const).map(([name, color, reads]) => (
                <li key={name}>
                  <button
                    type="button" onClick={() => onSelect('funnel')}
                    className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13.5px] text-[#BDBDBD] hover:bg-white/[0.03] hover:text-[#EDEDED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C38]"
                  >
                    <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {reads != null && <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-[#5C5C5C]">{fmtCompact(reads)} lect</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className={`flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-3 py-3 ${collapsed ? 'flex-col' : ''}`}>
        {!collapsed && <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[#5C5C5C]" title={email}>{email}</span>}
        {collapsed && onToggleCollapse && (
          <button type="button" onClick={onToggleCollapse} aria-label="Expandir barra lateral" title="Expandir barra lateral" className="rounded-md p-1.5 text-[#5C5C5C] hover:bg-white/[0.04] hover:text-[#EDEDED]">
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}
        <button type="button" onClick={onSignOut} aria-label="Cerrar sesión" title="Cerrar sesión" className="rounded-md p-1.5 text-[#5C5C5C] hover:bg-white/[0.04] hover:text-[#EDEDED]">
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}
