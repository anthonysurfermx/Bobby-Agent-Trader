# Bobby 1.8 — how its screens look and speak

The owner saw the first 1.8 screens and rejected their form: far too much text. What Bobby achieved in the Núcleo (a sphere, one greeting, one question, three chips, one mic) is elegance, simplicity and sophistication, and every screen must stay at that level. This file is the result of a three-way pass (Claude, Codex, DeepSeek) on 2026-10-07. It decides structure and words for iOS; Android ports it.

## The bar

1. **One task per sheet.** One light title (at most 4 words), at most one supporting line (at most 9 words), rows of state, one main action (at most 3 words). Everything else is a quiet link or sits behind one tap.
2. **State, not sentences.** A number, a date, a glyph or a switch says it. No row carries an explanation under it. No section eyebrows (`LO QUE TIENES`), no cards, no boxed notes.
3. **Delete before you shorten.** If a line explains what the next line already shows, it goes. A third of the old words or less on every routine screen.
4. **The truth keeps its place.** Four things are never cut and never hidden behind a tap; they only get shorter:
   - before a person agrees to memory: what Bobby keeps, and each thing sent to the AI provider;
   - beside the button that sends a thesis: that its text goes to the AI providers, for this one review;
   - on a finished review: that it read price evidence only, and what it did not check;
   - after "Restore purchases": a result, every time, that stays on screen.
   Also kept: a reminder never suggests Bobby watches the market; a value the app does not have is not shown (never a zero in its place).
5. **Words.** Never buy, sell, profit, guaranteed, returns, advice, signal, alert (not even negated). Verdicts are only Wait / Review (Espera / Revisa). Informal address in six languages. Sentence case. No exclamation marks.
6. **Feel.** Titles in light rounded system type (26 pt), body 16 pt, one muted footnote size (13 pt). Monospaced digits for balances, dates and codes only. Flat rows with hairlines, 24 pt side margins, generous gaps; a routine sheet leaves a third of itself empty. No new colours; green and amber belong to the verdict word. 44 pt targets, Dynamic Type wraps and scrolls (never smaller type), VoiceOver labels on every glyph. Routine sheets open at half height so the sphere stays visible above them.
7. **The kit.** Build with `Sources/V18/V18Kit.swift` and nothing else: `QuietSheet`, `QuietRow`, `QuietPrimary`, `QuietChip`, `QuietLink`, `QuietNote`, `QuietDisclosure`, `QuietGlyph(Button)`. If a screen needs a piece the kit lacks, it probably has too much on it.

The nudge on the glass (one line, one button) is already at the bar and does not change.

## Screens

Counts are the words on the face of the reference state. `›` leads somewhere, `⌄` unfolds in place, `ⓘ` is the sheet's detail button, `…` its menu.

### Credits — about 20 words (was about 110)

```
Créditos                                    ⓘ ✕
Rápido                        +1 sáb     7/10
Profundo                      +1 dom      2/3
Máximo                                    1/1
De regalo            Rápido 3 · Profundo 2
Bobby Pro                         Inactivo  ›
Invitar ›      Código ›
Restaurar compras
```
- Deleted: the credit definition, "Lo que tienes", "Consigue más", "¿Ya pagaste?", the sentence under every row, the Pro benefits text, the restore explanation.
- A level row is `QuietRow(label, value: "7/10", note: "+1 sáb")`: the server's window rolls, so on that day the oldest read comes back, not all of them (never "resets"). The day shows only when the server gave one. `↻` is kept for a subscription's real renewal date. Pro shows its real state or source (`Activo`, `De regalo hasta el 16 oct`, `Plan web`, `Plan App Store`). Unlimited Quick reads on Pro: `Ilimitadas · uso justo`. Gifts are one row, omitted when confirmed empty.
- `ⓘ` holds: `1 crédito = 1 lectura`, when gifted reads are used, the Pro allowances from server data, the free-account line.
- Signed out: the guest balances, one line `Cuenta gratis: 20 lecturas Rápidas semanales.` (server number only), the system Continue with Apple button. Zero: `0/20` with its real day. Unknown: `Saldo no disponible.` + `Reintentar`, never 0.
- Restore: the link becomes `Comprobando…`, then ONE result line that stays under it (scrolled into view, announced): `Restaurado. Bobby Pro está activo.` · `Sin compra de Bobby Pro en esta cuenta Apple.` (with a quiet `¿Usaste otra cuenta Apple?` that unfolds `Usa esa cuenta Apple en este iPhone; reintenta.`) · `Pendiente de confirmación de App Store.` · `Restauración cancelada.` · `No se pudieron restaurar las compras.` + `Reintentar` · `Bobby Pro sigue activo. Sin otra compra de App Store.` · `Inicia sesión para restaurar.`

| EN | ES |
|---|---|
| Credits | Créditos |
| Quick / Deep / Max | Rápida / Profunda / Máxima |
| Gifted | De regalo |
| Unlimited · fair use | Ilimitadas · uso justo |
| Inactive / Active | Inactivo / Activo |
| Gifted until Oct 16 | De regalo hasta el 16 oct |
| Web plan / App Store plan | Plan web / Plan App Store |
| Manage subscription | Gestionar suscripción |
| Invite / Code | Invitar / Código |
| Restore purchases | Restaurar compras |
| 1 credit = 1 read | 1 crédito = 1 lectura |
| Used after your plan runs out. | Se usan al agotar tu plan. |
| Free account: 20 Quick reads weekly. | Cuenta gratis: 20 lecturas Rápidas semanales. |
| Checking… | Comprobando… |
| Restored. Bobby Pro is active. | Restaurado. Bobby Pro está activo. |
| No Bobby Pro purchase on this Apple Account. | Sin compra de Bobby Pro en esta cuenta Apple. |
| Used another Apple Account? | ¿Usaste otra cuenta Apple? |
| Use that Apple Account on this iPhone; retry. | Usa esa cuenta Apple en este iPhone; reintenta. |
| Awaiting App Store confirmation. | Pendiente de confirmación de App Store. |
| Restore cancelled. | Restauración cancelada. |
| Could not restore purchases. | No se pudieron restaurar las compras. |
| Bobby Pro remains active. | Bobby Pro sigue activo. |
| No additional App Store purchase found. | Sin otra compra de App Store. |
| Sign in to restore. | Inicia sesión para restaurar. |
| Balance unavailable. | Saldo no disponible. |
| Accept the risk notice first. | Acepta primero el aviso de riesgo. |

