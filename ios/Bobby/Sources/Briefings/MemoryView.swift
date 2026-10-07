// Profile › Memory: what Bobby remembers about the account, and what this iPhone keeps.
// The screen shows the same explanation as the consent sheet (what is kept, what is sent to the AI
// provider, for how long); when iPhone questions are not in memory its "Turn on" opens that sheet
// (one consent path, MemoryConsentSheet). Corrections, remembered assets, the on-phone section and
// confirmed deletion follow; MemoryCenter owns account isolation and makes deletion complete
// (server, shortcuts, theses). What the phone keeps shows to everyone, signed in or not.
import SwiftUI

struct MemoryView: View {
    @ObservedObject var center: MemoryCenter = .shared
    /// R11: nothing reaches the network before the risk notice is accepted.
    let riskAccepted: Bool
    /// Shown as its own sheet (a close button); pushed from the briefing settings it has a back button.
    var onClose: (() -> Void)? = nil
    /// Observed so a sign-in or sign-out redraws the screen; the center names the account.
    @ObservedObject private var account = AccountSession.shared
    @State private var showingConsent = false

    private var signedIn: Bool { center.currentUser() != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if onClose != nil { BriefingTopBar(title: L.t("Memory", "Memoria"), onClose: onClose) }
                Text(L.t("What Bobby remembers", "Lo que Bobby recuerda"))
                    .font(.system(size: 26, weight: .light, design: .rounded)).foregroundStyle(Theme.cream)
                    .padding(.top, onClose == nil ? 4 : 14)
                content
            }
            .padding(.horizontal, 22)
            .padding(.top, onClose == nil ? 8 : 16)
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
            Text(Self.deleteEverythingWarning)
        }
    }

    /// The confirmation says exactly what goes: the server's memory and the two things kept on this phone.
    static var deleteEverythingWarning: String {
        L.t("This deletes what Bobby's servers remember about your account, the shortcuts on this iPhone and the theses you wrote here. It cannot be undone.",
            "Esto borra lo que los servidores de Bobby recuerdan de tu cuenta, los accesos rápidos de este iPhone y las tesis que escribiste aquí. No se puede deshacer.")
    }

    @ViewBuilder private var content: some View {
        if !signedIn {
            BriefingNote(text: MemoryError.signedOut.message).accessibilityIdentifier("memory-signed-out")
            // Nobody signed in: the phone still keeps a shortcut row and theses of its own. No server call.
            onThisPhone(mentionsDeletion: false)
        } else if !riskAccepted {
            BriefingNote(text: L.t("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                                   "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores."))
                .accessibilityIdentifier("memory-risk-required")
            onThisPhone(mentionsDeletion: false)
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

    @ViewBuilder private func loaded(_ s: MemorySnapshot) -> some View {
        MemoryExplanation(retentionDays: s.retentionDays, compact: true)
            .padding(.top, 2)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("memory-retention")
        if !center.nativeOptedIn { turnOn }
        BriefingToggleRow(label: L.t("Use account memory", "Usar memoria de la cuenta"),
                          detail: s.enabled ? L.t("Bobby can use your memory for answers and opted-in briefings.",
                                                  "Bobby puede usar tu memoria para respuestas y resúmenes aceptados.")
                                            : L.t("Paused across web and iPhone: no new asks are saved or personalized.",
                                                  "En pausa en web y iPhone: no se guardan ni personalizan consultas nuevas."),
                          footnote: nil, isOn: s.enabled, saving: center.saving, enabled: !center.saving) { on in
            Task { await center.setEnabled(on) }
        }
        .padding(.top, 18)
        .accessibilityIdentifier("memory-enabled")
        if center.nativeOptedIn {
            // On only through the consent sheet; switching it off here is immediate and needs no network.
            BriefingToggleRow(label: L.t("Include iPhone questions", "Incluir preguntas del iPhone"),
                              detail: L.t("New iPhone desk answers can update your account memory.",
                                          "Las respuestas nuevas del desk en iPhone pueden actualizar la memoria de tu cuenta."),
                              footnote: nil, isOn: center.nativeOptedIn, saving: false, enabled: !center.saving) { on in
                if !on { _ = center.setNativeCapture(false) }
            }
            .padding(.top, 12)
            .accessibilityIdentifier("memory-native-opt-in")
        }
        ForEach(MemoryPref.allCases) { field in prefPicker(field, current: s.value(field)) }
        BriefingSectionLabel(text: L.t("Assets", "Activos") + " · \(s.assets.count)")
        if s.assets.isEmpty {
            Text(L.t("Nothing yet. Assets asked about on the web, or on an opted-in iPhone, appear here.",
                     "Todavía nada. Aquí aparecen los activos consultados en la web o en un iPhone con permiso activado."))
                .font(.system(size: 12)).foregroundStyle(Theme.warmDim)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            ForEach(s.assets) { asset in assetRow(asset) }
        }
        onThisPhone(mentionsDeletion: true)
        deleteEverything(showsError: true)
        if center.notice == .erasedEverything, s.enabled, center.nativeOptedIn {
            Text(L.t("Memory is still on: your next question starts it again. You can pause it above.",
                     "La memoria sigue activa: tu próxima pregunta la empieza de nuevo. Puedes pausarla arriba."))
                .font(.system(size: 12)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
                .accessibilityIdentifier("memory-still-on")
        }
    }

    /// iPhone questions are not in memory: one line that says so and one button to the consent sheet.
    private var turnOn: some View {
        VStack(alignment: .leading, spacing: 10) {
            // "Not added to memory", not "not saved": the phone does keep the asset as a shortcut (below).
            Text(L.t("Off on this iPhone: what you ask here is not added to memory.",
                     "Desactivada en este iPhone: lo que preguntas aquí no se agrega a la memoria."))
                .font(.system(size: 14)).foregroundStyle(Theme.cream).fixedSize(horizontal: false, vertical: true)
            Button { showingConsent = true } label: {
                Text(L.t("Turn on", "Activar")).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.bg)
                    .padding(.horizontal, 18).frame(minHeight: 44)
                    .background(Capsule().fill(Theme.cream))
            }
            .buttonStyle(.plain)
            .disabled(center.saving)
            .accessibilityHint(L.t("Opens the full explanation before anything is turned on.",
                                   "Abre la explicación completa antes de activar algo."))
            .accessibilityIdentifier("memory-turn-on")
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.nucleoGlass))
        .padding(.top, 16)
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
        L.t("Forget removes an asset's shortcut. Delete everything clears the shortcuts and the theses you wrote.",
            "Olvidar quita el acceso rápido de un activo. Borrar todo quita los accesos rápidos y las tesis que escribiste.")
    }

    /// What the phone keeps with no copy on Bobby's servers: the shortcut row and the theses written
    /// here (count only). `mentionsDeletion` is false where Forget and Delete everything are not on screen.
    @ViewBuilder private func onThisPhone(mentionsDeletion: Bool) -> some View {
        BriefingSectionLabel(text: L.t("Kept on this iPhone", "Guardado en este iPhone"))
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
        Text(L.t("Memory-based briefings already delivered are removed too. A paused memory stays paused.",
                 "También se eliminan los resúmenes basados en memoria ya entregados. Si la memoria está en pausa, sigue en pausa."))
            .font(.system(size: 12)).foregroundStyle(Theme.warmDim).fixedSize(horizontal: false, vertical: true)
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
            VStack(alignment: .leading, spacing: 2) {
                Text(asset.asks == 1 ? L.t("1 time", "1 vez") : L.t("\(asset.asks) times", "\(asset.asks) veces"))
                    .font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                if let last = asset.lastAskedAt {
                    Text(RelativeDateTimeFormatter.bobby.localizedString(for: last, relativeTo: Date()))
                        .font(.mono(10.5)).foregroundStyle(Theme.warmDim)
                }
            }
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
