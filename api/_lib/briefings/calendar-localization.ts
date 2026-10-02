// Deterministic display labels for the exact titles emitted by seed-macro-calendar.ts
// and NYSE_CALENDAR. Unknown or amended titles retain their identity verbatim. This is
// formatting only: it never changes the stored event, schedule, severity or evidence.
import { appLanguage, appLocale } from '../../../src/lib/app-language.js';
import type { BriefLanguage } from './types.js';

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MACRO_LABELS: Record<BriefLanguage, { fomc: string; cpi: string; payroll: string }> = {
  en: { fomc: 'FOMC Rate Decision', cpi: 'CPI', payroll: 'Non-Farm Payroll' },
  es: { fomc: 'Decisión del FOMC sobre tasas de interés', cpi: 'Publicación del índice de precios al consumidor de EE. UU. (CPI)', payroll: 'Empleo no agrícola de EE. UU.' },
  fr: { fomc: 'Décision du FOMC sur les taux', cpi: 'Publication de l’indice des prix à la consommation américain (CPI)', payroll: 'Emploi non agricole aux États-Unis' },
  pt: { fomc: 'Decisão do FOMC sobre taxas de juro', cpi: 'Divulgação do índice de preços no consumidor dos EUA (CPI)', payroll: 'Emprego não agrícola nos EUA' },
  'pt-BR': { fomc: 'Decisão do FOMC sobre taxas de juros', cpi: 'Divulgação do índice de preços ao consumidor dos EUA (CPI)', payroll: 'Emprego não agrícola nos EUA' },
  it: { fomc: 'Decisione del FOMC sui tassi di interesse', cpi: 'Pubblicazione dell’indice dei prezzi al consumo statunitense (CPI)', payroll: 'Occupazione non agricola negli Stati Uniti' },
  de: { fomc: 'Zinsentscheidung des FOMC', cpi: 'Veröffentlichung des US-Verbraucherpreisindex (CPI)', payroll: 'US-Beschäftigung außerhalb der Landwirtschaft' },
};

/** Exact controlled producer vocabulary; arbitrary provider headlines are not reinterpreted. */
export function localizedMacroTitle(title: string, language: BriefLanguage): string {
  if (language === 'en') return title;
  const labels = MACRO_LABELS[language];
  if (title === 'FOMC Rate Decision') return labels.fomc;
  const cpi = /^CPI ([A-Za-z]+) Release$/.exec(title);
  const payroll = /^Non-Farm Payroll ([A-Za-z]+)$/.exec(title);
  const match = cpi ?? payroll;
  if (!match) return title;
  const monthIndex = EN_MONTHS.indexOf(match[1]);
  if (monthIndex < 0) return title;
  const month = new Intl.DateTimeFormat(appLocale(appLanguage(language), language), { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, monthIndex, 1)));
  return `${cpi ? labels.cpi : labels.payroll}: ${month}`;
}

// The names identify the US exchange holiday, including observed dates. Juneteenth
// and people's names remain proper names; translated descriptors retain the holiday.
const HOLIDAY_LABELS: Record<string, Record<BriefLanguage, string>> = {
  "New Year's Day": { en: "New Year's Day", es: 'Año Nuevo', fr: 'Jour de l’An', pt: 'Ano Novo', 'pt-BR': 'Ano Novo', it: 'Capodanno', de: 'Neujahr' },
  'Martin Luther King, Jr. Day': { en: 'Martin Luther King, Jr. Day', es: 'Día de Martin Luther King, Jr.', fr: 'Journée de Martin Luther King, Jr.', pt: 'Dia de Martin Luther King, Jr.', 'pt-BR': 'Dia de Martin Luther King, Jr.', it: 'Giornata di Martin Luther King, Jr.', de: 'Martin-Luther-King-Jr.-Tag' },
  "Washington's Birthday": { en: "Washington's Birthday", es: 'Cumpleaños de Washington', fr: 'Anniversaire de Washington', pt: 'Aniversário de Washington', 'pt-BR': 'Aniversário de Washington', it: 'Compleanno di Washington', de: 'Washingtons Geburtstag' },
  'Good Friday': { en: 'Good Friday', es: 'Viernes Santo', fr: 'Vendredi saint', pt: 'Sexta-feira Santa', 'pt-BR': 'Sexta-feira Santa', it: 'Venerdì Santo', de: 'Karfreitag' },
  'Memorial Day': { en: 'Memorial Day', es: 'Día de los Caídos', fr: 'Jour du souvenir des militaires morts', pt: 'Dia de homenagem aos militares mortos', 'pt-BR': 'Dia de homenagem aos militares mortos', it: 'Giornata in memoria dei caduti', de: 'Gedenktag für gefallene US-Soldaten' },
  Juneteenth: { en: 'Juneteenth', es: 'Juneteenth', fr: 'Juneteenth', pt: 'Juneteenth', 'pt-BR': 'Juneteenth', it: 'Juneteenth', de: 'Juneteenth' },
  'Independence Day': { en: 'Independence Day', es: 'Día de la Independencia de EE. UU.', fr: 'Fête de l’indépendance des États-Unis', pt: 'Dia da Independência dos EUA', 'pt-BR': 'Dia da Independência dos EUA', it: 'Giorno dell’indipendenza degli Stati Uniti', de: 'Unabhängigkeitstag der USA' },
  'Labor Day': { en: 'Labor Day', es: 'Día del Trabajo de EE. UU.', fr: 'Fête du travail aux États-Unis', pt: 'Dia do Trabalho nos EUA', 'pt-BR': 'Dia do Trabalho nos EUA', it: 'Festa del lavoro negli Stati Uniti', de: 'US-Tag der Arbeit' },
  'Thanksgiving Day': { en: 'Thanksgiving Day', es: 'Día de Acción de Gracias', fr: 'Jour de Thanksgiving', pt: 'Dia de Ação de Graças', 'pt-BR': 'Dia de Ação de Graças', it: 'Giorno del Ringraziamento', de: 'Erntedankfest der USA' },
  'Christmas Day': { en: 'Christmas Day', es: 'Navidad', fr: 'Noël', pt: 'Natal', 'pt-BR': 'Natal', it: 'Natale', de: 'Weihnachten' },
};
const OBSERVED_LABEL: Record<BriefLanguage, string> = { en: 'observed', es: 'fecha de observancia', fr: 'jour observé', pt: 'data de observância', 'pt-BR': 'data de observância', it: 'data di osservanza', de: 'Ersatzfeiertag' };

export function localizedHolidayName(name: string, language: BriefLanguage): string {
  const observed = name.endsWith(' (observed)');
  const canonical = observed ? name.slice(0, -' (observed)'.length) : name;
  const label = HOLIDAY_LABELS[canonical]?.[language];
  return label ? `${label}${observed ? ` (${OBSERVED_LABEL[language]})` : ''}` : name;
}