### Thesis editor — about 18 words (was about 75)

```
Tu tesis · AAPL                             ⓘ ✕
Borrador de Bobby · editable
¿Por qué este activo?
┌ Price is holding above its 50-day average… ┐
Añadir detalle ⌄
Plazo                             Sin definir ›
Solo en este iPhone.
[ Guardar ]
```
- Deleted: the eyebrow, the boxed draft note, "Opcional" beside each field, the permanent counters (one counter, only for the focused field, only past 200 characters), the long footer.
- `Añadir detalle` unfolds `¿Qué te preocupa?` and `¿Qué te haría cambiar?` under one `Opcional`; fields that already have text are shown open. `Plazo` opens four options (Semanas / Meses / Alrededor de un año / Varios años), none by default.
- `ⓘ`: starting price and date, and `Al revisar, tu texto se envía a Bobby y sus proveedores de IA. No se guarda allí.` (nothing leaves the phone on save, so this is detail here; it is on the face of the review).

| EN | ES |
|---|---|
| Your thesis / Edit thesis | Tu tesis / Editar tesis |
| Bobby draft · editable | Borrador de Bobby · editable |
| Why this asset? | ¿Por qué este activo? |
| Your words | Tus palabras |
| Add detail | Añadir detalle |
| What worries you? | ¿Qué te preocupa? |
| What changes your mind? | ¿Qué te haría cambiar? |
| Optional | Opcional |
| Time frame / Not set | Plazo / Sin definir |
| Weeks / Months / About a year / Several years | Semanas / Meses / Alrededor de un año / Varios años |
| Only on this iPhone. | Solo en este iPhone. |
| Starting price | Precio inicial |
| Save | Guardar |
| Reviewing sends your text to Bobby and its AI providers. It is not stored there. | Al revisar, tu texto se envía a Bobby y sus proveedores de IA. No se guarda allí. |
| Discard your text? / Discard / Keep writing | ¿Descartar tu texto? / Descartar / Seguir escribiendo |
| Write why this asset interests you. | Escribe por qué te interesa este activo. |
| You already have a thesis for NVDA. | Ya tienes una tesis de NVDA. |
| 3 active theses. Archive one first. | 3 tesis activas. Archiva una primero. |

### My theses — about 14 words (was about 95)

```
Mis tesis                                   ⓘ ✕
NVDA               Revisa · 23 sep          …
BTC                Sin revisar · 4 oct      …
SAP.DE             Sin revisar · 2 oct      …
Archivadas  1                               ⌄
```
- Deleted: the hypothesis text, "Desde… empezó en…", three buttons per row, "3 de 3 activas", the footer.
- A row opens the review (it sends nothing by itself). `…` on a row: Editar / Archivar; archived rows: Reabrir / Eliminar (one confirmation: `¿Eliminar esta tesis?` / `Se borra de este iPhone para siempre.`). A past verdict in a row is plain ink, never coloured.
- A write door only when there is a saved read to write from: `QuietLink("Escribir tesis")`. Empty: `Aún no hay tesis.` / `Empieza con una lectura guardada.`
- `ⓘ`: `Solo en este iPhone.` and the review sentence.
- Theses written before signing in (replaces the empty state while pending): `4 tesis sin cuenta` / `¿Conservarlas en esta cuenta?` with two equal chips `Conservarlas` · `No son mías` (singular: `1 tesis sin cuenta`, `¿Conservarla en esta cuenta?`, `Conservarla` · `No es mía`).

| EN | ES |
|---|---|
| My theses | Mis tesis |
| Not reviewed | Sin revisar |
| Archived | Archivadas |
| Edit / Archive / Reopen / Delete | Editar / Archivar / Reabrir / Eliminar |
| Delete this thesis? | ¿Eliminar esta tesis? |
| Removed from this iPhone permanently. | Se borra de este iPhone para siempre. |
| No theses yet. | Aún no hay tesis. |
| Start with a saved read. | Empieza con una lectura guardada. |
| Write thesis | Escribir tesis |
| 4 guest theses / 1 guest thesis | 4 tesis sin cuenta / 1 tesis sin cuenta |
| Keep them in this account? / Keep it in this account? | ¿Conservarlas en esta cuenta? / ¿Conservarla en esta cuenta? |
| Keep them / Keep it | Conservarlas / Conservarla |
| Not mine | No son mías / No es mía |

### Review, before — about 30 words including the excerpt (was about 80)

```
Revisar NVDA                                … ✕
Profunda · 1 lectura
"Data center demand keeps growing faster than supply, and margins…"
Tu tesis ⌄        Historial 2 ⌄
—— pinned ——
Tu texto va a proveedores de IA de Bobby. Solo para esta revisión.
[ Revisar ahora ]
```
- Deleted: "Bobby leerá la evidencia…", the level sentence, the four labelled sections, "Revisada hace 14 días".
- The thesis shows as a two-line excerpt in the person's words, never rewritten; `Tu tesis` unfolds all of it. `Historial` only when there is one.
- The two disclosure sentences stay pinned beside the button and readable before it can be tapped.
- Running: the button becomes progress + `Cancelar`, with `Leyendo evidencia de precio…`. Refusals keep their truthful result lines and one next action.

