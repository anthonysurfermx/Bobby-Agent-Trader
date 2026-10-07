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
Rápida                        ↻ sáb      7/10
Profunda                      ↻ dom       2/3
Máxima                                    1/1
De regalo            Rápida 3 · Profunda 2
Bobby Pro                         Inactivo  ›
Invitar ›      Código ›
Restaurar compras
```
- Deleted: the credit definition, "Lo que tienes", "Consigue más", "¿Ya pagaste?", the sentence under every row, the Pro benefits text, the restore explanation.
- A level row is `QuietRow(label, value: "7/10", note: "↻ sáb")`; the day shows only when the server gave one. Pro shows its real state or source (`Activo`, `De regalo hasta el 16 oct`, `Plan web`, `Plan App Store`). Unlimited Quick reads on Pro: `Ilimitadas · uso justo`. Gifts are one row, omitted when confirmed empty.
- `ⓘ` holds: `1 crédito = 1 lectura`, when gifted reads are used, the Pro allowances from server data, the free-account line.
- Signed out: the guest balances, one line `Cuenta gratis: 10 lecturas Rápidas semanales.` (server number only), the system Continue with Apple button. Zero: `0/10` with its real day. Unknown: `Saldo no disponible.` + `Reintentar`, never 0.
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
| Free account: 10 Quick reads weekly. | Cuenta gratis: 10 lecturas Rápidas semanales. |
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
- Preferences move to their own pane (one field at a time; `Sin definir` is a real value). `Cómo funciona` shows the two inventories of the consent screen. `En este iPhone`: Accesos rápidos, Tesis, `Quitar accesos`. Asset `…`: `Olvidar activo`. Sheet `…`: `Borrar todo`, confirmed with the one sentence that names everything it removes.
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
