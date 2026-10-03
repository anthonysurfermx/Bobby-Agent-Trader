// Profile › Memory: shared account memory plus a separate, default-off iPhone ask opt-in. The screen
// shows corrections, remembered assets and confirmed deletion; MemoryCenter owns account isolation.
import SwiftUI

struct MemoryView: View {
    @ObservedObject var center: MemoryCenter = .shared
    /// R11: nothing reaches the network before the risk notice is accepted.
    let riskAccepted: Bool
    /// Shown as its own sheet (a close button); pushed from the briefing settings it has a back button.
    var onClose: (() -> Void)? = nil
    @ObservedObject private var account = AccountSession.shared

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
            guard riskAccepted, account.isSignedIn else { return }
            await center.refresh()
        }
        .confirmationDialog(L.t("Erase every remembered asset and your preferences?", "¿Borrar todos los activos recordados y tus preferencias?"),
                            isPresented: Binding(get: { center.confirmingForgetAll }, set: { if !$0 { center.cancelForgetAll() } }),
                            titleVisibility: .visible) {
            Button(L.t("Delete everything", "Borrar todo"), role: .destructive) { Task { await center.confirmForgetAll() } }
            Button(L.t("Cancel", "Cancelar"), role: .cancel) { center.cancelForgetAll() }
        } message: {
            Text(L.t("Memory-based briefings already delivered are removed too. A paused memory stays paused.",
                     "También se eliminan los resúmenes basados en memoria ya entregados. Si la memoria está en pausa, sigue en pausa."))
        }
    }

    @ViewBuilder private var content: some View {
        if !account.isSignedIn {
            BriefingNote(text: MemoryError.signedOut.message).accessibilityIdentifier("memory-signed-out")
        } else if !riskAccepted {
            BriefingNote(text: L.t("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                                   "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores."))
                .accessibilityIdentifier("memory-risk-required")
        } else if let s = center.snapshot {
            loaded(s)
        } else if center.loading {
            ProgressView().tint(Theme.warmMuted).frame(maxWidth: .infinity).padding(.top, 40)
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text((center.lastError ?? .unavailable).message).font(.system(size: 13)).foregroundStyle(Theme.down)
                BriefingPillButton(title: L.t("Try again", "Reintentar")) { Task { await center.refresh() } }
                    .accessibilityIdentifier("memory-retry")
            }
            .padding(.top, 24)
        }
    }

    @ViewBuilder private func loaded(_ s: MemorySnapshot) -> some View {
        Text(L.t("Bobby stores the asset symbol, ask count and dates, last named horizon and last public market price for up to \(s.retentionDays) days. It does not store full questions or your name in memory. iPhone questions join only after you enable them below.",
                 "Bobby guarda el símbolo del activo, número y fechas de consultas, último horizonte indicado y último precio público de mercado hasta \(s.retentionDays) días. No guarda preguntas completas ni tu nombre en la memoria. Las preguntas del iPhone se suman solo si las activas abajo."))
            .font(.system(size: 13)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
            .padding(.top, 10)
            .accessibilityIdentifier("memory-retention")
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
        BriefingToggleRow(label: L.t("Include iPhone questions", "Incluir preguntas del iPhone"),
                          detail: !s.enabled
                            ? L.t("Resume account memory above before opting in on iPhone.",
                                  "Reanuda la memoria de la cuenta arriba antes de activarla en iPhone.")
                            : center.nativeOptedIn
                                ? L.t("New iPhone desk answers can update your account memory.",
                                      "Las respuestas nuevas del desk en iPhone pueden actualizar la memoria de tu cuenta.")
                                : L.t("Off on this iPhone, even while web memory is on.",
                                      "Desactivado en este iPhone, aunque la memoria web esté activa."),
                          footnote: nil, isOn: center.nativeOptedIn, saving: center.saving,
                          enabled: s.enabled && !center.saving) { on in
            _ = center.setNativeCapture(on)
        }
        .padding(.top, 12)
        .accessibilityIdentifier("memory-native-opt-in")
        ForEach(MemoryPref.allCases) { field in prefPicker(field, current: s.value(field)) }
        BriefingSectionLabel(text: L.t("Assets", "Activos") + " · \(s.assets.count)")
        if s.assets.isEmpty {
            Text(L.t("Nothing yet. Assets asked about on the web, or on an opted-in iPhone, appear here.",
                     "Todavía nada. Aquí aparecen los activos consultados en la web o en un iPhone con permiso activado."))
                .font(.system(size: 12)).foregroundStyle(Theme.warmDim)
        } else {
            ForEach(s.assets) { asset in assetRow(asset) }
        }
        Button { center.requestForgetAll() } label: {
            Text(L.t("Delete everything", "Borrar todo")).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.down.opacity(0.9))
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .disabled(center.saving)
        .padding(.top, 18)
        .accessibilityIdentifier("memory-forget-all")
        if let error = center.lastError {
            Text(error.message).font(.system(size: 12)).foregroundStyle(Theme.down).padding(.top, 6)
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
        f.locale = Locale(identifier: L.isSpanish ? "es_MX" : "en_US")
        f.unitsStyle = .full
        return f
    }
}