| EN | ES |
|---|---|
| Review NVDA | Revisar NVDA |
| Deep · 1 read | Profunda · 1 lectura |
| Your thesis | Tu tesis |
| History | Historial |
| Your thesis text goes to Bobby's AI providers. | Tu texto va a proveedores de IA de Bobby. |
| Only for this review. | Solo para esta revisión. |
| Review now | Revisar ahora |
| Reading price evidence… | Leyendo evidencia de precio… |
| Review unavailable. No new review saved. | Revisión no disponible. No se guardó una nueva. |
| Read usage is unknown. Check your balance. | No sabemos si contó. Revisa tu saldo. |
| Answer unreadable. A read may have counted. | Respuesta ilegible. Puede haber usado una lectura. |
| Review cancelled. | Revisión cancelada. |
| No reads available at this level. | No quedan lecturas en este nivel. |
| See credits | Ver créditos |

### Review, after — about 40 words (was about 120)

```
NVDA                                        … ✕
Revisa
The price evidence still leans your way, with less momentum.
Antes · 7 sep      120.50
Evidencia · 7 oct  131.20     +8.9%
Solo evidencia de precio. No revisado: noticias · resultados · documentos regulatorios · fundamentales · economía
Respalda  2 ⌄
Cuestiona  1 ⌄
Sin resolver  1 ⌄
[ Mantener tesis ]
```
- Deleted: the asset name, the thesis repeated, "La lectura de Bobby hoy", "Antes y ahora", "Cambio desde entonces", the open bullet lists, "¿Qué quieres hacer con ella?", the three decision buttons.
- The verdict word is the only colour. Prices are neutral ink with dates; the change is arithmetic done on the phone, shown only when both prices exist. The headline is the model's own (two lines, unfolds when longer); never replaced by an invented one.
- The scope line and the full list of what was not checked stay on the face (equity: all five; crypto: `Noticias · fundamentales del proyecto · economía`), wrapped, never truncated.
- Three disclosure rows with real counts; a list that did not arrive says `Listas de evidencia no disponibles.`, an empty one `Nada en esta evidencia.`
- One main action. `…`: Editar / Archivar / Poner recordatorio / Tu tesis / Historial. Closing with ✕ records no decision.

| EN | ES |
|---|---|
| Review / Wait | Revisa / Espera |
| Then / Evidence | Antes / Evidencia |
| Price evidence only. | Solo evidencia de precio. |
| Not checked | No revisado |
| News · earnings · filings · fundamentals · economy | Noticias · resultados · documentos regulatorios · fundamentales · economía |
| News · project fundamentals · economy | Noticias · fundamentales del proyecto · economía |
| Supports / Challenges / Unknown | Respalda / Cuestiona / Sin resolver |
| Keep thesis | Mantener tesis |
| Set reminder | Poner recordatorio |
| Summary unavailable. | Resumen no disponible. |
| Evidence lists unavailable. | Listas de evidencia no disponibles. |
| None in this evidence. | Nada en esta evidencia. |
| Starting price unavailable. | Precio inicial no disponible. |
| Educational reading. | Lectura educativa. |

### Memory, the question in the conversation — about 60 words (was about 125)

The one screen allowed to be longer: everything a person agrees to is in front of them before the buttons.

```
¿Lo recuerdo?                                 ✕
Bobby guarda
Activo · fecha · plazo indicado · precio de ese día
Tu pregunta no se guarda como texto.
Se envía a la IA que responde
Tu nombre de pila · cuántas veces y cuándo preguntaste por este activo ·
el plazo que mencionaste · su precio aquel día y el cambio desde entonces ·
tus preferencias · los activos por los que más preguntas
Deja de usarse a los 90 días sin preguntar. Edita o borra en Memoria.
Política de privacidad
[ Ahora no ]  [ Recordar ]
```
- Deleted: the eyebrow, the eight-word title, four headed paragraphs, connective prose.
- Two labelled inventories, each one wrapped run of items separated by `·` (labels 13 pt muted, items 15 pt cream). Nothing in them is collapsed, replaced by a glyph, or summarised as "a summary". The buttons follow the last line in the scroll: they are not pinned above unread content.
- The two choices have equal weight (`QuietChip`, wide). `90` is the server's number. "Deja de usarse" is the end of use, never a promise of deletion.

| EN | ES |
|---|---|
| Remember this? | ¿Lo recuerdo? |
| Kept by Bobby | Bobby guarda |
| Asset · date · stated time frame · price that day | Activo · fecha · plazo indicado · precio de ese día |
| Your question text is not kept. | Tu pregunta no se guarda como texto. |
| Sent to the AI that answers | Se envía a la IA que responde |
| Your first name | Tu nombre de pila |
| How often and when you asked about this asset | Cuántas veces y cuándo preguntaste por este activo |
| The time frame you named | El plazo que mencionaste |
| Its price that day and the change since | Su precio aquel día y el cambio desde entonces |
| Your preferences | Tus preferencias |
| Your most-asked assets | Los activos por los que más preguntas |
| Unused after {0} days without a question. Edit or delete in Memory. | Deja de usarse a los {0} días sin preguntar. Edita o borra en Memoria. |
| Privacy policy | Política de privacidad |
| Not now / Remember | Ahora no / Recordar |
| On from your next question. | Activa desde tu próxima pregunta. |
| Could not enable memory. | No se pudo activar la memoria. |

### Memory — about 20 words (was about 110)

```
Memoria                                     … ✕
Usar memoria de cuenta                     [on]
Añadir preguntas del iPhone                [on]
Activos  3
NVDA                    5 · 2 oct           …
Tus preferencias                             ›
En este iPhone                               ›
Cómo funciona                                ›
```
- Deleted: the three explanation paragraphs, the sentence under each switch, fifteen preference chips, the local-storage text.
- Preferences move to their own pane (one field at a time; `Sin definir` is a real value). `Cómo funciona` shows the two inventories of the consent screen. `En este iPhone`: Accesos rápidos, Tesis, `Quitar accesos`, and the notes the phone keeps for follow-ups ("Follow-ups", below). Asset `…`: `Olvidar activo`. Sheet `…`: `Borrar todo`, confirmed with the one sentence that names everything it removes.
- Paused: `En pausa` + `Sin memoria nueva ni personalización en web o iPhone.` Capture off: `Las preguntas del iPhone no añaden memoria de cuenta.` The second switch, when there is no consent yet, is `Activar` and opens the consent screen.

