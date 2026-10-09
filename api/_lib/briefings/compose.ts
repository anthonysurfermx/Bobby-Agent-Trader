// ============================================================
// Bobby Pro market briefings — deterministic personal composition (spec §8, D1, D2). No I/O, no model call.
// The "personal synthesis" is a selection over shared content: which asset sections, whether beginner
// explainers and the risk detail are attached. Nothing here writes new prose.
//   · Weekly asset order: consented asked assets first; explicit interests only if no allowed queries, then general.
//     Legacy order: frozen followed assets first; then, only when memory is allowed (analysis consent current,
//     memory enabled, BOBBY_BRIEFINGS_MEMORY=on — decided by the caller) the memory's frequent assets; then, if
//     still nothing, config.DEFAULT_ASSETS. ≤ LIMITS.assetsPerAccount, supported symbols only.
//   · usesMemory is true exactly when memory changed the content (an added asset, beginner explainers, the risk
//     detail); memoryAssets lists the memory-derived symbols actually included. The privacy triggers use both
//     to withdraw a report when memory is paused, deleted or a symbol forgotten.
//   · Weekly narration: personal retrospective first, common coming-week context second, ≤ 3 blocks/1,200 chars.
//     Legacy narration remains bounded to 4 segments/2,400 chars; explainers are never narrated. Readers with the
//     same blocks get byte-identical segments, hence the same audio cache key. No name is ever an input here.
//   · Section facts and statuses come from the narrative, which copied them from evidence.
// ============================================================
import { createHash } from 'node:crypto';
import { CONSENT_VERSIONS, DEFAULT_ASSETS, LIMITS, isSupportedAsset } from './config.js';
import { NARRATIVE_LIMITS, clip, factsOnlyAssetSection, riskDetail } from './narrative.js';
import type {
  BriefContent, BriefEvidence, BriefLanguage, BriefQuality, BriefSection, Cadence, ComposerMemory, FrozenSettings, Period, SharedNarrative,
} from './types.js';
import { BRIEF_LANGUAGES, CADENCES } from './types.js';
import { explanationFor } from '../learning-context.js';
import { buildLearningOpportunity, isLearningOpportunity, type LearningOpportunityOptions } from '../learning-opportunity.js';

const TITLES: Record<BriefLanguage, Record<Cadence, string>> = {
  es: { morning: 'Apertura de mercado', close: 'Cierre de mercado', weekly: 'Resumen semanal' },
  en: { morning: 'Market opening', close: 'Market close', weekly: 'Weekly briefing' },
  fr: { morning: 'Ouverture du marché', close: 'Clôture du marché', weekly: 'Résumé hebdomadaire' },
  pt: { morning: 'Abertura do mercado', close: 'Fecho do mercado', weekly: 'Resumo semanal' },
  'pt-BR': { morning: 'Abertura do mercado', close: 'Fechamento do mercado', weekly: 'Resumo semanal' },
  it: { morning: 'Apertura del mercato', close: 'Chiusura del mercato', weekly: 'Riepilogo settimanale' },
  de: { morning: 'Marktöffnung', close: 'Marktschluss', weekly: 'Wochenüberblick' },
};

function reportTitle(period: Period, lang: BriefLanguage): string {
  const when = period.cadence === 'weekly' ? period.periodKey.replace('_', ' – ') : period.periodKey;
  return `${TITLES[lang][period.cadence]} · ${when}`;
}

const normalize = (list: readonly string[] | null | undefined): string[] => {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (s && isSupportedAsset(s) && !out.includes(s)) out.push(s);
  }
  return out;
};

/** Copy of a section without the explainer (explainers are attached only for readers who asked for them). */
function bare(s: BriefSection): BriefSection {
  const { explainer: _drop, ...rest } = s;
  return { ...rest, facts: rest.facts ? rest.facts.map((f) => ({ ...f })) : undefined };
}
const oneLine = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Pack whole parts into ≤ segmentChars pieces (a part never exceeds the limit: bodies are ≤ 420 chars). */
function packBlock(parts: string[]): string[] {
  const out: string[] = [];
  let cur = '';
  for (const raw of parts) {
    const p = clip(oneLine(raw), LIMITS.segmentChars);
    if (!p) continue;
    if (!cur) cur = p;
    else if (cur.length + 1 + p.length <= LIMITS.segmentChars) cur = `${cur} ${p}`;
    else { out.push(cur); cur = p; }
  }
  if (cur) out.push(cur);
  return out;
}

