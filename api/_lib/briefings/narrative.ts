import { appLanguage, appLocale } from '../../../src/lib/app-language.js';
// ============================================================
// Bobby Pro market briefings — the shared narrative, written once per (cadence, period, language). Spec §8, D1.
//   · narrativeRequest(): the model receives ONLY the evidence block (numbers with freshness labels and as-of).
//     No account data, no names, no memory ever reaches a provider (D1, same principle as memory v2).
//   · validateNarrative(): the model's JSON is untrusted. Strict shape and length checks, symbols ⊆ requested,
//     no links/markup/advice phrasing, and numeric grounding — every number in the prose must be a number of the
//     evidence (within display rounding), except small integers ≤ 31 (dates, counts), the current/adjacent year,
//     clock times and index names (S&P 500, Nasdaq 100). Any violation ⇒ null, and the worker falls back to
//     factsOnlyNarrative(). Section `facts` and `status` are always derived from evidence, never from the model.
//   · factsOnlyNarrative(): bounded templated formatting of the real evidence (es/en). Formatting only — it states
//     the numbers, their as-of and freshness, and nothing else (no opinion, no outlook).
// Times are shown in New York time ("ET"), the timezone of every schedule.
// ============================================================
import { nyParts } from './calendar.js';
import { MARKET_HOURS_TITLES, normalizeSymbols, worstFreshness } from './evidence.js';
import type { AssetQuote, BriefEvidence, BriefLanguage, BriefSection, Freshness, SectionStatus, SharedNarrative } from './types.js';

export const NARRATIVE_LIMITS = { opening: 240, title: 80, body: 420, explainer: 160 } as const;
/** Index names whose numbers are part of the name, not data. */
const NAMED_NUMBERS: readonly number[] = [100, 500];
const MAX_FACTS = 6;

// ---- formatting (shared with compose.ts) ----

const locale = (lang: BriefLanguage) => appLocale(appLanguage(lang), lang);
/** Display precision of a price: 2 decimals, 4 under 1. The model sees these same rounded values. */
export const priceDecimals = (v: number): number => (Math.abs(v) < 1 ? 4 : 2);
const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function fmtPrice(v: number, lang: BriefLanguage): string {
  const d = priceDecimals(v);
  return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}