| EN | ES |
|---|---|
| Memory | Memoria |
| Use account memory | Usar memoria de cuenta |
| Add iPhone questions | Añadir preguntas del iPhone |
| Assets | Activos |
| Your preferences | Tus preferencias |
| On this iPhone | En este iPhone |
| How it works | Cómo funciona |
| Turn on | Activar |
| Paused | En pausa |
| No new memory or personalization across web and iPhone. | Sin memoria nueva ni personalización en web o iPhone. |
| iPhone questions are not added to account memory. | Las preguntas del iPhone no añaden memoria de cuenta. |
| Shortcuts / Theses | Accesos rápidos / Tesis |
| Time frame / Experience / Risk explained | Plazo / Experiencia / Riesgo explicado |
| Forget asset / Clear shortcuts | Olvidar activo / Quitar accesos |
| Delete everything | Borrar todo |
| Delete all memory? | ¿Borrar toda la memoria? |
| Deletes account memory, preferences, delivered memory briefings, iPhone shortcuts and theses. Cannot be undone. | Borra memoria de cuenta, preferencias, resúmenes de memoria entregados, accesos y tesis del iPhone. No se puede deshacer. |
| Memory stays on. Your next question restarts it. | La memoria sigue activa. Tu próxima pregunta la reinicia. |
| Memory cleared. | Memoria borrada. |
| Account memory unavailable. | Memoria de cuenta no disponible. |
| No remembered assets. | Sin activos recordados. |

### Reminders — about 16 words (was about 85)

```
Recordatorios                                 ✕
Tú eliges la fecha. Bobby no vigila el mercado.
NVDA              🔔 vie 16 oct, 6:00 p.m.   …
BTC               Poner recordatorio
SPY               Poner recordatorio
```
- Deleted: the three-line introduction, company names, every hypothesis, the open grid of presets on every row, `Cambiar` / `Quitar` buttons.
- Only the row being set unfolds: `3 días` · `1 semana` · `1 mes` · `Elegir fecha`; `Elegir fecha` swaps the chips for date and time + `Guardar` · `Cancelar`. The existing date stays visible until the new one is confirmed. Tapping a date changes it; `…`: `Quitar`.
- The system permission is asked when the person sets a reminder, never on opening. Notifications off: one row `Las notificaciones de Bobby están apagadas.` + `Abrir Configuración`; an existing reminder says `Recordatorio programado; notificaciones apagadas.`
- The notification itself: title `Bobby`, body `Tu recordatorio para revisar una tesis.` No asset, no price.
- Empty: `Escribe una tesis primero.`

| EN | ES |
|---|---|
| Reminders | Recordatorios |
| Your chosen date. Bobby does not monitor markets. | Tú eliges la fecha. Bobby no vigila el mercado. |
| Set reminder | Poner recordatorio |
| 3 days / 1 week / 1 month / Choose date | 3 días / 1 semana / 1 mes / Elegir fecha |
| Date / Time / Set / Cancel | Fecha / Hora / Guardar / Cancelar |
| Remove | Quitar |
| Reminder not set. | Recordatorio no guardado. |
| Write a thesis first. | Escribe una tesis primero. |
| Your reminder to review a thesis. | Tu recordatorio para revisar una tesis. |
| Bobby notifications are off. | Las notificaciones de Bobby están apagadas. |
| Open Settings | Abrir Configuración |
| Scheduled reminder; notifications are off. | Recordatorio programado; notificaciones apagadas. |

### Follow-ups (the harness) — about 12 words per surface

Added after the first pass (`Sources/V18/Harness/`). Bobby comes back to what the person asked.
Everything is planned on the phone from a small ledger; nothing is sent anywhere.

Surfaces, each one line and one action:

| Where | Line | Action |
| --- | --- | --- |
| Glass, after a read, until they decide | Shall I keep you posted on NVDA? | Yes, tell me |
| Lock screen, when they said (next day at the soonest) | NVDA: back to your question. | tap · Stop |
| Lock screen, the Monday after | Your week: NVDA and 2 more. | tap · Stop |
| The same two, on a phone that hides previews while locked | Back to your question. · Your week. | (unlock) |
| Glass, when they come back | NVDA +2.3% since you asked | What changed? |
| Glass, when the phone should say no number | NVDA, 2 days later | What changed? |
| Glass, when the next read would be refused | the same line | Got it |
| The row after a read, and the home, when the next read would be refused | no chip that asks by itself | "Another question about NVDA" (they type it) · the pill |
| Board (the week) | title + "Since you asked" | a row asks Bobby (a plain row at the wall) |
| Reminders | Follow-ups · Bobby comes back to what you asked. | switch |
| Memory, "On this iPhone" | the notes, in sentences (below) | Erase · Erase notes |

Spanish: ¿Te voy contando cómo sigue NVDA? · Sí, cuéntame · NVDA: de vuelta a tu pregunta. ·
Tu semana: NVDA y 2 más. · De vuelta a tu pregunta. · Tu semana. · Ya no · NVDA +2.3% desde que
preguntaste · NVDA, 2 días después · ¿Qué cambió? · Entendido · Seguimiento · Bobby vuelve a lo
que preguntaste.

The sector follow-up ("Semiconductors today. NVDA is part of it." and its board) is in the tree
and is not sent by the chain that ships: see "The owner's choice" below.

#### The chain, as built (`HarnessPlanner.swift`, `HarnessLedger.swift`)

Follow-ups belong to **a question the person asked by themselves**, in their own words: typed or
spoken. That question gets, in order:

1. **the asset**, when they said they would look again;
2. **the week**, the Monday after: the assets they asked about since the Monday before it.

Two at most per question, whatever they do with them, and then silence until they ask again.

- **Only a real answer is an answer.** An answer is `returned`: within a day of a follow-up they
  asked about its asset, saved a read of it, or acted on its line in the app. A tap on the
  notification (`opened`) is written down and answers nothing: it does not end the unanswered
  streak, does not keep a kind from resting, and starts nothing. A pick in the app (`picked`:
  "What changed?", a board row, the question Bobby wrote after a read) is an answer only when it
  answers a follow-up that way; alone it only says the asset matters.
