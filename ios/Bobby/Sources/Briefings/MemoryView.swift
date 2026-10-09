// Profile › Memory: what Bobby remembers about the account, and what this iPhone keeps.
// The screen shows the same explanation as the consent sheet (what is kept, what is sent to the AI
// provider, for how long); when iPhone questions are not in memory its "Turn on" opens that sheet
// (one consent path, MemoryConsentSheet). Corrections, remembered assets, the on-phone section and
// confirmed deletion follow; MemoryCenter owns account isolation and makes deletion complete
// (server, shortcuts, theses, follow-up notes). What the phone keeps is there for everyone, signed
// in or not, behind the same row, "On this iPhone": signed out the screen is one sentence and that
// row (V18-DESIGN.md gives Memory about twenty words; Android draws the same face).
// "On this iPhone" also says, in sentences, what the phone keeps to plan follow-ups (HarnessNotes):
// every asset's notes can be erased there, and so can all of them. There is no second screen.
import SwiftUI

struct MemoryView: View {
    @ObservedObject var center: MemoryCenter = .shared
    /// R11: nothing reaches the network before the risk notice is accepted.
    let riskAccepted: Bool
    /// Shown as its own sheet (a close button); pushed from the briefing settings it has a back button.
    var onSpeaking: (() -> Void)? = nil
    var onClose: (() -> Void)? = nil
    /// Observed so a sign-in or sign-out redraws the screen; the center names the account.
    @ObservedObject private var account = AccountSession.shared
    /// The follow-up notes of whoever uses this phone (V18/Harness). Never read from a server.
    @ObservedObject var harness: HarnessCenter = .shared
    /// The review fixtures show fixed notes: nothing is read and nothing can be erased.
    var fixedNotes: HarnessNotes? = nil
    /// "On this iPhone" starts unfolded (the review fixtures of the notes; a person unfolds it with a tap).
    var localStartsOpen = false
    @State private var showingConsent = false