export function fmtPct(v: number, lang: BriefLanguage, decimals = 2): string {
  const s = new Intl.NumberFormat(locale(lang), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(v));
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}%`;
}
/** UTC ISO instant → "YYYY-MM-DD HH:MM ET"; a bare date stays a date; null/invalid → null. */
export function fmtAt(iso: string | null): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const p = nyParts(new Date(t));
  return `${p.date} ${p.time} ET`;
}

const FRESH_LABEL: Record<BriefLanguage, Record<Freshness, string>> = {
  es: { live: 'en vivo', delayed: 'con retraso', closed: 'al cierre', stale: 'desactualizado', missing: 'sin datos', '24_7': '24/7' },
  en: { live: 'live', delayed: 'delayed', closed: 'at close', stale: 'stale', missing: 'unavailable', '24_7': '24/7' },  "fr": {"live": "en direct", "delayed": "différé", "closed": "à la clôture", "stale": "périmé", "missing": "indisponible", "24_7": "24/7"},
  "pt": {"live": "em tempo real", "delayed": "com atraso", "closed": "no fecho", "stale": "desatualizado", "missing": "indisponível", "24_7": "24/7"},
  "it": {"live": "in tempo reale", "delayed": "ritardato", "closed": "alla chiusura", "stale": "obsoleto", "missing": "non disponibile", "24_7": "24/7"},
  "de": {"live": "live", "delayed": "verzögert", "closed": "zum Schlusskurs", "stale": "veraltet", "missing": "nicht verfügbar", "24_7": "24/7"},
  "pt-BR": {"live": "em tempo real", "delayed": "com atraso", "closed": "no fecho", "stale": "desatualizado", "missing": "indisponível", "24_7": "24/7"},
};
const SOURCE_LABEL: Record<BriefLanguage, Record<string, string>> = {
  es: { okx_spot: 'OKX (cripto)', yahoo_equities: 'Yahoo Finance (acciones)', okx_funding: 'OKX (financiamiento)', fear_greed: 'Miedo y codicia', dxy_ecb: 'BCE (DXY)', macro_calendar: 'calendario macro', daily_history: 'historial diario' },
  en: { okx_spot: 'OKX (crypto)', yahoo_equities: 'Yahoo Finance (equities)', okx_funding: 'OKX (funding)', fear_greed: 'Fear & Greed', dxy_ecb: 'ECB (DXY)', macro_calendar: 'macro calendar', daily_history: 'daily history' },  "fr": {"okx_spot": "marché crypto", "yahoo_equities": "Yahoo Finance (actions)", "okx_funding": "financement crypto", "fear_greed": "Peur et avidité", "dxy_ecb": "BCE (DXY)", "macro_calendar": "calendrier macroéconomique", "daily_history": "historique quotidien"},
  "pt": {"okx_spot": "mercado cripto", "yahoo_equities": "Yahoo Finance (ações)", "okx_funding": "financiamento cripto", "fear_greed": "Medo e ganância", "dxy_ecb": "BCE (DXY)", "macro_calendar": "calendário macroeconómico", "daily_history": "histórico diário"},
  "it": {"okx_spot": "mercato cripto", "yahoo_equities": "Yahoo Finance (azioni)", "okx_funding": "finanziamento cripto", "fear_greed": "Paura e avidità", "dxy_ecb": "BCE (DXY)", "macro_calendar": "calendario macroeconomico", "daily_history": "storico giornaliero"},
  "de": {"okx_spot": "Kryptomarkt", "yahoo_equities": "Yahoo Finance (Aktien)", "okx_funding": "Kryptofinanzierung", "fear_greed": "Angst und Gier", "dxy_ecb": "EZB (DXY)", "macro_calendar": "Makrokalender", "daily_history": "Tagesverlauf"},
  "pt-BR": {"okx_spot": "mercado cripto", "yahoo_equities": "Yahoo Finance (ações)", "okx_funding": "financiamento cripto", "fear_greed": "Medo e ganância", "dxy_ecb": "BCE (DXY)", "macro_calendar": "calendário macroeconómico", "daily_history": "histórico diário"},
};
const BASIS_LABEL: Record<BriefLanguage, Record<AssetQuote['changeBasis'], string>> = {
  es: { '24h': 'en 24 h', prev_close: 'vs. cierre anterior', session: 'en la sesión', '7d': 'en 7 días' },
  en: { '24h': 'over 24h', prev_close: 'vs previous close', session: 'in session', '7d': 'over 7 days' },  "fr": {"24h": "sur 24 h", "prev_close": "par rapport à la clôture précédente", "session": "pendant la séance", "7d": "sur 7 jours"},
  "pt": {"24h": "em 24 h", "prev_close": "face ao fecho anterior", "session": "na sessão", "7d": "em 7 dias"},
  "it": {"24h": "in 24 h", "prev_close": "rispetto alla chiusura precedente", "session": "nella seduta", "7d": "in 7 giorni"},
  "de": {"24h": "über 24 Std.", "prev_close": "gegenüber dem vorherigen Schlusskurs", "session": "in der Sitzung", "7d": "über 7 Tage"},
  "pt-BR": {"24h": "em 24 h", "prev_close": "face ao fecho anterior", "session": "na sessão", "7d": "em 7 dias"},
};
const L = {
  es: {
    market: 'Mercado', risks: 'Riesgos', agenda: 'Agenda de esta semana', week: 'Semana anterior', price: 'Precio', asOf: 'Datos al', status: 'Estado',
    fearGreed: 'Miedo y codicia', dxy: 'DXY (estimado BCE)', funding: 'Financiamiento', equities: 'Acciones EE. UU.',
    noData: (s: string) => `Sin datos disponibles para ${s} en este momento.`,
    noFunding: 'Sin datos de financiamiento disponibles.',
    sourcesDown: (list: string) => `Fuentes incompletas o desactualizadas: ${list}.`,
    agendaEmpty: 'No hay eventos registrados en el calendario para este periodo.',
    agendaDown: 'El calendario de eventos no estuvo disponible.',
    weekEmpty: 'No hay historial diario suficiente para comparar la semana.',
    opening: (c: string, at: string) => `Resumen ${c} con datos al ${at}.`,
    cadence: { morning: 'de apertura', close: 'de cierre', weekly: 'semanal' },
  },
  en: {
    market: 'Market', risks: 'Risks', agenda: 'This week’s agenda', week: 'Previous week', price: 'Price', asOf: 'As of', status: 'Status',
    fearGreed: 'Fear & Greed', dxy: 'DXY (ECB estimate)', funding: 'Funding', equities: 'US equities',
    noData: (s: string) => `No data available for ${s} right now.`,
    noFunding: 'No funding data available.',
    sourcesDown: (list: string) => `Incomplete or stale sources: ${list}.`,
    agendaEmpty: 'No events are recorded in the calendar for this period.',
    agendaDown: 'The event calendar was unavailable.',
    weekEmpty: 'There is not enough daily history to compare the week.',
    opening: (c: string, at: string) => `${c} briefing with data as of ${at}.`,
    cadence: { morning: 'Market opening', close: 'Market close', weekly: 'Weekly' },
  },
  "fr": {
    market: "Marché",
    risks: "Risques",
    agenda: "Agenda de cette semaine",
    week: "Semaine précédente",
    price: "Prix",
    asOf: "Données au",
    status: "État",
    fearGreed: "Peur et avidité",
    dxy: "DXY (estimation BCE)",
    funding: "Financement",
    equities: "Actions américaines",
    noData: (s: string) => `Aucune donnée disponible pour ${s} actuellement.`,
    noFunding: "Aucune donnée de financement disponible.",
    sourcesDown: (list: string) => `Sources incomplètes ou périmées : ${list}.`,
    agendaEmpty: "Aucun événement enregistré dans le calendrier pour cette période.",
    agendaDown: "Le calendrier des événements était indisponible.",
    weekEmpty: "L’historique quotidien ne suffit pas pour comparer la semaine.",
    opening: (c: string, at: string) => `Résumé ${c} avec les données au ${at}.`,
    cadence: {"morning": "d’ouverture", "close": "de clôture", "weekly": "hebdomadaire"},
  },
  "pt": {
    market: "Mercado",
    risks: "Riscos",
    agenda: "Agenda desta semana",
    week: "Semana anterior",
    price: "Preço",
    asOf: "Dados em",
    status: "Estado",
    fearGreed: "Medo e ganância",
    dxy: "DXY (estimativa BCE)",
    funding: "Financiamento",
    equities: "Ações dos EUA",
    noData: (s: string) => `Sem dados disponíveis para ${s} neste momento.`,
    noFunding: "Sem dados de financiamento disponíveis.",
    sourcesDown: (list: string) => `Fontes incompletas ou desatualizadas: ${list}.`,
    agendaEmpty: "Não há eventos registados no calendário para este período.",
    agendaDown: "O calendário de eventos estava indisponível.",
    weekEmpty: "O histórico diário não é suficiente para comparar a semana.",
    opening: (c: string, at: string) => `Resumo ${c} com dados em ${at}.`,
    cadence: {"morning": "de abertura", "close": "de fecho", "weekly": "semanal"},
  },
  "it": {
    market: "Mercato",
    risks: "Rischi",
    agenda: "Agenda di questa settimana",
    week: "Settimana precedente",
    price: "Prezzo",
    asOf: "Dati al",
    status: "Stato",
    fearGreed: "Paura e avidità",
    dxy: "DXY (stima BCE)",
    funding: "Finanziamento",
    equities: "Azioni statunitensi",
    noData: (s: string) => `Nessun dato disponibile per ${s} al momento.`,
    noFunding: "Nessun dato di finanziamento disponibile.",
    sourcesDown: (list: string) => `Fonti incomplete o obsolete: ${list}.`,
    agendaEmpty: "Non ci sono eventi registrati nel calendario per questo periodo.",
    agendaDown: "Il calendario degli eventi non era disponibile.",
    weekEmpty: "Lo storico giornaliero non basta per confrontare la settimana.",
    opening: (c: string, at: string) => `Riepilogo ${c} con dati al ${at}.`,
    cadence: {"morning": "di apertura", "close": "di chiusura", "weekly": "settimanale"},
  },
  "de": {
    market: "Markt",
    risks: "Risiken",
    agenda: "Agenda dieser Woche",
    week: "Vorherige Woche",
    price: "Preis",
    asOf: "Datenstand",
    status: "Status",
    fearGreed: "Angst und Gier",
    dxy: "DXY (EZB-Schätzung)",
    funding: "Finanzierung",
    equities: "US-Aktien",
    noData: (s: string) => `Derzeit keine Daten für ${s} verfügbar.`,
    noFunding: "Keine Finanzierungsdaten verfügbar.",
    sourcesDown: (list: string) => `Unvollständige oder veraltete Quellen: ${list}.`,
    agendaEmpty: "Für diesen Zeitraum sind keine Ereignisse im Kalender gespeichert.",
    agendaDown: "Der Ereigniskalender war nicht verfügbar.",
    weekEmpty: "Der Tagesverlauf reicht für einen Wochenvergleich nicht aus.",
    opening: (c: string, at: string) => `${c} Überblick mit Datenstand ${at}.`,
    cadence: {"morning": "zur Eröffnung", "close": "zum Schluss", "weekly": "wöchentlich"},
  },
  "pt-BR": {
    market: "Mercado",
    risks: "Riscos",
    agenda: "Agenda desta semana",
    week: "Semana anterior",
    price: "Preço",
    asOf: "Dados em",
    status: "Estado",
    fearGreed: "Medo e ganância",
    dxy: "DXY (estimativa BCE)",
    funding: "Financiamento",
    equities: "Ações dos EUA",
    noData: (s: string) => `Sem dados disponíveis para ${s} neste momento.`,
    noFunding: "Sem dados de financiamento disponíveis.",
    sourcesDown: (list: string) => `Fontes incompletas ou desatualizadas: ${list}.`,
    agendaEmpty: "Não há eventos registados no calendário para este período.",
    agendaDown: "O calendário de eventos estava indisponível.",
    weekEmpty: "O histórico diário não é suficiente para comparar a semana.",
    opening: (c: string, at: string) => `Resumo ${c} com dados em ${at}.`,
    cadence: {"morning": "de abertura", "close": "de fecho", "weekly": "semanal"},
  },
} as const;

/** Plain sentence about the US equity session; never implies a live session when closed. */
export function equitySessionLine(e: BriefEvidence['equitySession'], lang: BriefLanguage): string {
  const last = e.lastSessionDate;
  if (lang !== 'es' && lang !== 'en') {
    const copy = {
      fr: { open: 'séance régulière ouverte', pre_market: 'séance pas encore ouverte', after_close: 'séance fermée', closed_weekend: 'fermé pour le week-end', closed_holiday: 'fermé pour jour férié', unknown: 'horaires non confirmés; vérifiez la date de chaque prix', last: 'dernière clôture' },
      pt: { open: 'sessão regular aberta', pre_market: 'a sessão ainda não abriu', after_close: 'sessão encerrada', closed_weekend: 'encerrado ao fim de semana', closed_holiday: 'encerrado por feriado', unknown: 'horário não confirmado; verifica a data de cada preço', last: 'último fecho' },
      'pt-BR': { open: 'sessão regular aberta', pre_market: 'a sessão ainda não abriu', after_close: 'sessão encerrada', closed_weekend: 'fechado no fim de semana', closed_holiday: 'fechado por feriado', unknown: 'horário não confirmado; confira a data de cada preço', last: 'último fechamento' },
      it: { open: 'seduta regolare aperta', pre_market: 'la seduta non è ancora aperta', after_close: 'seduta chiusa', closed_weekend: 'chiuso nel fine settimana', closed_holiday: 'chiuso per festività', unknown: 'orari non confermati; controlla la data di ogni prezzo', last: 'ultima chiusura' },
      de: { open: 'reguläre Sitzung geöffnet', pre_market: 'Sitzung noch nicht geöffnet', after_close: 'Sitzung geschlossen', closed_weekend: 'am Wochenende geschlossen', closed_holiday: 'wegen Feiertag geschlossen', unknown: 'Handelszeiten unbestätigt; prüfe jedes Kursdatum', last: 'letzter Schlusskurs' },
    }[lang];
    return `${L[lang].equities}: ${copy[e.state]}${e.holidayName ? ` (${e.holidayName})` : ''}${e.state !== 'open' && last ? `; ${copy.last}: ${last}` : ''}.`;
  }

  if (lang === 'es') {
    switch (e.state) {
      case 'open': return 'Acciones de EE. UU.: sesión regular abierta.';
      case 'pre_market': return last ? `Acciones de EE. UU.: la sesión aún no abre; precios al cierre del ${last}.` : 'Acciones de EE. UU.: la sesión aún no abre.';
      case 'after_close': return `Acciones de EE. UU.: sesión cerrada; precios al cierre del ${e.date}.`;
      case 'closed_weekend': return last ? `Acciones de EE. UU.: cerrado por fin de semana; precios al cierre del ${last}.` : 'Acciones de EE. UU.: cerrado por fin de semana.';
      case 'closed_holiday': return `Acciones de EE. UU.: cerrado por feriado${e.holidayName ? ` (${e.holidayName})` : ''}${last ? `; precios al cierre del ${last}` : ''}.`;
      default: return 'Acciones de EE. UU.: horario no confirmado; revisa la fecha de cada precio.';
    }
  }
  switch (e.state) {
    case 'open': return 'US equities: regular session open.';
    case 'pre_market': return last ? `US equities: the session has not opened; prices as of the ${last} close.` : 'US equities: the session has not opened.';
    case 'after_close': return `US equities: session closed; prices as of the ${e.date} close.`;
    case 'closed_weekend': return last ? `US equities: closed for the weekend; prices as of the ${last} close.` : 'US equities: closed for the weekend.';
    case 'closed_holiday': return `US equities: closed for a holiday${e.holidayName ? ` (${e.holidayName})` : ''}${last ? `; prices as of the ${last} close` : ''}.`;
    default: return 'US equities: session hours unconfirmed; check each price date.';
  }
}

/** Localized agenda title; market-hours items have canonical English titles in evidence. */
export function agendaTitle(item: BriefEvidence['agenda'][number], lang: BriefLanguage): string {
  if (lang === 'en' || item.kind !== 'market_hours') return item.title;
  if (lang !== 'es') {
    const labels = { fr: ['Ouverture de la séance américaine', 'Clôture de la séance américaine', 'Clôture anticipée de la séance américaine', 'Marchés américains fermés'], pt: ['Abertura da sessão dos EUA', 'Fecho da sessão dos EUA', 'Fecho antecipado da sessão dos EUA', 'Mercados dos EUA encerrados'], 'pt-BR': ['Abertura da sessão dos EUA', 'Fechamento da sessão dos EUA', 'Fechamento antecipado da sessão dos EUA', 'Mercados dos EUA fechados'], it: ['Apertura della seduta statunitense', 'Chiusura della seduta statunitense', 'Chiusura anticipata della seduta statunitense', 'Mercati statunitensi chiusi'], de: ['US-Handelssitzung öffnet', 'US-Handelssitzung schließt', 'US-Handelssitzung schließt vorzeitig', 'US-Märkte geschlossen'] }[lang];
    if (item.title === MARKET_HOURS_TITLES.open) return labels[0];
    if (item.title === MARKET_HOURS_TITLES.close) return labels[1];
    if (item.title === MARKET_HOURS_TITLES.earlyClose) return labels[2];
    if (item.title.startsWith(MARKET_HOURS_TITLES.holidayPrefix)) return `${labels[3]}: ${item.title.slice(MARKET_HOURS_TITLES.holidayPrefix.length)}`;
    return item.title;
  }

  if (item.title === MARKET_HOURS_TITLES.open) return 'Abre la sesión de acciones de EE. UU.';
  if (item.title === MARKET_HOURS_TITLES.close) return 'Cierra la sesión de acciones de EE. UU.';
  if (item.title === MARKET_HOURS_TITLES.earlyClose) return 'Cierre anticipado de la sesión de acciones de EE. UU.';
  if (item.title.startsWith(MARKET_HOURS_TITLES.holidayPrefix)) return `Acciones de EE. UU. cerradas: ${item.title.slice(MARKET_HOURS_TITLES.holidayPrefix.length)}`;
  return item.title;
}

/** Cut to `max` chars at the last sentence (or word) boundary. Bounded output for templated text. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(' ');
  return `${cut.slice(0, word > 0 ? word : max - 1)}…`.slice(0, max);
}

// ---- facts and statuses (always from evidence) ----

const quoteOf = (evidence: BriefEvidence, symbol: string) => evidence.quotes.find((q) => q.symbol === symbol) ?? null;

const toStatus = (f: Freshness): SectionStatus => f;
/** Several items: the least fresh; stale/missing among them ⇒ 'partial'. */
function groupStatus(list: Freshness[]): SectionStatus {
  if (!list.length) return 'missing';
  const w = worstFreshness(list);
  if (w === 'stale' || w === 'missing') return list.every((f) => f === w) ? w : 'partial';
  return w;
}

export function assetFacts(q: AssetQuote | null, lang: BriefLanguage): NonNullable<BriefSection['facts']> {
  const l = L[lang];
  if (!q || q.price === null || q.freshness === 'missing') return [{ label: l.status, value: FRESH_LABEL[lang].missing }];
  const facts: NonNullable<BriefSection['facts']> = [{ label: l.price, value: `${fmtPrice(q.price, lang)} USD` }];
  if (q.changePct !== null) facts.push({ label: BASIS_LABEL[lang][q.changeBasis], value: fmtPct(q.changePct, lang) });
  const at = fmtAt(q.asOf);
  facts.push({ label: l.asOf, value: at ? `${at} · ${FRESH_LABEL[lang][q.freshness]}` : FRESH_LABEL[lang][q.freshness] });
  return facts;
}

function marketFacts(e: BriefEvidence, lang: BriefLanguage): NonNullable<BriefSection['facts']> {
  const l = L[lang];
  const facts: NonNullable<BriefSection['facts']> = [];
  if (e.macro.fearGreed) facts.push({ label: l.fearGreed, value: `${e.macro.fearGreed.value} (${e.macro.fearGreed.classification}) · ${FRESH_LABEL[lang][e.macro.fearGreed.freshness]}` });
  if (e.macro.dxy) facts.push({ label: l.dxy, value: `${fmtPrice(e.macro.dxy.value, lang)}${e.macro.dxy.asOf ? ` · ${e.macro.dxy.asOf}` : ''}` });
  return facts.slice(0, MAX_FACTS);
}

function riskFacts(e: BriefEvidence, lang: BriefLanguage): NonNullable<BriefSection['facts']> {
  return e.macro.funding.slice(0, MAX_FACTS).map((f) => ({ label: `${L[lang].funding} ${f.symbol}`, value: fmtPct(f.ratePct, lang, 4) }));
}

function agendaFacts(e: BriefEvidence, lang: BriefLanguage): NonNullable<BriefSection['facts']> {
  return e.agenda.slice(0, MAX_FACTS).map((a) => ({ label: clip(agendaTitle(a, lang), 60), value: fmtAt(a.at) ?? '' }));
}

function weekFacts(e: BriefEvidence, symbols: string[], lang: BriefLanguage): NonNullable<BriefSection['facts']> {
  return symbols.map((s) => quoteOf(e, s)).filter((q): q is AssetQuote => !!q && q.changeBasis === '7d' && q.changePct !== null)
    .slice(0, MAX_FACTS).map((q) => ({ label: q.symbol, value: `${fmtPct(q.changePct!, lang)} ${BASIS_LABEL[lang]['7d']}` }));
}

const marketStatus = (e: BriefEvidence, symbols: string[]): SectionStatus =>
  groupStatus(symbols.map((s) => quoteOf(e, s)?.freshness ?? 'missing'));
const sourceFreshness = (e: BriefEvidence, name: string): Freshness => e.sources.find((s) => s.name === name)?.freshness ?? 'missing';

function assetSection(e: BriefEvidence, symbol: string, lang: BriefLanguage, title: string, body: string, explainer?: string): BriefSection {
  const q = quoteOf(e, symbol);
  const s: BriefSection = { kind: 'asset', symbol, title, body, asOf: q?.asOf ?? null, status: toStatus(q?.freshness ?? 'missing'), facts: assetFacts(q, lang) };
  if (explainer) s.explainer = explainer;
  return s;
}

function sharedSections(e: BriefEvidence, symbols: string[], lang: BriefLanguage, text: {
  market: { title: string; body: string }; risks: { title: string; body: string }; agenda: { title: string; body: string }; week?: { title: string; body: string };
}): Pick<SharedNarrative, 'market' | 'risks' | 'agenda' | 'week'> {
  const out: Pick<SharedNarrative, 'market' | 'risks' | 'agenda' | 'week'> = {
    market: { kind: 'market', ...text.market, asOf: e.dataAsOf, status: marketStatus(e, symbols), facts: marketFacts(e, lang) },
    risks: { kind: 'risks', ...text.risks, asOf: e.capturedAt, status: e.macro.funding.length ? groupStatus(e.macro.funding.map((f) => f.freshness)) : 'missing', facts: riskFacts(e, lang) },
    agenda: { kind: 'agenda', ...text.agenda, asOf: e.capturedAt, status: sourceFreshness(e, 'macro_calendar'), facts: agendaFacts(e, lang) },
  };
  if (text.week) {
    out.week = { kind: 'week', ...text.week, asOf: e.dataAsOf, status: groupStatus(symbols.map((s) => quoteOf(e, s)?.freshness ?? 'missing')), facts: weekFacts(e, symbols, lang) };
  }
  return out;
}

// ---- model request ----

/** The evidence block the model sees: rounded display values, freshness and as-of (ET). Nothing personal. */
export function evidenceBlock(e: BriefEvidence, symbols: string[]): Record<string, unknown> {
  const wanted = normalizeSymbols(symbols).filter((s) => quoteOf(e, s));
  return {
    cadence: e.cadence,
    period: e.periodKey,
    capturedAt: fmtAt(e.capturedAt),
    dataAsOf: fmtAt(e.dataAsOf),
    usEquitySession: {
      state: e.equitySession.state, date: e.equitySession.date, lastCompletedSession: e.equitySession.lastSessionDate,
      holiday: e.equitySession.holidayName, earlyClose: e.equitySession.earlyClose,
    },
    quotes: wanted.map((s) => {
      const q = quoteOf(e, s)!;
      return {
        symbol: q.symbol, kind: q.kind, freshness: q.freshness, asOf: fmtAt(q.asOf),
        price: q.price === null ? null : roundTo(q.price, priceDecimals(q.price)),
        changePct: q.changePct === null ? null : roundTo(q.changePct, 2), changeBasis: q.changeBasis,
      };
    }),
    macro: {
      fearGreed: e.macro.fearGreed && { value: e.macro.fearGreed.value, classification: e.macro.fearGreed.classification, freshness: e.macro.fearGreed.freshness, asOf: fmtAt(e.macro.fearGreed.asOf) },
      dxyEstimate: e.macro.dxy && { value: roundTo(e.macro.dxy.value, 2), freshness: e.macro.dxy.freshness, ecbFixDate: e.macro.dxy.asOf },
      volatilityRegime: e.macro.regime,
      fundingRatePct: e.macro.funding.map((f) => ({ symbol: f.symbol, ratePct: roundTo(f.ratePct, 4), freshness: f.freshness })),
    },
    agenda: e.agenda.map((a) => ({ title: a.title, at: fmtAt(a.at), kind: a.kind, severity: a.severity })),
    ...(e.history ? { weeklyHistory: e.history.filter((h) => wanted.includes(h.symbol)).map((h) => ({ symbol: h.symbol, from: { at: fmtAt(h.from.at), close: roundTo(h.from.price, priceDecimals(h.from.price)) }, to: { at: fmtAt(h.to.at), close: roundTo(h.to.price, priceDecimals(h.to.price)) } })) } : {}),
    sourcesUnavailable: e.sources.filter((s) => !s.ok).map((s) => s.name),
  };
}

const LANGUAGE_RULE: Record<BriefLanguage, string> = {
  es: 'Write in Mexican Spanish: plain, warm and clear, short sentences, no hype, no slang overload. Address nobody by name.',
  en: 'Write in plain, warm, clear English: short sentences, no hype. Address nobody by name.',  "fr": "Write in French (France): plain, warm and clear, short sentences, no hype. Address nobody by name.",
  "pt": "Write in European Portuguese (Portugal): plain, warm and clear, short sentences, no hype. Address nobody by name.",
  "pt-BR": "Write in Brazilian Portuguese: plain, warm and clear, short sentences, no hype. Address nobody by name.",
  "it": "Write in Italian (Italy): plain, warm and clear, short sentences, no hype. Address nobody by name.",
  "de": "Write in German (Germany): plain, warm and clear, short sentences, no hype. Address nobody by name.",
};

export function narrativeRequest(evidence: BriefEvidence, language: BriefLanguage, symbols: string[]): { system: string; user: string; schema: { name: string; schema: Record<string, unknown> } } {
  const wanted = normalizeSymbols(symbols).filter((s) => quoteOf(evidence, s));
  const weekly = evidence.cadence === 'weekly';
  const system = [
    `You write Bobby's shared ${evidence.cadence === 'morning' ? 'pre-market morning' : evidence.cadence === 'close' ? 'market-close' : 'Monday pre-market weekly'} market briefing. The same text is read by many people.`,
    LANGUAGE_RULE[language],
    'Rules:',
    '1. Use ONLY the facts and numbers in the EVIDENCE block. Copy numbers as given (rounding to fewer decimals is fine). Never compute new numbers (no differences, averages, conversions or targets) and never invent prices, events, news or causes.',
    '2. Respect freshness: "closed" data is the last close — say so with its date; "stale" or "delayed" data must be called out with its as-of time; "missing" means say the data is unavailable. Never describe US equities as trading live unless usEquitySession.state is "open".',
    '3. Times are New York time; write them as given with "ET".',
    '4. Agenda: mention only the agenda items provided. If there are none, say there are no recorded events.',
    '5. No buy/sell/hold instructions, no recommendations, no price targets, no personal or suitability advice, no greetings with names, no links, no markdown.',
    `6. Lengths: opening ≤ ${weekly ? 140 : NARRATIVE_LIMITS.opening} characters, every title ≤ ${NARRATIVE_LIMITS.title}, every body ≤ ${weekly ? 220 : NARRATIVE_LIMITS.body}, every explainer ≤ ${NARRATIVE_LIMITS.explainer}.`,
    `7. assets: at most one entry per symbol, only symbols from: ${wanted.join(', ') || '(none)'}. explainer = one plain sentence explaining a concept in that section for a beginner, with no numbers (empty string if not useful).`,
    weekly
      ? '8. This is a brief, light Monday 08:00 New York outlook for the upcoming week. Prioritize recorded events in the next seven days and the most relevant risks; no invented predictions or routine price alert. The week block is explicitly labelled "Semana anterior" / "Previous week": historical context only from changeBasis "7d" and weeklyHistory (prior Monday 08:00 to this Monday 08:00). Never present historical prices as current prices or a current price as a weekly result.'
      : '8. market: overall context from the quotes and macro data; risks: what could move markets based only on the evidence (volatility regime, funding, data gaps).',
  ].join('\n');
  const user = `EVIDENCE (JSON):\n${JSON.stringify(evidenceBlock(evidence, wanted))}\n\nWrite the briefing as JSON matching the schema.`;

  const block = { type: 'object', additionalProperties: false, required: ['title', 'body'], properties: { title: { type: 'string' }, body: { type: 'string' } } };
  const properties: Record<string, unknown> = {
    opening: { type: 'string' },
    market: block,
    assets: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['symbol', 'title', 'body', 'explainer'],
        properties: { symbol: wanted.length ? { type: 'string', enum: wanted } : { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, explainer: { type: 'string' } },
      },
    },
    risks: block,
    agenda: block,
  };
  if (weekly) properties.week = block;
  return {
    system,
    user,
    schema: { name: 'bobby_briefing', schema: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } },
  };
}

