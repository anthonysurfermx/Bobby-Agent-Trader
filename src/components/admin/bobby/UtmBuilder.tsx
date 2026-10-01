// "Enlaces con UTM": builds a tagged bobbyprotocol.xyz link to share in a post, a bio or a DM. /api/track keeps
// utm_source on the visit, so the installs that arrive through it show up under that source in "De dónde llegan".
// Pure client side: nothing is saved.
import { useState } from 'react';
import { Card, CardHead, CopyButton, Field, Segmented, TextInput } from './ui';

const ORIGIN = 'https://bobbyprotocol.xyz';
type Dest = '/desk' | '/' | '/protocol';
const DESTS: Array<{ value: Dest; label: string }> = [
  { value: '/desk', label: '/desk' },
  { value: '/', label: 'Inicio' },
  { value: '/protocol', label: '/protocol' },
];

// The same alphabet the server accepts for a source tag: lowercase, digits, _ . -
const tag = (v: string) => v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_.-]/g, '').slice(0, 40);

export default function UtmBuilder() {
  const [dest, setDest] = useState<Dest>('/desk');
  const [source, setSource] = useState('');
  const [medium, setMedium] = useState('');
  const [campaign, setCampaign] = useState('');

  const params = new URLSearchParams();
  if (source) params.set('utm_source', source);
  if (medium) params.set('utm_medium', medium);
  if (campaign) params.set('utm_campaign', campaign);
  const url = `${ORIGIN}${dest}${source ? `?${params.toString()}` : ''}`;

  return (
    <Card>
      <CardHead title="Enlaces con UTM" sub="Etiqueta cada enlace que compartas para saber qué canal trae gente que sí lee." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] text-[#8B8B8B]">Destino</span>
          <Segmented<Dest> label="Destino" value={dest} onChange={setDest} options={DESTS} />
        </div>
        <Field label="Fuente (obligatoria)" hint="tiktok, instagram, x, newsletter…">
          <TextInput mono value={source} onChange={(e) => setSource(tag(e.target.value))} placeholder="tiktok" autoCapitalize="none" spellCheck={false} aria-required />
        </Field>
        <Field label="Medio (opcional)" hint="bio, post, dm, ad…">
          <TextInput mono value={medium} onChange={(e) => setMedium(tag(e.target.value))} placeholder="bio" autoCapitalize="none" spellCheck={false} />
        </Field>
        <Field label="Campaña (opcional)" hint="lanzamiento-oct…">
          <TextInput mono value={campaign} onChange={(e) => setCampaign(tag(e.target.value))} placeholder="lanzamiento" autoCapitalize="none" spellCheck={false} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0F0F10] px-3 py-2.5">
        <code className={`min-w-0 flex-1 break-all font-mono text-[12px] ${source ? 'text-[#EDEDED]' : 'text-[#5C5C5C]'}`}>{url}</code>
        {source ? <CopyButton text={url} variant="secondary" /> : <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#5C5C5C]">Escribe una fuente</span>}
      </div>
      <p className="m-0 mt-3 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
        /api/track guarda utm_source en la visita; las instalaciones que lleguen por este enlace aparecen solas como «fuente (UTM)» en «De dónde llegan». Cuenta la primera llegada de cada navegador. Medio y campaña quedan en el enlace pero hoy no se registran.
      </p>
    </Card>
  );
}