    private var signedIn: Bool { center.currentUser() != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 0) {
                    Text(Self.title).quietFont(26, .light, design: .rounded, relativeTo: .title)
                        .foregroundStyle(Theme.cream).padding(.top, 6)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 8)
                    if let onClose {
                        QuietGlyphButton(systemImage: "xmark", label: L.t("Close", "Cerrar"), id: "memory-close", action: onClose)
                    }
                }
                .padding(.trailing, -7)
                if let onSpeaking {
                    Button(L.t("How Bobby speaks", "Cómo te habla Bobby"), action: onSpeaking)
                        .quietFont(15, .regular).foregroundStyle(Theme.cream)
                        .padding(.vertical, 18).accessibilityIdentifier("memory-speaking")
                }
                content.padding(.top, 2)
            }
            .padding(.horizontal, 24)
            .padding(.top, 14)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .navigationTitle(L.t("Memory", "Memoria"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.nucleoSurface, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .environment(\.colorScheme, .dark)
        .task {
            center.reloadLocal()
            guard riskAccepted, signedIn else { return }
            await center.refresh()
        }
        .onReceive(NotificationCenter.default.publisher(for: ThesisBook.didChange)) { _ in center.reloadLocal() }
        .sheet(isPresented: $showingConsent) {
            MemoryConsentSheet(center: center) { showingConsent = false }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        }
        .confirmationDialog(L.t("Erase every remembered asset and your preferences?", "¿Borrar todos los activos recordados y tus preferencias?"),
                            isPresented: Binding(get: { center.confirmingForgetAll }, set: { if !$0 { center.cancelForgetAll() } }),
                            titleVisibility: .visible) {
            Button(L.t("Delete everything", "Borrar todo"), role: .destructive) { Task { await center.confirmForgetAll() } }
            Button(L.t("Cancel", "Cancelar"), role: .cancel) { center.cancelForgetAll() }
        } message: {
            Text(Self.deleteEverythingWarning + " " + Self.deliveredBriefingsNote)
        }
    }

    /// The confirmation says exactly what goes: the server's memory and the three things kept on this phone.
    static var deleteEverythingWarning: String {
        L.t("This deletes what Bobby's servers remember about your account, the shortcuts on this iPhone and the theses you wrote here, with Bobby's follow-up notes. It cannot be undone.",
            "Esto borra lo que los servidores de Bobby recuerdan de tu cuenta, los accesos rápidos de este iPhone y las tesis que escribiste aquí, con las notas de seguimiento de Bobby. No se puede deshacer.")
    }

    static var deliveredBriefingsNote: String {
        L.t("Memory-based briefings already delivered are removed too. A paused memory stays paused.",
            "También se eliminan los resúmenes basados en memoria ya entregados. Si la memoria está en pausa, sigue en pausa.")
    }

    @ViewBuilder private var content: some View {
        if !signedIn {
            // Nobody signed in: the phone still keeps a shortcut row, theses and follow-up notes of its
            // own. No server call. One sentence and one row that unfolds, as for an account.
            folded(note: MemoryError.signedOut.message, id: "memory-signed-out")
        } else if !riskAccepted {
            folded(note: Self.riskRequired, id: "memory-risk-required")
        } else if let s = center.snapshot {
            loaded(s)
        } else if center.loading {
            ProgressView().tint(Theme.warmMuted).frame(maxWidth: .infinity).padding(.top, 40)
        } else {
            // The server did not answer. What this iPhone keeps can still be seen and deleted.
            VStack(alignment: .leading, spacing: 12) {
                Text((center.lastError ?? .unavailable).message).font(.system(size: 13)).foregroundStyle(Theme.cream)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("memory-unavailable")
                BriefingPillButton(title: L.t("Try again", "Reintentar")) { Task { await center.refresh() } }
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("memory-retry")
            }
            .padding(.top, 24)
            onThisPhone(mentionsDeletion: true)
            deleteEverything(showsError: false)
        }
    }

    static var riskRequired: String {
        L.t("Accept the risk notice first: until then Bobby sends nothing to its servers.",
            "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores.")
    }

    static var title: String { L.t("What I remember", "Lo que recuerdo") }
    static var localLabel: String { L.t("On this iPhone", "En este iPhone") }

    /// Every word on the face of the screen while there is no account memory to show (nobody signed
    /// in, or the risk notice is missing): the title, one sentence and the row that unfolds. What
    /// the phone keeps, and the paragraph about where it lives, are one tap away.
    static func foldedFace(note: String) -> [String] { [title, note, localLabel] }

    @ViewBuilder private func folded(note: String, id: String) -> some View {
        QuietNote(text: note, id: id).padding(.top, 10).padding(.bottom, 6)
        QuietDisclosure(label: Self.localLabel, open: localStartsOpen, id: "memory-local") {
            VStack(alignment: .leading, spacing: 0) { onThisPhone(mentionsDeletion: false) }
        }
    }

    /// V18-DESIGN.md, "Memory": two switches, the assets, and three rows that unfold (preferences,
    /// what this iPhone keeps, how it works). Nothing that was explained on the face is gone: it is
    /// one tap away, and the consent sheet says all of it before anything is turned on.
    @ViewBuilder private func loaded(_ s: MemorySnapshot) -> some View {
        QuietToggle(label: L.t("Use account memory", "Usar memoria de la cuenta"),
                    detail: s.enabled ? nil : L.t("Paused across web and iPhone: no new asks are saved or personalized.",
                                                  "En pausa en web y iPhone: no se guardan ni personalizan consultas nuevas."),
                    isOn: s.enabled, saving: center.saving, enabled: !center.saving, id: "memory-enabled") { on in
            Task { await center.setEnabled(on) }
        }
        .padding(.top, 10)
        if center.nativeOptedIn {
            // On only through the consent sheet; switching it off here is immediate and needs no network.
            QuietToggle(label: L.t("Include iPhone questions", "Incluir preguntas del iPhone"), isOn: true,
                        enabled: !center.saving, id: "memory-native-opt-in") { on in
                if !on { _ = center.setNativeCapture(false) }
            }
        } else {
            turnOn
        }
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(L.t("Assets", "Activos")).quietFont(16).foregroundStyle(Theme.cream)
            Text("\(s.assets.count)").quietFont(14, relativeTo: .callout).monospacedDigit().foregroundStyle(Theme.warmDim)
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
        if s.assets.isEmpty {
            QuietNote(text: L.t("No remembered assets.", "Sin activos recordados.")).padding(.bottom, 12)
        } else {
            ForEach(s.assets) { asset in assetRow(asset) }
        }
        Rectangle().fill(Theme.warmHair).frame(height: 1)
        QuietDisclosure(label: L.t("About you", "Sobre ti"), id: "memory-prefs") {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(MemoryPref.allCases) { field in prefPicker(field, current: s.value(field)) }
            }
        }
        QuietDisclosure(label: Self.localLabel, open: localStartsOpen, id: "memory-local") {
            VStack(alignment: .leading, spacing: 0) { onThisPhone(mentionsDeletion: true) }
        }
        QuietDisclosure(label: L.t("How it works", "Cómo funciona"), id: "memory-retention") {
            MemoryExplanation(retentionDays: s.retentionDays, compact: true)
        }
        deleteEverything(showsError: true)
        if center.notice == .erasedEverything, s.enabled, center.nativeOptedIn {
            QuietNote(text: L.t("Memory stays on. Your next question restarts it.", "La memoria sigue activa. Tu próxima pregunta la reinicia."),
                      id: "memory-still-on")
                .padding(.top, 6)
        }
    }

    /// iPhone questions are not in memory: one line that says so and one button to the consent sheet.
    private var turnOn: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                // "Not added to memory", not "not saved": the phone does keep the asset as a shortcut.
                Text(L.t("iPhone questions are not added to account memory.", "Las preguntas del iPhone no añaden memoria de cuenta."))
                    .quietFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted).quietWraps()
                Spacer(minLength: 8)
                QuietChip(title: L.t("Turn on", "Activar"), id: "memory-turn-on") { showingConsent = true }
                    .disabled(center.saving)
                    .accessibilityHint(L.t("Opens the full explanation before anything is turned on.",
                                           "Abre la explicación completa antes de activar algo."))
            }
            .frame(minHeight: 52)
            .padding(.vertical, 4)
            Rectangle().fill(Theme.warmHair).frame(height: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("memory-off")
    }

    /// Where the phone's two lists live, and the one case in which a thesis's text leaves it.
    static var onThisPhoneNote: String {
        L.t("Bobby keeps these on this iPhone, not on its servers. The text of a thesis is sent, with that question, only when you start a review: to Bobby and to the AI providers that write the answer.",
            "Bobby guarda esto en este iPhone, no en sus servidores. El texto de una tesis se envía, junto con esa pregunta, solo cuando inicias una revisión: a Bobby y a los proveedores de IA que escriben la respuesta.")
    }

    /// What each deletion on this screen removes from the phone, no more than the code does.
    static var onThisPhoneDeletionNote: String {
        L.t("Forget removes an asset's shortcut. Delete everything clears the shortcuts, the theses you wrote and the follow-up notes.",
            "Olvidar quita el acceso rápido de un activo. Borrar todo quita los accesos rápidos, las tesis que escribiste y las notas de seguimiento.")
    }

    /// What the phone keeps with no copy on Bobby's servers: the shortcut row and the theses written
    /// here (count only). `mentionsDeletion` is false where Forget and Delete everything are not on screen.
    @ViewBuilder private func onThisPhone(mentionsDeletion: Bool) -> some View {
        Text(mentionsDeletion ? Self.onThisPhoneNote + " " + Self.onThisPhoneDeletionNote : Self.onThisPhoneNote)
            .font(.system(size: 12)).foregroundStyle(Theme.warmDim).fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, 8)
            .accessibilityIdentifier("memory-local-note")
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(L.t("Recent assets shown as shortcuts", "Activos recientes que ves como accesos rápidos"))
                    .font(.system(size: 13)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
                Text(center.local.shortcuts.isEmpty ? L.t("No shortcuts", "Sin accesos rápidos") : center.local.shortcuts.joined(separator: " · "))
                    .font(.mono(12, .medium)).foregroundStyle(Theme.cream).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("memory-local-shortcuts")
            }
            Spacer(minLength: 8)
            if !center.local.shortcuts.isEmpty {
                Button { center.clearShortcuts() } label: {
                    Text(L.t("Clear", "Quitar")).font(.system(size: 12.5, weight: .medium)).foregroundStyle(Theme.warmMuted)
                        .padding(.horizontal, 12).frame(minHeight: 32)
                        .background(Capsule().fill(Theme.warmFill))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L.t("Clear the shortcuts on this iPhone", "Quitar los accesos rápidos de este iPhone"))
                .accessibilityIdentifier("memory-clear-shortcuts")
            }
        }
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
        HStack(spacing: 12) {
            Text(L.t("Theses you wrote", "Tesis que escribiste"))
                .font(.system(size: 13)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Text(center.local.theses == 0 ? L.t("No theses", "Sin tesis") : "\(center.local.theses)")
                .font(.mono(12, .medium)).foregroundStyle(Theme.cream)
                .accessibilityIdentifier("memory-local-theses")
        }
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
        .accessibilityElement(children: .combine)
        followUpNotes
    }

    /// What the phone keeps to plan follow-ups, as HarnessNotes says it: a header that states how
    /// the app is built, one row per asset with its own erase, what Bobby does with them, and one
    /// erase for all of it. With nothing kept it is one quiet line.
    @ViewBuilder private var followUpNotes: some View {
        let notes = fixedNotes ?? harness.notes
        VStack(alignment: .leading, spacing: 0) {
            if notes.isEmpty {
                QuietNote(text: notes.quietLine, id: "memory-notes-empty").frame(minHeight: 52)
            } else {
                Text(HarnessNotes.header)
                    .font(.system(size: 12)).foregroundStyle(Theme.warmDim).fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 14).padding(.bottom, 4)
                    .accessibilityIdentifier("memory-notes-header")
                ForEach(notes.assets) { asset in noteRow(asset) }
                if !notes.general.isEmpty {
                    sentences(notes.general)
                        .padding(.top, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("memory-notes-general")
                }
                QuietLink(title: HarnessNotes.eraseAll, id: "memory-notes-erase") {
                    guard fixedNotes == nil else { return }
                    Task { await harness.forgetLedger() }
                }
                .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("memory-notes")
    }

    /// The asset and its Erase on one line, then one sentence per line: each is short enough to be
    /// read whole, in every language, without the row turning into a paragraph.
    private func noteRow(_ asset: HarnessNotes.Asset) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                Text(asset.symbol).font(.mono(13, .medium)).foregroundStyle(Theme.cream)
                Spacer(minLength: 8)
                if asset.erasable {
                    Button {
                        guard fixedNotes == nil else { return }
                        Task { await harness.forget(symbol: asset.symbol) }
                    } label: {
                        // "Erase", not "Forget": Forget is the button of what Bobby's servers remember, above.
                        Text(HarnessNotes.eraseOne).font(.system(size: 12.5, weight: .medium)).foregroundStyle(Theme.warmMuted)
                            .padding(.horizontal, 12).frame(minHeight: 32)
                            .background(Capsule().fill(Theme.warmFill))
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(HarnessNotes.eraseLabel(symbol: asset.symbol))
                    .accessibilityIdentifier("memory-note-forget-\(asset.symbol)")
                }
            }
            .frame(minHeight: asset.erasable ? 44 : 30)
            sentences(asset.lines)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(asset.symbol + ". " + asset.text)
                .accessibilityIdentifier("memory-note-\(asset.symbol)")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 8)
    }

    private func sentences(_ lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                Text(line).font(.system(size: 13)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder private func deleteEverything(showsError: Bool) -> some View {
        Button { center.requestForgetAll() } label: {
            Text(L.t("Delete everything", "Borrar todo")).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.down.opacity(0.9))
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .disabled(center.saving)
        .padding(.top, 18)
        .accessibilityIdentifier("memory-forget-all")
        if let notice = center.notice {
            Text(notice.message).font(.system(size: 13)).foregroundStyle(Theme.cream).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
                .accessibilityIdentifier("memory-notice")
        } else if showsError, let error = center.lastError {
            Text(error.message).font(.system(size: 12)).foregroundStyle(Theme.cream).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
                .accessibilityIdentifier("memory-error")
        }
    }

    private func prefLabel(_ field: MemoryPref) -> String {
        switch field {
        case .horizon: return L.t("Horizon", "Horizonte")
        case .experience: return L.t("Experience", "Experiencia")
        case .risk: return L.t("Risk you prefer explained", "Riesgo que prefieres ver explicado")
        }
    }

    private func optionLabel(_ field: MemoryPref, _ value: String) -> String {
        switch (field, value) {
        case (.horizon, "intraday"): return L.t("Today", "Hoy")
        case (.horizon, "week"): return L.t("Weeks", "Semanas")
        case (.horizon, "month"): return L.t("Months", "Meses")
        case (.horizon, "long"): return L.t("Long", "Largo")
        case (.experience, "new"): return L.t("Starting", "Empezando")
        case (.experience, "some"): return L.t("Some", "Algo")
        case (.experience, "experienced"): return L.t("Experienced", "Con experiencia")
        case (.risk, "low"): return L.t("Low", "Bajo")
        case (.risk, "medium"): return L.t("Medium", "Medio")
        case (.risk, "high"): return L.t("High", "Alto")
        default: return value
        }
    }

    private func prefPicker(_ field: MemoryPref, current: String?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(prefLabel(field).uppercased()).font(.mono(10.5, .medium)).tracking(1.2).foregroundStyle(Theme.warmDim)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    // "Not set" clears the preference (null on the server).
                    chip(L.t("Not set", "Sin definir"), selected: current == nil) {
                        if current != nil { Task { await center.setPref(field, nil) } }
                    }
                    ForEach(field.allowed, id: \.self) { value in
                        chip(optionLabel(field, value), selected: current == value) {
                            if current != value { Task { await center.setPref(field, value) } }
                        }
                    }
                }
            }
        }
        .padding(.top, 18)
        .disabled(center.saving)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("memory-pref-\(field.rawValue)")
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(selected ? Theme.bg : Theme.cream)
                .padding(.horizontal, 12).frame(height: 32)
                .background(Capsule().fill(selected ? Theme.cream : Theme.warmFill))
                .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: selected ? 0 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func assetRow(_ asset: RememberedAsset) -> some View {
        HStack(spacing: 12) {
            Text(asset.symbol).font(.mono(13, .medium)).foregroundStyle(Theme.cream).frame(minWidth: 56, alignment: .leading)
            Text([asset.asks == 1 ? L.t("1 time", "1 vez") : L.t("\(asset.asks) times", "\(asset.asks) veces"),
                  asset.lastAskedAt.map { RelativeDateTimeFormatter.bobby.localizedString(for: $0, relativeTo: Date()) }]
                    .compactMap { $0 }.joined(separator: " · "))
                .quietFont(14, relativeTo: .callout).monospacedDigit().foregroundStyle(Theme.warmMuted).quietWraps()
            Spacer(minLength: 8)
            Button { Task { await center.forget(asset.symbol) } } label: {
                Text(L.t("Forget", "Olvidar")).font(.system(size: 12.5, weight: .medium)).foregroundStyle(Theme.warmMuted)
                    .padding(.horizontal, 12).frame(minHeight: 32)
                    .background(Capsule().fill(Theme.warmFill))
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(center.saving)
            .accessibilityLabel(L.t("Forget \(asset.symbol)", "Olvidar \(asset.symbol)"))
            .accessibilityIdentifier("memory-forget-\(asset.symbol)")
        }
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
    }
}

private extension RelativeDateTimeFormatter {
    /// "2 days ago" / "hace 2 días", in the app's language.
    static var bobby: RelativeDateTimeFormatter {
        let f = RelativeDateTimeFormatter()
        f.locale = L.locale
        f.unitsStyle = .full
        return f
    }
}