function narration(opening: string, sections: BriefSection[], cadence: Cadence): string[] {
  const of = (k: BriefSection['kind']) => sections.filter((s) => s.kind === k);
  const market = of('market')[0];
  const assets = of('asset').slice(0, 2);
  const risks = of('risks')[0];
  const agenda = of('agenda')[0];
  const weekly = cadence === 'weekly';
  const blocks: string[][] = weekly ? [] : [[opening, market?.body ?? '']];
  // A block that cannot fit keeps only its leading whole parts (the first asset, the risks).
  const fit = (parts: string[]) => {
    const packed = packBlock(parts);
    return packed.length ? [packed[0]] : [];
  };
  if (weekly) {
    // Personal retrospective first, then the shared coming-week context. The full asset list stays in text.
    blocks.push([opening, ...assets.map(a => `${a.title}. ${a.body}`)]);
    blocks.push([market?.body ?? '', agenda?.body ?? '']);
    if (risks) blocks.push([risks.body]);
  } else {
    if (assets.length) blocks.push(assets.map((a) => `${a.title}. ${a.body}`));
    if (risks || agenda) blocks.push([risks?.body ?? '', agenda?.body ?? '']);
  }
  const maxSegments = weekly ? LIMITS.weeklyNarrationSegments : LIMITS.narrationSegments;
  const maxChars = weekly ? LIMITS.weeklyNarrationChars : LIMITS.narrationChars;
  const out: string[] = [];
  let total = 0;
  for (const b of blocks) {
    for (const seg of fit(b)) {
      if (out.length >= maxSegments || total + seg.length > maxChars) return out;
      out.push(seg);
      total += seg.length;
    }
  }
  return out;
}

export function composeReport(input: {
  period: Period; frozen: FrozenSettings; memory: ComposerMemory | null; memoryAllowed: boolean; narrative: SharedNarrative; evidence: BriefEvidence;
  learning?: LearningOpportunityOptions;
}): { content: BriefContent; quality: BriefQuality; usesMemory: boolean; memoryAssets: string[] } {
  const { period, frozen, narrative, evidence } = input;
  const learning = input.learning?.enabled === true;
  const memory = input.memoryAllowed && (!learning || frozen.analysisConsent && frozen.analysisConsentVersion === CONSENT_VERSIONS.analysis) ? input.memory : null;
  const lang = narrative.language;
  const weekly = period.cadence === 'weekly';

  // ---- asset selection ----
  const asked = normalize(memory?.frequentAssets).slice(0, LIMITS.assetsPerAccount);
  const interests = normalize(frozen.assets).slice(0, LIMITS.assetsPerAccount);
  // Opportunity rollout cannot let history without authored/exposed lineage displace an explicit follow.
  const selected = weekly && asked.length ? learning ? normalize([...interests, ...asked]).slice(0, LIMITS.assetsPerAccount) : [...asked] : [...interests];
  const personalBasis = asked.length ? 'asked_assets' : interests.length ? 'explicit_interests' : 'general';
  const memoryAssets: string[] = [];
  if (weekly && asked.length) memoryAssets.push(...asked.filter(s => selected.includes(s)));
  if (!weekly && memory) {
    for (const s of normalize(memory.frequentAssets)) {
      if (selected.length >= LIMITS.assetsPerAccount) break;
      if (!selected.includes(s)) { selected.push(s); memoryAssets.push(s); }
    }
  }
  if (!selected.length) selected.push(...normalize(DEFAULT_ASSETS).slice(0, LIMITS.assetsPerAccount));

  const explain = learning ? explanationFor(memory).experience === 'new' : memory?.experience === 'new';
  const deepRisk = memory?.explainRiskDepth === 'high';

  // ---- sections ----
  const sections: BriefSection[] = weekly ? [] : [bare(narrative.market)];
  let fellBack = false;
  let explainersUsed = false;
  for (const symbol of selected) {
    const quote = evidence.quotes.find(q => q.symbol === symbol);
    const historical = !weekly || (quote?.changeBasis === '7d' && evidence.history?.some(h => h.symbol === symbol));
    const shared = historical ? narrative.assets[symbol] : undefined;
    const safeEvidence = historical ? evidence : { ...evidence, quotes: evidence.quotes.filter(q => q.symbol !== symbol) };
    const base = shared ?? factsOnlyAssetSection(safeEvidence, lang, symbol);
    if (!shared) fellBack = true;
    const s = bare(base);
    if (weekly) s.title = `${symbol} · ${({ es: 'Semana anterior', en: 'Previous week', fr: 'Semaine précédente', pt: 'Semana anterior', 'pt-BR': 'Semana anterior', it: 'Settimana precedente', de: 'Vorherige Woche' })[lang]}`;
    if (explain && shared?.explainer) { s.explainer = shared.explainer; explainersUsed = true; }
    sections.push(s);
  }
  if (weekly) sections.push(bare(narrative.market));
  const risks = bare(narrative.risks);
  let riskDetailUsed = false;
  if (deepRisk) {
    const detail = riskDetail(evidence, lang, NARRATIVE_LIMITS.explainer);
    if (detail) { risks.explainer = detail; riskDetailUsed = true; }
  }
  sections.push(risks, bare(narrative.agenda));
  if (period.cadence === 'weekly') {
    // Keep the full selected list available in text, with compact shared prose for a light briefing.
    for (const s of sections) s.body = clip(s.body, 220);
  }
  for (const s of sections) if (s.facts === undefined) delete s.facts;

  const content: BriefContent = {
    version: 1,
    cadence: period.cadence,
    language: lang,
    title: reportTitle(period, lang),
    opening: period.cadence === 'weekly' ? clip(narrative.opening, 140) : narrative.opening,
    ...(weekly ? { personalBasis } : {}),
    sections,
    narrationSegments: narration(period.cadence === 'weekly' ? clip(narrative.opening, 140) : narrative.opening, sections, period.cadence),
    dataAsOf: evidence.dataAsOf,
    sources: evidence.sources.map((s) => ({ ...s })),
    equitySession: { ...evidence.equitySession },
  };

  if (learning) {
    const opportunity = buildLearningOpportunity({ period, frozen, memory, memoryAllowed: memory !== null, evidence, content, options: input.learning! });
    if (opportunity) {
      content.learningOpportunity = opportunity;
    }
  }

  const quality: BriefQuality = narrative.source === 'facts_only' ? 'facts_only' : evidence.degraded || fellBack ? 'partial' : 'full';
  // A default explanation is not memory; declared preferences in metadata still require privacy withdrawal.
  const usesMemory = memory !== null && (memoryAssets.length > 0 || explainersUsed && (!learning || memory.experience === 'new') || riskDetailUsed || !!content.learningOpportunity && (content.learningOpportunity.context.explanation.source === 'explicit' || content.learningOpportunity.context.explanation.explainRiskDepth !== undefined));
  return { content, quality, usesMemory, memoryAssets: usesMemory ? memoryAssets : [] };
}