- **An answer never starts a chain.** It ends the unanswered streak, keeps that kind from resting
  and teaches the hour. The question still has what was left of its two, no more.
- **A read Bobby started is not a question.** The button of a follow-up, a board row, the
  question Bobby wrote after a read and **every chip whose question Bobby wrote** (an asset of the
  home, an asset or a mover of the row after a read) are written with `origin: followUp`. They can
  answer a follow-up; they never start one, and never move the chain of the question before them:
  one tap on something Bobby put there never earns another chain. The page says which asks came
  from such a chip (`ask {question, chip: true}`, Nucleo/ARCHITECTURE.md §3.5). The person's own
  second question about the same read is a question (`thread`), like any other.
  The one exception is the yes itself. Before it there is no chain to protect, so a chip is kept
  the way a question is (the asset, its price, the moment): the glass can say how the asset moved
  since, and a yes to "Shall I keep you posted on NVDA?" follows the read that prompted it. From
  the yes on, only their own words start a chain.
- **When the first one comes**, from what the person said, strongest first, and never sooner than
  the next day:

  | They said | The asset follow-up comes |
  | --- | --- |
  | A thesis about the asset: weeks | 7 days after the question |
  | A thesis about the asset: months, a year, years | never; the week only |
  | "Review in 3 days" / "in a week" on the save (72 / 168 hours) | 3 / 7 days after |
  | The question named a week ("this week", "next days") | 3 days after |
  | The question named a month ("this month", "weeks") | 7 days after |
  | The question named months or years | never; the week only |
  | Today, right now, or nothing | the next day |

  A save left at 24 hours says nothing (it is where the picker starts). The horizon the question
  named is the one the server already returns in `sufficiency.horizon`. The hour is the hour of
  the question inside 09:00–21:00, or the hour they answer at once they have answered three.
  What they say times the first follow-up and nothing else. Once a step was shown, a save "to
  review in a week" or a thesis of weeks written afterwards cannot push what follows further than
  the day it was shown allows: the week stays the Monday after that day (it used to move to the
  Monday after the new wait, where the question was no longer part of it, and nothing came).
- **A week is their week.** It holds what they asked about since the Monday before it, names the
  asset that matters most to them among those (a thesis 2, a question 1, their own second question
  about a read 1 more, a save 1, a pick 1, an answer 1, a tap 0.5; all but the thesis halve every
  seven days) and is not sent when it would hold nothing: a question on a Sunday, or one whose
  asset follow-up waited seven days, has no week. A tapped week opens the week it was planned for.
- **The limits, unchanged, always win:** one a day, four in seven days, 18 hours apart, 09:00 to
  21:00; a kind whose last two went unanswered rests; three unanswered in a row and Bobby says
  nothing for two weeks, whatever is asked; nothing for a question older than 14 days.
  The plan is what arrives if the person does nothing, so the three in a row are counted over
  the plan too: with two unanswered behind them a new question is handed one follow-up, not two
  (a fourth, or with the sector a fifth, used to be handed to iOS and arrive unopened). If they
  answer that one, the plan is made again and the week comes.
- **A follow-up is an instant, on purpose.** It is handed to iOS as the moment the plan chose, in
  the time zone the plan was made in. Someone who changes time zone and does not open the app
  gets it at that instant, which can be outside 09:00–21:00 where they are now. An hour on the
  clock instead would arrive at a moment the phone never learns, and everything that keeps Bobby
  quiet (what was shown, 18 hours apart, one a day, two per question) counts from those moments:
  a follow-up could then arrive twice, or uncounted. Opening the app plans again on the new clock.
- **What is kept, and when.** Asset, price, moment, and fixed values only (a horizon out of five,
  24/72/168 hours, a pointer to a thesis with its horizon): never a word the person wrote. How
  much of that is written depends on what they said about follow-ups ("What the phone writes",
  below): before the yes, the question alone. What a question or a save carried beyond that waits
  in memory for the last five reads, thirty minutes at most, and the yes writes it: the question
  gains what it named, the save goes in whole. A thesis pointer lasts as long as its thesis and
  goes when it is archived.

#### The owner's choice (one line)

`HarnessChain.shipped` in `HarnessPlanner.swift` is the chain every question gets:

| Value | A question gets | Status |
| --- | --- | --- |
| `.assetThenWeek` | the asset, then the week; two at most | **ships** |
| `.withSector` | the asset, its sector the day after, then the week; three at most | built and tested, not shipped |

The sector follow-up lands on a list of assets the person did not ask about, with their last 24
hours; that is why it is not the default. Its code, board and translations stay in the tree.

Changing that line is the whole change in the app. What states "this is what ships" then has to
say the same, and fails until it does: `defaults.chain` and `defaults.maxPerQuestion` in the
golden file (with the `options` of its two families of cases swapped: the cases and their plans
do not change), `HarnessPlannerTests.testTheChainIsData`, and the assertions of
`HarnessCenterTests` that count what the phone hands to iOS. The golden cases whose name starts
with "With the sector" describe exactly what the other chain does.

One person, one question about NVDA on a Tuesday at 14:10, and a yes:

| They… | Ships: asset, week | With the sector |
| --- | --- | --- |
| never open anything | Wed 14:10 · Mon 14:10 | Wed 14:10 · Thu 14:10 · Mon 14:10 |
| tap each one, nothing else | Wed 14:10 · Mon 14:10 | Wed 14:10 · Thu 14:10 · Mon 14:10 |
| answer the first | Wed 14:10 · Mon 14:10 | Wed 14:10 · Thu 14:10 · Mon 14:10 |
| answer the first, and save that read with "review in a week" | Wed 14:10 · Mon 14:10 | Wed 14:10 · Thu 14:10 · Mon 14:10 |
| saved with "review in a week" | next Tue 14:10 | next Tue 14:10 · next Wed 14:10 |
| asked about years | Mon 14:10 | Mon 14:10 |

