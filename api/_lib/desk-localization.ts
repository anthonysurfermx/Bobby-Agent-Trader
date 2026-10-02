import type { AppLanguage } from '../../src/lib/app-language.js';
const ERRORS: Record<string, readonly [string, string, string, string]> = {
  'Choose an asset and type a question.': ['Choisissez un actif et saisissez une question.', 'Escolhe um ativo e escreve uma pergunta.', 'Scegli un asset e scrivi una domanda.', 'Wähle einen Vermögenswert und gib eine Frage ein.'],
  'Your question is too long. Keep it to 1,200 characters or fewer.': ['Votre question est trop longue. Limitez-la à 1 200 caractères.', 'A pergunta é demasiado longa. Usa até 1.200 caracteres.', 'La domanda è troppo lunga. Usa al massimo 1.200 caratteri.', 'Deine Frage ist zu lang. Verwende höchstens 1.200 Zeichen.'],
  'The analysis desk is temporarily unavailable.': ['Le bureau d’analyse est temporairement indisponible.', 'A mesa de análise está temporariamente indisponível.', 'La sala di analisi è temporaneamente indisponibile.', 'Die Analyse ist vorübergehend nicht verfügbar.'],
  'The analysis could not finish. Please retry. No verdict was issued.': ['L’analyse n’a pas pu se terminer. Réessayez. Aucun verdict n’a été émis.', 'A análise não terminou. Tenta novamente. Não foi emitido nenhum veredicto.', 'L’analisi non è stata completata. Riprova. Non è stato emesso alcun verdetto.', 'Die Analyse konnte nicht abgeschlossen werden. Versuche es erneut. Es wurde kein Urteil abgegeben.'],
  'The desk is paused for now. Try again later.': ['Le bureau est en pause. Réessayez plus tard.', 'A mesa está em pausa. Tenta mais tarde.', 'La sala è in pausa. Riprova più tardi.', 'Die Analyse ist pausiert. Versuche es später erneut.'],
  'Deep and Max are paused for today. Quick still works.': ['Approfondi et Maximum sont en pause aujourd’hui. Rapide reste disponible.', 'Profundo e Máximo estão em pausa hoje. Rápido continua disponível.', 'Approfondito e Massimo sono in pausa oggi. Rapido è disponibile.', 'Vertieft und Maximum sind heute pausiert. Schnell bleibt verfügbar.'],
  'Create your free account to use this level.': ['Créez votre compte gratuit pour utiliser ce niveau.', 'Cria uma conta gratuita para usar este nível.', 'Crea un account gratuito per usare questo livello.', 'Erstelle dein kostenloses Konto, um diese Stufe zu nutzen.'],
  'You used this level for now. Get Bobby Pro or invite a friend.': ['Vous avez utilisé ce niveau pour le moment. Passez à Bobby Pro ou invitez un ami.', 'Já usaste este nível. Obtém Bobby Pro ou convida um amigo.', 'Hai esaurito questo livello per ora. Ottieni Bobby Pro o invita un amico.', 'Du hast diese Stufe vorerst aufgebraucht. Hol dir Bobby Pro oder lade jemanden ein.'],
  'You used this level for this month.': ['Vous avez utilisé ce niveau pour ce mois-ci.', 'Já usaste este nível este mês.', 'Hai esaurito questo livello per questo mese.', 'Du hast diese Stufe für diesen Monat aufgebraucht.'],
  'Create your free account to keep reading.': ['Créez votre compte gratuit pour continuer vos analyses.', 'Cria uma conta gratuita para continuar as análises.', 'Crea un account gratuito per continuare le analisi.', 'Erstelle dein kostenloses Konto, um weitere Analysen zu lesen.'],
  'Your general read allowance is used for now.': ['Votre quota d’analyses générales est épuisé pour le moment.', 'O limite de análises gerais foi atingido.', 'Hai esaurito il limite di analisi generali per ora.', 'Dein Kontingent für allgemeine Analysen ist vorerst aufgebraucht.'],
  "Bobby reached today's analysis limit. Try again tomorrow.": ['Bobby a atteint la limite d’analyses du jour. Réessayez demain.', 'Bobby atingiu o limite de análises de hoje. Tenta amanhã.', 'Bobby ha raggiunto il limite di analisi di oggi. Riprova domani.', 'Bobby hat das heutige Analyselimit erreicht. Versuche es morgen erneut.'],
};
export function deskErrorCopy(language: AppLanguage, en: string, es: string): string {
  if (language === 'en') return en;
  if (language === 'es') return es;
  const index = { fr: 0, pt: 1, it: 2, de: 3 } as const;
  return ERRORS[en]?.[index[language]] ?? en;
}