const KINDS = new Set(['market', 'asset', 'risks', 'agenda', 'week']);
const STATUSES = new Set(['live', 'delayed', 'closed', 'stale', 'missing', '24_7', 'partial']);
const isStr = (v: unknown, max: number, min = 1): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const isIsoOrNull = (v: unknown) => v === null || (typeof v === 'string' && Number.isFinite(Date.parse(v)));

/** null = valid; otherwise a short error code. Run before publish; content stays immutable afterwards. */
export function validateContent(content: BriefContent): string | null {
  let bytes: number;
  try { bytes = Buffer.byteLength(JSON.stringify(content), 'utf8'); } catch { return 'unserializable'; }
  if (bytes > LIMITS.reportBytes) return 'too_large';
  if (!content || content.version !== 1) return 'bad_version';
  if (!(CADENCES as readonly string[]).includes(content.cadence)) return 'bad_cadence';
  if (!(BRIEF_LANGUAGES as readonly string[]).includes(content.language)) return 'bad_language';
  if (!isStr(content.title, 120) || !isStr(content.opening, NARRATIVE_LIMITS.opening)) return 'bad_header';
  if (!isIsoOrNull(content.dataAsOf) || content.dataAsOf === null) return 'bad_data_as_of';
  if (!Array.isArray(content.sources) || !content.equitySession || typeof content.equitySession.state !== 'string') return 'bad_evidence';
  if (content.learningOpportunity !== undefined && !isLearningOpportunity(content.learningOpportunity)) return 'bad_learning_opportunity';
  const sections = content.sections;
  if (!Array.isArray(sections) || sections.length < 1) return 'bad_sections';
  const assets = sections.filter((s) => s?.kind === 'asset');
  if (assets.length > LIMITS.assetsPerAccount || sections.length > LIMITS.assetsPerAccount + 4) return 'too_many_sections';
  if (!sections.some((s) => s?.kind === 'market')) return 'missing_market';
  for (const s of sections) {
    if (!s || !KINDS.has(s.kind) || !STATUSES.has(s.status)) return 'bad_section';
    if (!isStr(s.title, NARRATIVE_LIMITS.title) || !isStr(s.body, NARRATIVE_LIMITS.body) || !isIsoOrNull(s.asOf)) return 'bad_section_text';
    if (s.kind === 'asset' && (typeof s.symbol !== 'string' || !isSupportedAsset(s.symbol))) return 'bad_section_symbol';
    if (s.explainer !== undefined && !isStr(s.explainer, NARRATIVE_LIMITS.explainer)) return 'bad_explainer';
    if (s.facts !== undefined && (!Array.isArray(s.facts) || s.facts.length > 8 || s.facts.some((f) => !isStr(f?.label, 80) || !isStr(f?.value, 120, 0)))) return 'bad_facts';
  }
  const seg = content.narrationSegments;
  if (!Array.isArray(seg) || seg.length < 1 || seg.length > LIMITS.narrationSegments) return 'bad_narration';
  let total = 0;
  for (const t of seg) {
    if (!isStr(t, LIMITS.segmentChars)) return 'bad_narration';
    total += t.length;
  }
  if (total > LIMITS.narrationChars) return 'bad_narration';
  return null;
}

/** Canonical JSON (sorted keys) → sha256 hex. Shared audio key (D2): same text + voice + language + vibe + model ⇒ same audio. */
export function audioCacheKey(text: string, voice: string, language: BriefLanguage, vibe: string, model: string): string {
  const canonical = JSON.stringify({ language, model, text, vibe, voice });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
