import type { AppLanguage } from '../../src/lib/app-language.js';

const COPY = {
  method_not_allowed: ['Method not allowed', 'Método no permitido', 'Méthode non autorisée', 'Método não permitido', 'Metodo non consentito', 'Methode nicht erlaubt'],
  daily_limit: ['Daily limit reached ({0}/day). Resets in 24h. Save your queries for the insights that matter most.', 'Límite diario alcanzado ({0}/día). Se restablece en 24 horas. Reserva tus consultas para los análisis más importantes.', 'Limite quotidienne atteinte ({0}/jour). Réinitialisation dans 24 h. Gardez vos requêtes pour les analyses les plus importantes.', 'Limite diário atingido ({0}/dia). Reinicia em 24 horas. Guarda as consultas para as análises mais importantes.', 'Limite giornaliero raggiunto ({0}/giorno). Si ripristina tra 24 ore. Conserva le richieste per le analisi più importanti.', 'Tageslimit erreicht ({0}/Tag). Wird in 24 Stunden zurückgesetzt. Hebe deine Anfragen für die wichtigsten Analysen auf.'],
  capacity: ['Bobby is at capacity today. Try again tomorrow.', 'Bobby alcanzó su capacidad de hoy. Inténtalo mañana.', 'Bobby a atteint sa capacité du jour. Réessayez demain.', 'Bobby atingiu a capacidade de hoje. Tenta amanhã.', 'Bobby ha raggiunto la capacità di oggi. Riprova domani.', 'Bobby hat heute seine Kapazität erreicht. Versuche es morgen erneut.'],
  missing_context: ['Missing context or data', 'Falta contexto o datos', 'Contexte ou données manquants', 'Falta contexto ou dados', 'Contesto o dati mancanti', 'Kontext oder Daten fehlen'],
  invalid_context: ['Invalid context. Valid: {0}', 'Contexto no válido. Válidos: {0}', 'Contexte non valide. Contextes valides : {0}', 'Contexto inválido. Válidos: {0}', 'Contesto non valido. Validi: {0}', 'Ungültiger Kontext. Gültig: {0}'],
  generation_failed: ['Failed to generate explanation', 'No se pudo generar la explicación', 'Impossible de générer l’explication', 'Não foi possível gerar a explicação', 'Impossibile generare la spiegazione', 'Die Erklärung konnte nicht erstellt werden'],
  stream_interrupted: ['Stream interrupted', 'La transmisión se interrumpió', 'Transmission interrompue', 'A transmissão foi interrompida', 'Trasmissione interrotta', 'Übertragung unterbrochen'],
} as const;

export type ExplainErrorCode = keyof typeof COPY;
const INDEX: Record<AppLanguage, number> = { en: 0, es: 1, fr: 2, pt: 3, it: 4, de: 5 };
/** Error codes are stable; translated copy never alters the caller's data or limit. */
export function explainError(language: AppLanguage, code: ExplainErrorCode, ...values: unknown[]): string {
  return COPY[code][INDEX[language]].replace(/\{(\d+)\}/g, (token, index) => Number(index) < values.length ? String(values[Number(index)]) : token);
}
