# Privacy text for errands · DRAFT, not published

**Nothing here is on the privacy page.** It is the wording the owner has to read and approve before the engine is
opened to everyone (`BOBBY_AGENT_ENGINE=on`). Until then the engine runs for a private pilot only.

## Why the page has to change

The page says today (section "Questions and market analysis"):

> Bobby does not store your questions, does not add them to your account, and keeps no conversation history on its
> servers.

An errand does store something, for a short time. When Bobby asks permission to read market data for a question,
the server keeps:

| What | Where | For how long | Tied to |
|---|---|---|---|
| The question as the person wrote or said it | `agent_tasks.question` | until the errand has been idle 24 hours | a salted hash of the install id, and a salted hash of the network address |
| The steps: what the model asked for, the figures the code computed, the approval, the answer | `agent_steps.data` | the same 24 hours | the errand |
| That a read was used that day | `agent_reads` | goes with the errand | the same two hashes |
| What each model call cost | `agent_attempts` | 90 days | the errand's random id only: no text, no person |

Why it is kept at all: so that an answer is not lost, or paid for twice, when the connection drops between the
question, the yes and the answer; and so that a follow-up ("and its worst day?") can be answered from the same
figures without a second read. Never the person's name or account; never used to train anything; never added to
"What Bobby remembers".

The purge is `agent_purge` (migration `20261013062500_agent_engine.sql`), asked for by the door after a new errand,
at most every ten minutes. Tested: `scripts/test-agent-engine-pg.mts`.

## The sentence that changes

**en** · Outside the errands described below, Bobby does not store your questions, does not add them to your account,
and keeps no conversation history on its servers.

**es** · Fuera de los encargos que se describen abajo, Bobby no guarda tus preguntas, no las añade a tu cuenta y no
conserva historial de conversación en sus servidores.

**fr** · En dehors des demandes décrites ci-dessous, Bobby ne conserve pas tes questions, ne les ajoute pas à ton
compte et ne garde aucun historique de conversation sur ses serveurs.

**pt** · Fora dos pedidos descritos abaixo, o Bobby não guarda suas perguntas, não as adiciona à sua conta e não
mantém histórico de conversa nos seus servidores.

**it** · Al di fuori delle richieste descritte qui sotto, Bobby non conserva le tue domande, non le aggiunge al tuo
account e non tiene alcuna cronologia delle conversazioni sui suoi server.

**de** · Außerhalb der unten beschriebenen Aufträge speichert Bobby deine Fragen nicht, fügt sie deinem Konto nicht
hinzu und führt auf seinen Servern keinen Gesprächsverlauf.

## The paragraph that is added

**en** · When Bobby asks your permission to read market data for a question, its server keeps that question, the
steps it took and its answer for 24 hours. It does so for two reasons: so that the answer is not lost, or counted
twice, if the connection drops; and so that a follow-up question can refer to it. They are stored with a salted hash
of your install identifier and of your network, never with your name or your account, and they are deleted 24 hours
after the last activity. The cost of each AI request is kept for 90 days with no text and nothing that identifies you.

**es** · Cuando Bobby te pide permiso para leer datos de mercado para una pregunta, su servidor guarda esa pregunta,
los pasos que dio y su respuesta durante 24 horas. Lo hace por dos razones: para que la respuesta no se pierda ni se
cuente dos veces si se corta la conexión, y para que una pregunta de seguimiento pueda referirse a ella. Se guardan
con un hash con sal de tu identificador de instalación y de tu red, nunca con tu nombre ni tu cuenta, y se borran 24
horas después de la última actividad. El costo de cada solicitud de IA se guarda 90 días, sin texto y sin nada que te
identifique.

**fr** · Quand Bobby te demande la permission de lire des données de marché pour une question, son serveur conserve
cette question, les étapes suivies et sa réponse pendant 24 heures. Il le fait pour deux raisons : pour que la réponse
ne soit ni perdue ni comptée deux fois si la connexion est coupée, et pour qu'une question de suivi puisse s'y
référer. Elles sont enregistrées avec une empreinte salée de ton identifiant d'installation et de ton réseau, jamais
avec ton nom ni ton compte, et elles sont supprimées 24 heures après la dernière activité. Le coût de chaque requête
d'IA est conservé 90 jours, sans texte et sans rien qui t'identifie.

**pt** · Quando o Bobby pede sua permissão para ler dados de mercado para uma pergunta, o servidor dele guarda essa
pergunta, os passos que deu e a resposta por 24 horas. Faz isso por dois motivos: para que a resposta não se perca nem
seja contada duas vezes se a conexão cair, e para que uma pergunta de acompanhamento possa se referir a ela. Ficam
guardados com um hash com sal do seu identificador de instalação e da sua rede, nunca com seu nome nem com sua conta,
e são apagados 24 horas depois da última atividade. O custo de cada solicitação de IA fica guardado por 90 dias, sem
texto e sem nada que identifique você.

**it** · Quando Bobby ti chiede il permesso di leggere dati di mercato per una domanda, il suo server conserva quella
domanda, i passaggi fatti e la risposta per 24 ore. Lo fa per due motivi: perché la risposta non vada persa né venga
contata due volte se la connessione cade, e perché una domanda successiva possa farvi riferimento. Sono salvati con
un hash con sale del tuo identificativo di installazione e della tua rete, mai con il tuo nome né con il tuo account,
e vengono cancellati 24 ore dopo l'ultima attività. Il costo di ogni richiesta di IA è conservato per 90 giorni, senza
testo e senza nulla che ti identifichi.

**de** · Wenn Bobby dich um Erlaubnis bittet, für eine Frage Marktdaten zu lesen, speichert sein Server diese Frage,
die einzelnen Schritte und die Antwort 24 Stunden lang. Das hat zwei Gründe: damit die Antwort nicht verloren geht
oder doppelt gezählt wird, wenn die Verbindung abbricht, und damit sich eine Anschlussfrage darauf beziehen kann.
Gespeichert wird mit einem gesalzenen Hash deiner Installationskennung und deines Netzwerks, nie mit deinem Namen
oder deinem Konto, und gelöscht wird 24 Stunden nach der letzten Aktivität. Die Kosten jeder KI-Anfrage werden 90
Tage aufbewahrt, ohne Text und ohne etwas, das dich identifiziert.

## Before an app uses it

- **App Store privacy answers** (`docs/app-store/build-66/APP-PRIVACY-ANSWERS.md`, kept in step with the page): a
  question kept for 24 hours with an install hash is "collected" in Apple's sense (kept longer than the request
  takes). The label gains *User Content → Other User Content*, not linked to identity, not used for tracking, purpose
  *App Functionality*. To be confirmed against the form's wording when the build that calls the engine is submitted.
- **Google Play data safety**: the same item, "collected, not shared, processed ephemerally: no" with deletion after
  24 hours stated.
- The four other languages above were written by the model that wrote the code and have not been read by a person.
  The Portuguese is Brazil's, as on the rest of the page.
- The retention number lives in two places that must say the same: `AGENT_KEEP_HOURS` in `api/agent-task.ts` and the
  paragraph.
