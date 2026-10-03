/** Request, model and memory locales share this explicit six-language contract. */
export const DESK_LANGUAGES = ['en', 'es', 'pt', 'fr', 'it', 'de'] as const;
export type DeskLanguage = typeof DESK_LANGUAGES[number];
export const isDeskLanguage = (value: unknown): value is DeskLanguage =>
  typeof value === 'string' && (DESK_LANGUAGES as readonly string[]).includes(value);

export const DESK_LOCALES: Record<DeskLanguage, string> = {
  en: 'en-US', es: 'es-MX', pt: 'pt-BR', fr: 'fr-FR', it: 'it-IT', de: 'de-DE',
};
export const DESK_LANGUAGE_NAMES: Record<DeskLanguage, string> = {
  en: 'English', es: 'Spanish', pt: 'Brazilian Portuguese', fr: 'French', it: 'Italian', de: 'German',
};

const EN = {
  method: 'Method not allowed', origin: 'Origin not allowed',
  invalid: 'Choose an asset and type a question.',
  tooLong: 'Your question is too long. Keep it to 1,200 characters or fewer.',
  unavailable: 'The analysis desk is temporarily unavailable.',
  failed: 'The analysis could not finish. Please retry. No verdict was issued.',
  paused: 'The desk is paused for now. Try again later.',
  premiumPaused: 'Deep and Max are paused for today. Quick still works.',
  signinLevel: 'Create your free account to use this level.',
  upgrade: 'You used this level for now. Get Bobby Pro or invite a friend.',
  exhausted: 'You used this level for this month.',
  signinRead: 'Create your free account to keep reading.',
  readsUsed: 'Your general read allowance is used for now.',
  daily: "Bobby reached today's analysis limit. Try again tomorrow.",
};
type DeskCopyKey = keyof typeof EN;
const COPY: Record<DeskLanguage, Record<DeskCopyKey, string>> = {
  en: EN,
  es: {
    method: 'Método no permitido', origin: 'Origen no permitido',
    invalid: 'Elige un activo y escribe una pregunta.',
    tooLong: 'Tu pregunta es demasiado larga. Usa 1,200 caracteres o menos.',
    unavailable: 'La mesa de análisis no está disponible por ahora.',
    failed: 'El análisis no pudo terminar. Inténtalo de nuevo. No se emitió ningún veredicto.',
    paused: 'El desk está en pausa por ahora. Inténtalo más tarde.',
    premiumPaused: 'Profundo y Máximo están en pausa por hoy. Rápido sigue disponible.',
    signinLevel: 'Crea tu cuenta gratis para usar este nivel.',
    upgrade: 'Ya usaste este nivel por ahora. Obtén Bobby Pro o invita a un amigo.',
    exhausted: 'Ya usaste este nivel este mes.',
    signinRead: 'Crea tu cuenta gratis para seguir leyendo.',
    readsUsed: 'Tu cupo de lecturas generales se agotó por ahora.',
    daily: 'Bobby llegó al límite de análisis de hoy. Vuelve a intentarlo mañana.',
  },
  pt: {
    method: 'Método não permitido', origin: 'Origem não permitida',
    invalid: 'Escolha um ativo e escreva uma pergunta.',
    tooLong: 'Sua pergunta é longa demais. Use no máximo 1.200 caracteres.',
    unavailable: 'A mesa de análise está temporariamente indisponível.',
    failed: 'A análise não pôde ser concluída. Tente novamente. Nenhum veredito foi emitido.',
    paused: 'A mesa está pausada por enquanto. Tente novamente mais tarde.',
    premiumPaused: 'Profundo e Máximo estão pausados hoje. Rápido continua disponível.',
    signinLevel: 'Crie sua conta gratuita para usar este nível.',
    upgrade: 'Você já usou este nível por enquanto. Assine Bobby Pro ou convide um amigo.',
    exhausted: 'Você já usou este nível neste mês.',
    signinRead: 'Crie sua conta gratuita para continuar lendo.',
    readsUsed: 'Seu limite de leituras gerais foi usado por enquanto.',
    daily: 'Bobby atingiu o limite de análises de hoje. Tente novamente amanhã.',
  },
  fr: {
    method: 'Méthode non autorisée', origin: 'Origine non autorisée',
    invalid: 'Choisissez un actif et écrivez une question.',
    tooLong: 'Votre question est trop longue. Limitez-la à 1 200 caractères.',
    unavailable: "Le bureau d’analyse est temporairement indisponible.",
    failed: "L’analyse n’a pas pu se terminer. Réessayez. Aucun verdict n’a été rendu.",
    paused: 'Le bureau est en pause pour le moment. Réessayez plus tard.',
    premiumPaused: "Les niveaux Approfondi et Maximum sont en pause aujourd’hui. Rapide reste disponible.",
    signinLevel: 'Créez votre compte gratuit pour utiliser ce niveau.',
    upgrade: 'Vous avez utilisé ce niveau pour le moment. Passez à Bobby Pro ou invitez un ami.',
    exhausted: 'Vous avez utilisé ce niveau pour ce mois-ci.',
    signinRead: 'Créez votre compte gratuit pour continuer à lire.',
    readsUsed: 'Votre quota de lectures générales est épuisé pour le moment.',
    daily: "Bobby a atteint la limite d’analyses du jour. Réessayez demain.",
  },
  it: {
    method: 'Metodo non consentito', origin: 'Origine non consentita',
    invalid: 'Scegli un asset e scrivi una domanda.',
    tooLong: 'La domanda è troppo lunga. Usa al massimo 1.200 caratteri.',
    unavailable: 'Il desk di analisi è temporaneamente indisponibile.',
    failed: 'Non è stato possibile completare l’analisi. Riprova. Non è stato emesso alcun verdetto.',
    paused: 'Il desk è in pausa per il momento. Riprova più tardi.',
    premiumPaused: 'Approfondito e Massimo sono in pausa oggi. Rapido resta disponibile.',
    signinLevel: 'Crea il tuo account gratuito per usare questo livello.',
    upgrade: 'Hai già usato questo livello per il momento. Passa a Bobby Pro o invita un amico.',
    exhausted: 'Hai già usato questo livello per questo mese.',
    signinRead: 'Crea il tuo account gratuito per continuare a leggere.',
    readsUsed: 'La quota di letture generali è esaurita per il momento.',
    daily: 'Bobby ha raggiunto il limite di analisi di oggi. Riprova domani.',
  },
  de: {
    method: 'Methode nicht erlaubt', origin: 'Herkunft nicht erlaubt',
    invalid: 'Wähle einen Vermögenswert und stelle eine Frage.',
    tooLong: 'Deine Frage ist zu lang. Verwende höchstens 1.200 Zeichen.',
    unavailable: 'Der Analysebereich ist vorübergehend nicht verfügbar.',
    failed: 'Die Analyse konnte nicht abgeschlossen werden. Versuche es erneut. Es wurde kein Urteil ausgegeben.',
    paused: 'Der Analysebereich ist vorerst pausiert. Versuche es später erneut.',
    premiumPaused: 'Vertieft und Maximum sind heute pausiert. Schnell bleibt verfügbar.',
    signinLevel: 'Erstelle dein kostenloses Konto, um diese Stufe zu nutzen.',
    upgrade: 'Du hast diese Stufe vorerst genutzt. Hole dir Bobby Pro oder lade einen Freund ein.',
    exhausted: 'Du hast diese Stufe für diesen Monat genutzt.',
    signinRead: 'Erstelle dein kostenloses Konto, um weiterzulesen.',
    readsUsed: 'Dein Kontingent für allgemeine Analysen ist vorerst aufgebraucht.',
    daily: 'Bobby hat das heutige Analyselimit erreicht. Versuche es morgen erneut.',
  },
};

export const deskCopy = (language: DeskLanguage, key: DeskCopyKey): string => COPY[language][key];
