// ============================================================
// The questions Bobby may ask a person (context v1), and every value an answer to one can be. One static
// catalog, the same for the server and the clients: shared/harness/companion-contract-v1/questions.json is
// this file's catalog, and scripts/test-companion.mts fails when the two differ. A client shows a question and
// its options from its own copy and turns a tap into a note itself, with no request.
//
// Nothing here is chosen by a model. Which question comes next is code (api/_lib/companion-context.ts), and an
// answer is one of the values listed here or it is not kept: there is no free text about a person anywhere.
//   · `day`: the first return day a question may be asked (four on day one, then one more a day);
//   · `money`: the question is about the person's own money, so its note needs the second consent;
//   · `source`: where a tapped option comes from: the person `said` it, or it was `shown` in an exercise (the
//     fall is a game with made-up numbers, not something they said about themselves);
//   · `spoken`: values no button offers. Only the reader of a spoken or typed answer returns them
//     (api/_lib/companion-reader.ts).
//   · `labels`: the words for each of those values, and `unsure` at the top for every question: a note is
//     always shown in the catalog's own words, never in a model's.
//   · `why`: one line a client shows under the question: what the answer is for. The two money questions of
//     day one say "that money" (the owner's wording), so their line also says which money is meant.
// The wording is the owner's (2026-10-10), informal in the six languages; Portuguese is Brazil's.
// ============================================================
import type { AppLanguage } from '../../src/lib/app-language.js';

export const CATALOG_VERSION = 1;
/** In the order Bobby asks them. */
export const QUESTION_IDS = ['interest', 'barrier', 'when', 'cushion', 'hurry', 'fall', 'belief', 'format'] as const;
export type QuestionId = typeof QUESTION_IDS[number];
type Words = Record<AppLanguage, string>;
export interface CatalogQuestion {
  id: QuestionId; day: number; money: boolean; source: 'said' | 'shown';
  text: Words; why: Words; options: Array<{ id: string; label: Words }>; spoken: string[];
  /** The words for each `spoken` value, so a note the reader made can be shown as the buttons' own are. */
  labels: Record<string, Words>;
}

// Written as the owner's table is: es, en, fr, pt, it, de.
const six = (es: string, en: string, fr: string, pt: string, it: string, de: string): Words => ({ en, es, fr, pt, it, de });
const option = (id: string, ...label: Parameters<typeof six>) => ({ id, label: six(...label) });
/** "I don't know" is an answer wherever it is offered, and what the reader returns for an answer it cannot place. */
export const UNSURE = 'unsure';
const unsure = () => option(UNSURE, 'No sé', "I don't know", 'Je ne sais pas', 'Não sei', 'Non lo so', 'Ich weiß es nicht');