(`HarnessPlannerTests.testWhatOnePersonGetsFromOneQuestionOnATuesday`.)

#### The contract for other platforms (`shared/harness/planner-golden.json`)

Ledger in, plan out: every rule above is a case, and a port of the planner must reproduce all of
them. The iPhone suite runs the file from the repository (`HarnessGoldenTests`), so it cannot
drift from what the phone does.

```
{
  "version": 1,
  "defaults":  { chain, maxPerQuestion, weeklyCovered, earliestHour, latestHour, minimumGapHours,
                 anchorDays, sectorFreshDays, weekFreshDays, weekWindowDays, maxPerWeek,
                 quietAfter, quietDays },
  "constants": { waitDays, saveWaitDays, thesisHorizon, interestWeights, threadWeight,
                 thesisWeight, interestHalfLifeDays, statsDays, ignoredLimit, hourSamples,
                 retentionDays, maxEvents },
  "sectors":   { "NVDA": "semis", …, "GME": null },
  "cases": [ {
      "name":         "A question that named the week waits three days.",
      "now":          "2026-10-06T14:12:00-06:00",
      "timeZone":     "America/Mexico_City",
      "options":      { only what differs from defaults },
      "events":       [ { "kind": "ask", "at": "2026-10-06T14:10:00-06:00", "symbol": "NVDA", "horizon": "week" } ],
      "expectedPlan": [ { "step": "asset", "fireAt": "2026-10-09T14:10:00-06:00", "symbol": "NVDA", "days": 3 },
                        { "step": "week",  "fireAt": "2026-10-12T14:10:00-06:00", "symbol": "NVDA", "others": 0 } ]
  } ]
}
```

- Times are ISO 8601 with an offset (instants); `timeZone` is the calendar the plan is made in.
- An event: `kind` (ask, saved, sent, opened, returned, picked, thesis; `appOpen` is read from an
  older ledger and dropped: opening the app is never written), `at`, and where
  they apply `symbol`, `price`, `step`, `sector`, `ref`, `origin` (`followUp`: Bobby wrote the
  question, a chip included; absent: the person, in their own words),
  `thread`, `horizon` (intraday, week, month, long, unspecified), `horizonHours` (24, 72, 168).
  Events are written into the ledger in file order: the ledger sorts them, upper-cases symbols,
  drops what is not a symbol, and the planner ignores what is dated after `now`.
- A planned follow-up: `step`, `fireAt`, `symbol`, and `days` (asset), `sector` (sector), `others`
  (week). A field that is absent is not compared.
- A port also checks its own defaults and constants against the file, as the iPhone suite does.
- 95 cases. Each rule is pinned by itself: a planner without the local-day rule, without the
  18 hours after the last one shown, that plans a step twice, that sets the hour as seconds after
  local midnight (an hour off on the day the clocks change: Madrid, New York and Sydney are in the
  file), that lets "today" mean the same day, that counts what is dated after now, or that does
  not count the plan's own follow-ups as unanswered, fails at least one case.

Rules that are not folded away:

- The lock screen names the asset and never a figure, a direction, a day count or an instruction:
  it says where the notification came from ("back to your question") and nothing else. The number
  is read when the person opens it.
- A number the phone does not have, or should not say, is not shown ("NVDA, a day later" without
  it; a board row without it).
- Numbers are cream, never green or red: colour means a verdict only.
- iOS permission is asked only on "Yes, tell me" or the switch.
- A follow-up belongs to the reader it was planned for: another account never sees it, on the
  lock screen or in the app.
- A tap lands on a glass that is there. From a closed app, the week's board opens once the page
  under it has had 1.6 s in front to wake (the asset's line, a briefing and a thesis reminder do
  not wait). A row, or the button of the line, asks Bobby through the page, as if the person had
  closed what was on the glass and asked: over a finished read, its cards, an open keyboard or
  another face of the sphere the read starts at once. Where the page cannot take it (it is
  still waking, or coming home) the question is offered again every half second, eight times
  at the most, and then dropped. One tap is one read at the most, and it never starts behind
  another sheet, for another reader, after the app was left, or over a question of their own
  that is on its way (Nucleo/ARCHITECTURE.md §9.5 has the table, state by state).
- A tap that asked nothing is not an act. The pick is written when Bobby is asked, with the
  moment of the tap; a row whose question never reached the page writes nothing and answers no
  follow-up.

#### What the person sees, and what stays on the phone (`HarnessCenter`, `HarnessCopy`, `HarnessNotes`)

**What the phone writes**, by what the person said about follow-ups, and by nothing else:

| State | In the ledger | Elsewhere on the phone |
| --- | --- | --- |
| Undecided (never asked, or not answered) | One entry per read they asked for (typed, spoken, or an asset picked on a chip): the asset (symbol, name, stock or crypto), its price, the moment. | How often the glass drew the offer and the line about an asset, and whether it was tapped (the nudge history every line of the glass has). The lines about assets are counted on the Memory screen, go with Erase and Erase notes, and are kept sixty days like the ledger. |
| On | Everything the planner reads, from the yes on: every read with who started it, saves, taps on Bobby's lines, follow-ups shown, tapped and answered, the horizon a question named, the review chosen on a save, a pointer to each active thesis. | The switch, the plan (two follow-ups at most), the same nudge history. |
| Off | Nothing. What was there is erased when it is turned off. | The switch itself (the no), and nothing about any asset: the history of the lines goes too. |

Undecided, nothing else is written: no app opening, no save, no tap, no horizon, no thesis
pointer, and nothing of a read started from a follow-up's own button. The question is kept so the
glass can say "NVDA +2.3% since you asked" the next time the app is opened. Bounded as before: 300
events, 60 days.

That number costs one request the person did not tap for. When the app comes to the front with an
asset asked about a day ago or more (before the yes too), the phone asks the quote endpoint for
that symbol; the week's board asks once per row. The request carries the symbol and nothing else
(no account, no device, nothing more of the ledger), and the server already saw the question.