// ---- validation ----

const URL_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|io|org|net|xyz|ai|co|mx|app|gg)\b/i;
const MARKUP_RE = /\[[^\]]*\]\([^)]*\)|\*\*|__|`|^\s*#{1,6}\s|<\/?[a-z][^>]*>/im;
const ADVICE_RE: Record<BriefLanguage, RegExp> = {
  en: /\b(you should|we recommend|i recommend|consider (?:buying|selling)|(?:buy|sell|hold) (?:now|it|this|them)|price target)\b/i,
  es: /(deber[ií]as|te recomiendo|recomendamos|te sugiero|\b(?:compra|vende|mant[eé]n|comprar|vender) (?:ya|ahora|hoy)\b|precio objetivo)/i,  "fr": /\b(tu devrais|vous devriez|je recommande|nous recommandons|(?:achète|achetez|vends|vendez|acheter|vendre) maintenant|objectif de (?:prix|cours))\b/i,
  "pt": /(deverias|deveria|recomendo|recomendamos|aconselho|(?:compra|compre|vende|venda|comprar|vender) (?:já|agora|hoje)|preço[- ]alvo)/i,
  "it": /\b(dovresti|ti consiglio|raccomandiamo|(?:compra|vendi|comprare|vendere) (?:ora|subito|oggi)|prezzo obiettivo)\b/i,
  "de": /\b(du solltest|ich empfehle|wir empfehlen|(?:kaufe|verkaufe|kaufen|verkaufen) (?:jetzt|sofort|heute)|Kursziel)\b/i,
  "pt-BR": /(deverias|deveria|recomendo|recomendamos|aconselho|(?:compra|compre|vende|venda|comprar|vender) (?:já|agora|hoje)|preço[- ]alvo)/i,
};
const TIME_RE = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;
const NUM_RE = /\d+(?:[.,]\d+)*/g;
const SCALE_RE = /^\s?(k|mil\b|millones\b|million\b|mn\b|m\b|bn\b|b\b)/i;

function evidenceNumbers(e: BriefEvidence): number[] {
  const out: number[] = [...NAMED_NUMBERS];
  for (const q of e.quotes) {
    if (q.price !== null) out.push(q.price);
    if (q.changePct !== null) out.push(Math.abs(q.changePct));
  }
  for (const h of e.history ?? []) out.push(h.from.price, h.to.price);
  if (e.macro.dxy) out.push(e.macro.dxy.value);
  if (e.macro.fearGreed) out.push(e.macro.fearGreed.value);
  for (const f of e.macro.funding) out.push(Math.abs(f.ratePct));
  for (const n of e.macro.regime?.label.match(/\d+(?:\.\d+)?/g) ?? []) out.push(Number(n));
  for (const a of e.agenda) if (a.severity !== null) out.push(a.severity);
  return out.filter((n) => Number.isFinite(n));
}

function candidates(token: string): Array<{ value: number; decimals: number }> {
  const out: Array<{ value: number; decimals: number }> = [];
  for (const [group, dec] of [[',', '.'], ['.', ',']] as const) {
    const s = token.split(group).join('');
    const parts = s.split(dec);
    if (parts.length > 2) continue;
    const value = Number(parts.join('.'));
    if (Number.isFinite(value)) out.push({ value, decimals: parts[1]?.length ?? 0 });
  }
  return out;
}

/** Numbers in `text` that no evidence value explains (display rounding allowed). Exported for tests. */
export function ungroundedNumbers(text: string, evidence: BriefEvidence): string[] {
  const allowed = evidenceNumbers(evidence);
  const year = new Date(evidence.capturedAt).getUTCFullYear();
  const stripped = text.replace(TIME_RE, ' ');
  const bad: string[] = [];
  for (const m of stripped.matchAll(NUM_RE)) {
    const token = m[0];
    const after = stripped.slice((m.index ?? 0) + token.length);
    const sm = after.match(SCALE_RE)?.[1]?.toLowerCase();
    const scale = !sm ? 1 : sm === 'k' || sm === 'mil' ? 1e3 : sm === 'bn' || sm === 'b' ? 1e9 : 1e6;
    const cands = candidates(token);
    const plain = cands.some((c) => c.decimals === 0 && scale === 1 && Number.isInteger(c.value) && (c.value <= 31 || (c.value >= year - 1 && c.value <= year + 1)));
    if (plain) continue;
    const grounded = cands.some((c) => {
      const tol = 0.5 * 10 ** -c.decimals * scale;
      return allowed.some((v) => Math.abs(c.value * scale - Math.abs(v)) <= tol + 1e-9 * Math.max(1, Math.abs(v)));
    });
    if (!grounded) bad.push(token);
  }
  return bad;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
const str = (v: unknown, max: number, allowEmpty = false): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if ((!t && !allowEmpty) || t.length > max) return null;
  return t;
};
function textBlock(v: unknown): { title: string; body: string } | null {
  if (!isObj(v) || !exactKeys(v, ['title', 'body'])) return null;
  const title = str(v.title, NARRATIVE_LIMITS.title);
  const body = str(v.body, NARRATIVE_LIMITS.body);
  return title && body ? { title, body } : null;
}

export function validateNarrative(raw: unknown, evidence: BriefEvidence, language: BriefLanguage, symbols: string[], model: string): SharedNarrative | null {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!isObj(v)) return null;
  const weekly = evidence.cadence === 'weekly';
  const keys = ['opening', 'market', 'assets', 'risks', 'agenda', ...(weekly ? ['week'] : [])];
  if (!exactKeys(v, keys)) return null;
  const opening = str(v.opening, NARRATIVE_LIMITS.opening);
  const market = textBlock(v.market);
  const risks = textBlock(v.risks);
  const agenda = textBlock(v.agenda);
  const week = weekly ? textBlock(v.week) : undefined;
  if (!opening || !market || !risks || !agenda || week === null) return null;

  const wanted = normalizeSymbols(symbols).filter((s) => quoteOf(evidence, s));
  if (!Array.isArray(v.assets) || v.assets.length > wanted.length) return null;
  const assets: Array<{ symbol: string; title: string; body: string; explainer: string }> = [];
  for (const a of v.assets) {
    if (!isObj(a) || !exactKeys(a, ['symbol', 'title', 'body', 'explainer'])) return null;
    const symbol = typeof a.symbol === 'string' ? a.symbol : '';
    if (!wanted.includes(symbol) || assets.some((x) => x.symbol === symbol)) return null;
    const title = str(a.title, NARRATIVE_LIMITS.title);
    const body = str(a.body, NARRATIVE_LIMITS.body);
    const explainer = str(a.explainer, NARRATIVE_LIMITS.explainer, true);
    if (!title || !body || explainer === null) return null;
    assets.push({ symbol, title, body, explainer });
  }

  const prose = [opening, market.title, market.body, risks.title, risks.body, agenda.title, agenda.body, ...(week ? [week.title, week.body] : []),
    ...assets.flatMap((a) => [a.title, a.body, a.explainer])];
  for (const t of prose) {
    if (URL_RE.test(t) || MARKUP_RE.test(t) || ADVICE_RE[language].test(t) || ADVICE_RE.en.test(t) || t.includes('@')) return null;
    if (ungroundedNumbers(t, evidence).length) return null;
  }

  const shared = sharedSections(evidence, wanted, language, { market, risks, agenda, ...(week ? { week } : {}) });
  const out: SharedNarrative = {
    version: 1,
    language,
    opening,
    ...shared,
    assets: Object.fromEntries(assets.map((a) => [a.symbol, assetSection(evidence, a.symbol, language, a.title, a.body, a.explainer || undefined)])),
    source: 'model',
    model,
  };
  return out;
}

// ---- facts-only fallback ----

/** One asset section formatted from evidence alone (also used by compose.ts when the narrative lacks a symbol). */
export function factsOnlyAssetSection(evidence: BriefEvidence, language: BriefLanguage, symbol: string): BriefSection {
  const q = quoteOf(evidence, symbol);
  const l = L[language];
  if (!q || q.price === null || q.freshness === 'missing') return assetSection(evidence, symbol, language, symbol, l.noData(symbol));
  const parts = [`${l.price}: ${fmtPrice(q.price, language)} USD`];
  if (q.changePct !== null) parts.push(`${fmtPct(q.changePct, language)} ${BASIS_LABEL[language][q.changeBasis]}`);
  const at = fmtAt(q.asOf);
  parts.push(`${l.asOf.toLowerCase()} ${at ?? '—'} (${FRESH_LABEL[language][q.freshness]})`);
  return assetSection(evidence, symbol, language, symbol, clip(`${parts.join(', ')}.`, NARRATIVE_LIMITS.body));
}

function quoteLine(q: AssetQuote, lang: BriefLanguage): string {
  if (q.price === null) return `${q.symbol}: ${FRESH_LABEL[lang].missing}`;
  const ch = q.changePct === null ? '' : ` (${fmtPct(q.changePct, lang)} ${BASIS_LABEL[lang][q.changeBasis]})`;
  return `${q.symbol} ${fmtPrice(q.price, lang)} USD${ch}, ${FRESH_LABEL[lang][q.freshness]}`;
}

/** Templated risk detail from evidence: funding plus the sources that were stale or unavailable. */
export function riskDetail(evidence: BriefEvidence, lang: BriefLanguage, max: number = NARRATIVE_LIMITS.body): string {
  const l = L[lang];
  const parts: string[] = [];
  if (evidence.macro.funding.length) parts.push(`${l.funding}: ${evidence.macro.funding.map((f) => `${f.symbol} ${fmtPct(f.ratePct, lang, 4)}`).join(', ')}.`);
  else parts.push(l.noFunding);
  const down = evidence.sources.filter((s) => !s.ok || s.freshness === 'stale').map((s) => SOURCE_LABEL[lang][s.name] ?? s.name);
  if (down.length) parts.push(l.sourcesDown(down.join(', ')));
  return clip(parts.join(' '), max);
}

export function factsOnlyNarrative(evidence: BriefEvidence, language: BriefLanguage, symbols: string[]): SharedNarrative {
  const l = L[language];
  const wanted = normalizeSymbols(symbols);
  const inEvidence = wanted.filter((s) => quoteOf(evidence, s));
  const weekly = evidence.cadence === 'weekly';

  const marketParts: string[] = [];
  const hasEquity = evidence.quotes.some((q) => inEvidence.includes(q.symbol) && (q.kind === 'equity' || q.kind === 'etf'));
  if (hasEquity || !inEvidence.length) marketParts.push(equitySessionLine(evidence.equitySession, language));
  const shown = inEvidence.map((s) => quoteOf(evidence, s)!).filter((q) => q.price !== null).slice(0, 4);
  if (shown.length) marketParts.push(`${shown.map((q) => quoteLine(q, language)).join('; ')}.`);
  if (evidence.macro.fearGreed) marketParts.push(`${l.fearGreed}: ${evidence.macro.fearGreed.value} (${evidence.macro.fearGreed.classification}).`);
  if (evidence.macro.dxy) marketParts.push(`${l.dxy}: ${fmtPrice(evidence.macro.dxy.value, language)}${evidence.macro.dxy.asOf ? ` (${evidence.macro.dxy.asOf})` : ''}.`);

  const agendaBody = !evidence.sources.find((s) => s.name === 'macro_calendar')?.ok && !evidence.agenda.length
    ? l.agendaDown
    : evidence.agenda.length
      ? `${evidence.agenda.map((a) => `${fmtAt(a.at)}: ${agendaTitle(a, language)}`).join('; ')}.`
      : l.agendaEmpty;

  let week: { title: string; body: string } | undefined;
  if (weekly) {
    const moved = inEvidence.map((s) => quoteOf(evidence, s)!).filter((q) => q.changeBasis === '7d' && q.changePct !== null && q.price !== null);
    week = {
      title: l.week,
      body: clip(moved.length ? `${moved.map((q) => `${q.symbol} ${fmtPct(q.changePct!, language)} ${BASIS_LABEL[language]['7d']} (${fmtPrice(q.price!, language)} USD, ${fmtAt(q.asOf)})`).join('; ')}.` : l.weekEmpty, NARRATIVE_LIMITS.body),
    };
  }

  const shared = sharedSections(evidence, inEvidence, language, {
    market: { title: l.market, body: clip(marketParts.join(' ') || equitySessionLine(evidence.equitySession, language), NARRATIVE_LIMITS.body) },
    risks: { title: l.risks, body: riskDetail(evidence, language) },
    agenda: { title: l.agenda, body: clip(agendaBody, NARRATIVE_LIMITS.body) },
    ...(week ? { week } : {}),
  });
  return {
    version: 1,
    language,
    opening: clip(l.opening(l.cadence[evidence.cadence], fmtAt(evidence.dataAsOf) ?? evidence.dataAsOf), NARRATIVE_LIMITS.opening),
    ...shared,
    assets: Object.fromEntries(wanted.map((s) => [s, factsOnlyAssetSection(evidence, language, s)])),
    source: 'facts_only',
  };
}