const QUESTIONS: CatalogQuestion[] = [
  {
    id: 'interest', day: 1, money: false, source: 'said',
    text: six('¿Algo te llama la atención?', 'Does anything catch your eye?', "Quelque chose t'attire ?", 'Alguma coisa chama sua atenção?', "C'è qualcosa che ti incuriosisce?", 'Gibt es etwas, das dich neugierig macht?'),
    why: six('Para ponerte ejemplos de lo que ya te interesa.', 'So my examples are about what already interests you.', "Pour te donner des exemples sur ce qui t'intéresse déjà.", 'Para te dar exemplos do que já te interessa.', 'Per farti esempi su ciò che già ti interessa.', 'Damit meine Beispiele zu dem passen, was dich schon interessiert.'),
    options: [
      option('companies', 'Empresas que conozco', 'Companies I know', 'Des entreprises que je connais', 'Empresas que conheço', 'Aziende che conosco', 'Firmen, die ich kenne'),
      option('crypto', 'Cripto', 'Crypto', 'Crypto', 'Cripto', 'Cripto', 'Krypto'),
      option('government', 'Algo del gobierno', 'Something from the government', "Quelque chose de l'État", 'Algo do governo', 'Qualcosa dello Stato', 'Etwas vom Staat'),
      option('property', 'Una propiedad', 'Property', "L'immobilier", 'Um imóvel', 'Una casa', 'Immobilien'),
      option('none', 'Ni idea', 'No idea', 'Aucune idée', 'Não faço ideia', 'Non ne ho idea', 'Keine Ahnung'),
    ],
    spoken: ['funds', 'gold', 'other'],
    labels: { funds: six('Fondos', 'Funds', 'Des fonds', 'Fundos', 'Fondi', 'Fonds'), gold: six('Oro', 'Gold', "L'or", 'Ouro', 'Oro', 'Gold'), other: six('Otra cosa', 'Something else', 'Autre chose', 'Outra coisa', 'Altro', 'Etwas anderes') },
  },
  {
    id: 'barrier', day: 1, money: false, source: 'said',
    text: six('¿Qué te ha detenido hasta hoy?', 'What has stopped you until today?', "Qu'est-ce qui t'a retenu jusqu'ici ?", 'O que te segurou até hoje?', 'Che cosa ti ha frenato finora?', 'Was hat dich bisher abgehalten?'),
    why: six('Para empezar por lo que más te frena.', 'So I start with what holds you back the most.', 'Pour commencer par ce qui te freine le plus.', 'Para começar pelo que mais te trava.', 'Per partire da ciò che ti frena di più.', 'Damit ich bei dem anfange, was dich am meisten bremst.'),
    options: [
      option('fear_of_loss', 'Miedo a perder', 'Fear of losing', 'La peur de perdre', 'Medo de perder', 'Paura di perdere', 'Angst zu verlieren'),
      option('words', 'No entiendo las palabras', "I don't get the words", 'Je ne comprends pas les mots', 'Não entendo os termos', 'Non capisco i termini', 'Ich verstehe die Begriffe nicht'),
      option('where_to_start', 'No sé por dónde empezar', "I don't know where to start", 'Je ne sais pas par où commencer', 'Não sei por onde começar', 'Non so da dove cominciare', 'Ich weiß nicht, wo ich anfangen soll'),
      option('no_money', 'Siento que no me alcanza', "I feel I don't have enough", "J'ai l'impression de ne pas avoir assez", 'Sinto que não tenho o bastante', 'Mi sembra di non avere abbastanza', 'Ich habe das Gefühl, es reicht nicht'),
      option('distrust', 'No confío', "I don't trust it", "Je n'ai pas confiance", 'Não confio', 'Non mi fido', 'Ich traue dem nicht'),
    ],
    spoken: ['no_time', 'none', 'other'],
    labels: { no_time: six('No tengo tiempo', "I don't have time", "Je n'ai pas le temps", 'Não tenho tempo', 'Non ho tempo', 'Ich habe keine Zeit'), none: six('Nada en especial', 'Nothing in particular', 'Rien de particulier', 'Nada em especial', 'Niente di particolare', 'Nichts Besonderes'), other: six('Otra cosa', 'Something else', 'Autre chose', 'Outra coisa', 'Altro', 'Etwas anderes') },
  },
  {
    id: 'when', day: 1, money: true, source: 'said',
    text: six('¿Cuándo crees que vas a necesitar ese dinero?', 'When do you think you will need that money?', 'Quand penses-tu avoir besoin de cet argent ?', 'Quando você acha que vai precisar desse dinheiro?', 'Quando pensi che ti servirà quel denaro?', 'Wann, glaubst du, brauchst du das Geld?'),
    why: six('Hablo del dinero que pensarías invertir. El plazo cambia qué riesgos importan.', 'I mean the money you might invest. The time frame changes which risks matter.', "Je parle de l'argent que tu penserais placer. L'horizon change les risques qui comptent.", 'Falo do dinheiro que você pensaria em investir. O prazo muda quais riscos importam.', "Parlo dei soldi che penseresti di investire. L'orizzonte cambia quali rischi contano.", 'Ich meine das Geld, das du anlegen würdest. Der Zeitraum verändert, welche Risiken zählen.'),
    options: [
      option('under_2y', 'En menos de 2 años', 'In under 2 years', 'Dans moins de 2 ans', 'Em menos de 2 anos', 'Tra meno di 2 anni', 'In weniger als 2 Jahren'),
      option('2_to_7y', 'En 2 a 7 años', 'In 2 to 7 years', 'Dans 2 à 7 ans', 'Em 2 a 7 anos', 'Tra 2 e 7 anni', 'In 2 bis 7 Jahren'),
      option('over_7y', 'En más de 7 años', 'In more than 7 years', 'Dans plus de 7 ans', 'Em mais de 7 anos', 'Tra più di 7 anni', 'In mehr als 7 Jahren'),
      unsure(),
    ],
    spoken: [], labels: {},
  },
  {
    id: 'cushion', day: 1, money: true, source: 'said',
    text: six('Si mañana te saliera un gasto inesperado, ¿necesitarías ese dinero?', 'If an unexpected expense came up tomorrow, would you need that money?', 'Si une dépense imprévue arrivait demain, aurais-tu besoin de cet argent ?', 'Se amanhã surgisse um gasto inesperado, você precisaria desse dinheiro?', 'Se domani arrivasse una spesa imprevista, ti servirebbe quel denaro?', 'Wenn morgen eine unerwartete Ausgabe käme, bräuchtest du dieses Geld?'),
    why: six('Hablo del dinero que pensarías invertir. Si podrías necesitarlo mañana, se explica distinto.', 'I mean the money you might invest. If you might need it tomorrow, I explain things differently.', "Je parle de l'argent que tu penserais placer. Si tu peux en avoir besoin demain, je l'explique autrement.", 'Falo do dinheiro que você pensaria em investir. Se puder precisar dele amanhã, a explicação muda.', 'Parlo dei soldi che penseresti di investire. Se potrebbero servirti domani, la spiegazione cambia.', 'Ich meine das Geld, das du anlegen würdest. Wenn du es morgen brauchen könntest, erkläre ich anders.'),
    options: [option('would_need_it', 'Sí', 'Yes', 'Oui', 'Sim', 'Sì', 'Ja'), option('would_not', 'No', 'No', 'Non', 'Não', 'No', 'Nein'), unsure()],
    spoken: [], labels: {},
  },
  {
    id: 'hurry', day: 2, money: true, source: 'said',
    text: six('¿Qué tan pronto te gustaría ver resultados?', 'How soon would you like to see results?', 'En combien de temps aimerais-tu voir des résultats ?', 'Em quanto tempo você gostaria de ver resultados?', 'Tra quanto vorresti vedere risultati?', 'Wie schnell möchtest du Ergebnisse sehen?'),
    why: six('Para explicarte qué suele moverse rápido y qué toma tiempo.', 'So I can explain what tends to move fast and what takes time.', "Pour t'expliquer ce qui bouge vite et ce qui prend du temps.", 'Para te explicar o que costuma se mexer rápido e o que leva tempo.', 'Per spiegarti cosa di solito si muove in fretta e cosa richiede tempo.', 'Damit ich erkläre, was sich meist schnell bewegt und was Zeit braucht.'),
    options: [option('soon', 'Pronto', 'Soon', 'Vite', 'Logo', 'Presto', 'Bald'), option('no_rush', 'Sin prisa', 'No rush', 'Sans me presser', 'Sem pressa', 'Senza fretta', 'Ohne Eile'), unsure()],
    spoken: [], labels: {},
  },
  {
    id: 'fall', day: 3, money: true, source: 'shown',
    text: six('Solo jugando: 100 pasa a 80. ¿Qué harías?', 'Just playing: 100 becomes 80. What would you do?', 'Juste pour jouer : 100 devient 80. Que ferais-tu ?', 'Só de brincadeira: 100 vira 80. O que você faria?', 'Solo per gioco: 100 diventa 80. Che cosa faresti?', 'Nur zum Spiel: Aus 100 werden 80. Was würdest du tun?'),
    why: six('No hay respuesta correcta. Me ayuda a explicarte qué significa una caída.', 'There is no right answer. It helps me explain what a drop means.', "Il n'y a pas de bonne réponse. Ça m'aide à t'expliquer ce qu'est une baisse.", 'Não há resposta certa. Me ajuda a te explicar o que significa uma queda.', "Non c'è una risposta giusta. Mi aiuta a spiegarti cosa significa un calo.", 'Es gibt keine richtige Antwort. Es hilft mir zu erklären, was ein Rückgang bedeutet.'),
    options: [
      option('pause', 'Pararía', 'I would stop', "J'arrêterais", 'Eu pararia', 'Mi fermerei', 'Ich würde aufhören'),
      option('understand', 'Querría entender por qué', 'I would want to know why', 'Je voudrais comprendre pourquoi', 'Ia querer entender o porquê', 'Vorrei capire perché', 'Ich würde verstehen wollen, warum'),
      option('continue', 'Seguiría', 'I would carry on', 'Je continuerais', 'Eu continuaria', 'Andrei avanti', 'Ich würde weitermachen'),
      unsure(),
    ],
    spoken: [], labels: {},
  },
  {
    id: 'belief', day: 4, money: false, source: 'said',
    text: six('¿Qué has oído siempre sobre el dinero o invertir que das por cierto?', 'What have you always heard about money or investing that you take as true?', "Qu'as-tu toujours entendu sur l'argent ou l'investissement que tu tiens pour vrai ?", 'O que você sempre ouviu sobre dinheiro ou investir e dá como certo?', 'Che cosa hai sempre sentito sul denaro o sugli investimenti che dai per vero?', 'Was hast du über Geld oder Geldanlage immer gehört und hältst es für wahr?'),
    why: six('Para mostrarte qué dicen los datos sobre eso.', 'So I can show you what the data says about it.', 'Pour te montrer ce que disent les données là-dessus.', 'Para te mostrar o que os dados dizem sobre isso.', 'Per mostrarti cosa dicono i dati al riguardo.', 'Damit ich dir zeige, was die Daten dazu sagen.'),
    options: [
      option('market_is_casino', 'La bolsa es un casino', 'The stock market is a casino', "La Bourse, c'est un casino", 'A bolsa é um cassino', 'La borsa è un casinò', 'Die Börse ist ein Casino'),
      option('need_lots_of_money', 'Se necesita mucho dinero', 'You need a lot of money', "Il faut beaucoup d'argent", 'Precisa de muito dinheiro', 'Servono tanti soldi', 'Man braucht viel Geld'),
      option('too_late', 'Ya voy tarde', 'I am already late', "Je m'y prends trop tard", 'Já é tarde para mim', 'Ormai è tardi', 'Ich bin schon zu spät dran'),
      option('none', 'Nada en especial', 'Nothing in particular', 'Rien de particulier', 'Nada em especial', 'Niente di particolare', 'Nichts Besonderes'),
    ],
    spoken: ['gold_is_safe', 'property_is_safe', 'government_is_safe', 'savings_is_safest', 'lose_it_all', 'banks_keep_it', 'crypto_is_fast', 'other'],
    labels: {
      gold_is_safe: six('El oro nunca pierde', 'Gold never loses', "L'or ne perd jamais", 'O ouro nunca perde', "L'oro non perde mai", 'Gold verliert nie'),
      property_is_safe: six('Una propiedad nunca pierde', 'Property never loses', "L'immobilier ne perd jamais", 'Imóvel nunca perde', 'Il mattone non perde mai', 'Immobilien verlieren nie'),
      government_is_safe: six('Lo del gobierno no puede perder', 'What the government sells cannot lose', "Ce que vend l'État ne peut pas perdre", 'O que é do governo não tem como perder', 'Ciò che vende lo Stato non può perdere', 'Was der Staat verkauft, kann nicht verlieren'),
      savings_is_safest: six('La cuenta de ahorro es lo más seguro', 'A savings account is the safest', "Le livret, c'est le plus sûr", 'A poupança é o mais seguro', 'Il conto di risparmio è la cosa più sicura', 'Das Sparbuch ist das Sicherste'),
      lose_it_all: six('Si baja, ya lo perdiste', 'If it falls, you have lost it', "Si ça baisse, c'est perdu", 'Se cair, já perdeu', "Se scende, l'hai perso", 'Wenn es fällt, ist es weg'),
      banks_keep_it: six('Los bancos se quedan con todo', 'The banks keep it all', 'Les banques gardent tout', 'Os bancos ficam com tudo', 'Le banche si tengono tutto', 'Die Banken behalten alles'),
      crypto_is_fast: six('Con cripto te haces rico rápido', 'Crypto makes you rich fast', 'La crypto rend riche vite', 'Com cripto se fica rico rápido', 'Con le cripto si diventa ricchi in fretta', 'Mit Krypto wird man schnell reich'),
      other: six('Otra cosa', 'Something else', 'Autre chose', 'Outra coisa', 'Altro', 'Etwas anderes'),
    },
  },
  {
    id: 'format', day: 5, money: false, source: 'said',
    text: six('¿Cómo te explico mejor?', 'How do I explain best for you?', "Comment je t'explique le mieux ?", 'Como eu te explico melhor?', 'Come ti spiego meglio?', 'Wie erkläre ich es dir am besten?'),
    why: six('Para explicarte como mejor te funcione.', 'So I explain the way that works for you.', "Pour t'expliquer de la façon qui te convient.", 'Para te explicar do jeito que funciona melhor para você.', 'Per spiegarti nel modo che funziona per te.', 'Damit ich so erkläre, wie es für dich passt.'),
    options: [option('examples', 'Con ejemplos', 'With examples', 'Avec des exemples', 'Com exemplos', 'Con esempi', 'Mit Beispielen'), option('steps', 'Paso a paso', 'Step by step', 'Étape par étape', 'Passo a passo', 'Passo dopo passo', 'Schritt für Schritt')],
    spoken: [], labels: {},
  },
];

/** The catalog as a client holds it: `skip` is the label of the way out every question has. */
export const COMPANION_CATALOG = {
  version: CATALOG_VERSION, skip: six('Omitir', 'Skip', 'Passer', 'Pular', 'Salta', 'Überspringen'),
  /** The words for `unsure` on a question that has no such button. */
  unsure: unsure().label, questions: QUESTIONS,
};

const BY_ID = Object.fromEntries(QUESTIONS.map((question) => [question.id, question])) as Record<QuestionId, CatalogQuestion>;
export const companionQuestion = (id: QuestionId): CatalogQuestion => BY_ID[id];
/** Every value an answer to this question can be: its options, what only a spoken answer can mean, and `unsure`. */
export const questionValues = (question: CatalogQuestion): string[] => [...new Set([...question.options.map((o) => o.id), ...question.spoken, UNSURE])];