**The number can be wrong; then there is no number.** The glass and the week's board say a
percentage only when both prices are positive and finite and the price now is inside a bound for
that kind of asset, measured against the price at the question:

| Asset | Shown between | Why |
| --- | --- | --- |
| Stock | 0.7× and 1.4× (-30% to +40%) | The top of the band is twice its bottom, so a 2-for-1 split or any larger one, forward or reverse, on top of any move the band itself would print lands outside it: 100 → 62 (2-for-1 and +24%) is 0.62, no number. An earnings day (about a quarter either way) is inside, on the first day as on the fourteenth: the band is not narrowed with the days, because the largest ordinary day is as large as an ordinary fortnight. A 3-for-2 split (0.67×) with a rise of 5% or more on top still reads as a fall of up to 30%: by size alone it cannot be told from one. A split-adjusted reference from the quote endpoint would close it. |
| Crypto | 0.2× and 5× (-80% to +400%) | No splits. Stops a ticker that now names another coin, a redenomination, a bad tick; lets a small coin's wildest ordinary week through. |

Outside the bound the line is the one without a number ("NVDA, 2 days later"), never a corrected
one. The line is drawn like every other line of the glass (one size, one ink): the same up and
down, no colour, no arrow.

**The lock screen says where it came from.** Title "Bobby". Each follow-up is filed under a
category whose hidden-preview placeholder is the same sentence without the asset, so a phone that
hides previews while locked (the default with Face ID) never shows the ticker on a locked screen.

| | Asset | Asset, previews hidden | Week | Week, previews hidden | Action |
| --- | --- | --- | --- | --- | --- |
| en | NVDA: back to your question. | Back to your question. | Your week: NVDA and 2 more. | Your week. | Stop |
| es | NVDA: de vuelta a tu pregunta. | De vuelta a tu pregunta. | Tu semana: NVDA y 2 más. | Tu semana. | Ya no |
| fr | NVDA : on revient à ta question. | On revient à ta question. | Ta semaine : NVDA et 2 de plus. | Ta semaine. | Arrêter |
| pt | NVDA: de volta à tua pergunta. | De volta à tua pergunta. | A tua semana: NVDA e mais 2. | A tua semana. | Parar |
| it | NVDA: torniamo alla tua domanda. | Torniamo alla tua domanda. | La tua settimana: NVDA e altri 2. | La tua settimana. | Interrompi |
| de | NVDA: zurück zu deiner Frage. | Zurück zu deiner Frage. | Deine Woche: NVDA und 2 weitere. | Deine Woche. | Stoppen |

**Stopping is one tap.** "Stop" on the notification does what the Follow-ups switch does when it
is turned off (the same call): follow-ups off, what iOS holds removed, the ledger erased. It runs
without opening the app and without unlocking the phone, and the offer is not made again: only
someone undecided is offered, and **a no stays a no**. Said signed out, it goes with the person
into their account and also stays on the phone, so it is still a no when they sign out again.
"Delete everything" on the Memory screen erases the notes and the plan and keeps the no. An
account that said no takes nothing from a signed-out reader either: what that reader asked is
dropped at sign-in, not merged. (Withdrawing the risk notice still starts over: it erases
everything, the no included.)

**Bobby never invites someone into a wall.** A read Bobby starts (the "What changed?" button, a
row of the board, the question Bobby wrote after a read) is offered and launched only when the
phone knows the next read is answered, from the receipt the server sends with every reply: Bobby
Pro, reads or gifted reads left, or nothing behind the limit. Not knowing is a no (the phone then
asks, at no cost, when it has a line to draw). At the wall the person still sees the line, with
"Got it" in place of the question, and the board, with plain rows. Such a read runs at the Quick
level whatever level is saved, and does not change the saved one.
The same holds one tap later. The read that spends the last one is delivered with `oneTap:
false`, and its row keeps only "Another question about NVDA", which asks nothing until the
person has typed it: no question of the CIO, no "How is BTC looking?". The home loses its asset
chips the same way once the phone knows the next read is refused (`oneTap: false` in the
session), and gets them back when a read does. There, not knowing changes nothing: a first
launch or a phone without network keeps its chips.

**What Bobby keeps is on the Memory screen**, under "On this iPhone", after the shortcuts and the
theses. No second screen. A header, one row per asset with its own Erase, one muted paragraph
about what Bobby does, and Erase notes. With nothing kept the section is one line.

```
Notas que Bobby guarda en este iPhone para elegir cuándo volver. No se envían a la IA.
NVDA   Preguntaste 3 veces, la última el 5 oct. Tu pregunta era sobre       [Borrar]
       esta semana. Guardaste una lectura, para revisar en una semana.
       Bobby vuelve el 12 oct.
BTC    Preguntaste una vez, el 3 oct.                                        [Borrar]
TSLA   Preguntaste 2 veces, la última el 30 sept. Tu tesis mira a semanas.   [Borrar]
Borrar notas
```

| When | EN | ES |
| --- | --- | --- |
| Header | Notes Bobby keeps on this iPhone to choose when to come back. They are not sent to the AI. | Notas que Bobby guarda en este iPhone para elegir cuándo volver. No se envían a la IA. |
| Asked, in their own words | Asked once, on Oct 5. / Asked 3 times, last on Oct 5. | Preguntaste una vez, el 5 oct. / Preguntaste 3 veces, la última el 5 oct. |
| Reads whose question Bobby wrote | One read from a question Bobby wrote. / 2 reads from questions Bobby wrote. | Una lectura desde una pregunta que escribió Bobby. / 2 lecturas desde preguntas que escribió Bobby. |
| The question named a horizon | Your question was about today. / this week. / this month. / months or years. | Tu pregunta era sobre hoy. / esta semana. / este mes. / meses o años. |
| A save | You saved a read. / You saved a read, to review in a day. / in 3 days. / in a week. | Guardaste una lectura. / Guardaste una lectura, para revisar en un día. / en 3 días. / en una semana. |
| A thesis | You wrote a thesis about it. / Your thesis looks weeks ahead. / months or more ahead. | Escribiste una tesis sobre este activo. / Tu tesis mira a semanas. / a meses o más. |
| A follow-up is coming | Bobby comes back on Oct 12. | Bobby vuelve el 12 oct. |
| The week is coming | Your week arrives on Oct 19. | Tu semana llega el 19 oct. |
| The planner uses a learned hour | Follow-ups arrive around 7:00 PM. | El seguimiento llega hacia las 19:00. |
| Three in a row unanswered | Quiet until Oct 21. | En silencio hasta el 21 oct. |
| A kind is resting | Fewer follow-ups for now. | Menos seguimiento por ahora. |
| Follow-ups were shown | Follow-ups: 3 shown, 2 tapped, 1 answered. | Seguimientos: 3 mostrados, 2 tocados, 1 respondidos. |
| The glass drew lines about their assets | “Since you asked” lines shown: 2. | Líneas “desde que preguntaste” mostradas: 2. |
| Nothing kept | No follow-up notes. | Sin notas de seguimiento. |
| Follow-ups off | Follow-ups are off. | El seguimiento está apagado. |
| Buttons | Erase · Erase notes | Borrar · Borrar notas |

- The sentences are computed from the ledger the planner plans from and by the profile function it
  calls. Every kind of event, every field an event carries and every field of the profile goes
  through an exhaustive `switch`: a new one does not compile until it has a sentence or is marked
  internal with the reason (`HarnessNotes.told` for the fields of an event; a test checks that
  list against the struct). Marked internal today: the weight per asset (it only picks which asset
  the week names), the thirty-day counts (the same events are said in full), a tap on one of
  Bobby's lines (the read it started is counted with the reads Bobby's questions started), and of
  an event: the display name, stock or crypto, the price, the sector, which follow-up an answer
  belongs to, and the mark of a second question about the same read (it is one of "Asked N
  times"; the mark only makes that asset weigh more when the week picks the one it names).
- "Asked" counts the questions the planner follows up: their own. A read whose question Bobby
  wrote is counted apart, and the day and the horizon said are those of their own question.
- Facts and what Bobby does, never what the person "is". What they said is said as theirs. The
  header states how the app is built; no sentence promises anything about a verdict.
- Erase removes what was asked, saved and tapped about one asset, the follow-up that was coming
  about it and what the glass kept about its line. Follow-ups already shown stay counted, without
  the asset: erasing never makes Bobby come back more. A thesis is erased in My theses; an asset
  with nothing but a thesis has no Erase. Erase notes removes all of it and keeps the switch.
  "Delete everything" removes it too, and its confirmation says so.
- What is read from the ledger and leaves the phone is an asset's symbol, in two ways only: inside
  a question the person sees and sends by their own tap ("What changed in NVDA since I asked?",
  "How does NVDA look today?"), and, with no tap, in the request for that asset's price that draws
  the number on the glass and on the week's board (above). `HarnessSurfaceTests` audits the
  harness folder for both and fails on a third.

**A gate on words.** `HarnessSurfaceTests.testNoHarnessStringSaysAForbiddenWordInAnyLanguage` runs
every string above, in six languages, against the words of rule 5 and against claims of having
watched, monitored, noticed or detected, and fails on any hit.

Review fixtures: `-qa-v18 memory-notes-three | memory-notes-full | memory-notes-empty |
memory-notes-off | follow-week-wall`, and `-nucleo-fixtures -qa-v18-nudge follow-move |
follow-move-plain | follow-move-wall`.

### Invite — about 20 words (was about 60)

```
Invita a un amigo                           ⓘ ✕
Recibes 30 días Pro por cada cuenta nueva.
● ● ○ ○ ○                              2/5
K7QM2XWP  ⧉
[ Compartir ]
¿Tienes un código? ⌄
```
- Deleted: the eyebrow, the paragraph, the raw link, the separate `Copiar código` and `Copiar link` buttons, the always-open code field.
- Numbers come from the server; without them the reward line and the dots are not shown. The code is tappable text with a copy glyph (`Copiado`). `Compartir` opens the system share sheet (link + `Mi código: K7QM2XWP`). `¿Tienes un código?` unfolds one field + `Aplicar`.
- `ⓘ`: `Solo cuentas nuevas, durante su primera semana.` and the limit.
- An invitation waiting while signed out replaces the face: `Invitación pendiente` / `H4TNRD9B` / `Guardada en este iPhone.` / the system Continue with Apple button / `Quitar`. Results are one line each.

| EN | ES |
|---|---|
| Invite a friend | Invita a un amigo |
| You get {0} Pro days per new account. | Recibes {0} días Pro por cada cuenta nueva. |
| Share | Compartir |
| Your code / Copy code / Copy link / Copied | Tu código / Copiar código / Copiar link / Copiado |
| Have a code? / Code / Apply | ¿Tienes un código? / Código / Aplicar |
| Invitation ready | Invitación pendiente |
| Saved on this iPhone. | Guardada en este iPhone. |
| Sign in to accept. | Inicia sesión para aceptarla. |
| Sign in for your link. | Inicia sesión para tener tu link. |
| Accepted. Counts for your friend. | Aceptada. Cuenta para tu amigo. |
| This is your own invitation. | Esta es tu propia invitación. |
| New accounts only, within their first week. | Solo cuentas nuevas, durante su primera semana. |
| This account already accepted an invitation. | Esta cuenta ya aceptó una invitación. |
| Your friend reached the invitation limit. | Tu amigo alcanzó el límite de invitaciones. |
| Invalid invitation code. | Código de invitación inválido. |
| Invitation could not be applied. | No se pudo aplicar la invitación. |
| Code saved. Bobby will retry. | Código guardado. Bobby lo reintentará. |
| My code: {0} | Mi código: {0} |

## What does not change in this pass

Behaviour, limits, stores, the nudge rules, the wire, consent logic, account fences and the server. An invitation opened from a link is still claimed after sign-in. This pass changes what is on the screen and how it is said.
