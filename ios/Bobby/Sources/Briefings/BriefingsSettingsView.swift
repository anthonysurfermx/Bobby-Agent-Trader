// Bobby Pro market briefings — Profile › Market briefings (build 53).
// One weekly switch (Monday 08:00 New York) with the phone's
// equivalent, the two consents, the followed assets, and links to the inbox and the memory screen.
// Invariants:
//  - Every value shown comes from BriefingsCenter (the account's revisioned settings); a switch shows its
//    pending target with a spinner and is saved only when the server answers (the center owns that).
//  - A non-Pro account sees why and how to get Bobby Pro, and can only turn the weekly switch OFF. A schedule the
//    server has not adopted (`configured:false`) reads "Schedule pending" and cannot be turned on.
//  - iOS permission is separate from the account choice: a denied permission with a switch on shows
//    "Notifications blocked in iOS" and the Settings route; it never claims delivery.
//  - Consent copy matches the privacy page (src/pages/PrivacyPage.tsx "Market briefings and
//    notifications"): memory never goes to an AI provider; narration audio is made by OpenAI from the
//    shared report text only.
//  - R11: no network before the risk notice is accepted (the center refuses too); signed out = no calls.
// BriefingCopy / BriefingFormat / BriefingSettingsPresentation are pure so tests can pin the mapping.
import SwiftUI

// MARK: - Copy and formatting shared by the briefing screens

enum BriefingCopy {
    static func cadence(_ c: BriefingCadence, spanish: Bool? = nil) -> String {
        switch c {
        case .morning: return L.t("Market opening", "Apertura de mercado", spanish: spanish)
        case .close: return L.t("Market close", "Cierre de mercado", spanish: spanish)
        case .weekly: return L.t("Weekly briefing", "Resumen semanal", spanish: spanish)
        }
    }

    /// What each briefing covers (the product design's table, not report content).
    static func cadenceDetail(_ c: BriefingCadence, spanish: Bool? = nil) -> String {
        switch c {
        case .morning: return L.t("Before the US open: overnight context, your assets, risks and the day’s agenda",
                                  "Antes de la apertura en EE. UU.: lo de la noche, tus activos, riesgos y la agenda del día", spanish: spanish)
        case .close: return L.t("After the US close: what changed in the session and what is still open",
                                "Después del cierre en EE. UU.: qué cambió en la sesión y qué sigue abierto", spanish: spanish)
        case .weekly: return L.t("A short look at the past week and what to watch this week",
                                 "Un vistazo breve a la semana pasada y qué vigilar esta semana", spanish: spanish)
        }
    }

    /// The Profile row detail: the briefings this account has on, or "Bobby Pro" when none.
    static func summary(_ settings: BriefingSettings?, spanish: Bool? = nil) -> String {
        let on = BriefingCadence.offeredCadences.filter { settings?.isOn($0) == true }
        guard !on.isEmpty else { return "Bobby Pro" }
        return on.map { cadence($0, spanish: spanish) }.joined(separator: " · ")
    }

    static func quality(_ raw: String?, spanish: Bool? = nil) -> String? {
        switch raw {
        case "partial": return L.t("Partial data", "Datos parciales", spanish: spanish)
        case "facts_only": return L.t("Facts only", "Solo datos", spanish: spanish)
        default: return nil
        }
    }

    /// A section's freshness badge; nil for live data (no badge needed).
    static func status(_ raw: String, spanish: Bool? = nil) -> String? {
        switch raw {
        case "closed": return L.t("Closed", "Cerrado", spanish: spanish)
        case "stale": return L.t("Stale", "Desactualizado", spanish: spanish)
        case "partial": return L.t("Partial", "Parcial", spanish: spanish)
        case "24_7": return "24/7"
        case "delayed": return L.t("Delayed", "Con retraso", spanish: spanish)
        case "missing": return L.t("No data", "Sin datos", spanish: spanish)
        default: return nil
        }
    }

    /// The honest line for a period whose report is not (yet) there; nil when it is ready.
    static func latestNotice(_ latest: BriefingLatest, spanish: Bool? = nil) -> String? {
        guard BriefingCadence.offeredCadences.contains(latest.cadence) else { return nil }
        switch latest.state {
        case .ready: return nil
        case .preparing:
            return L.t("\(cadence(latest.cadence, spanish: spanish)): being prepared",
                       "\(cadence(latest.cadence, spanish: spanish)): en preparación", spanish: spanish)
        case .unavailable:
            switch latest.cadence {
            case .morning: return L.t("Today’s briefing isn’t available", "El resumen de hoy no está disponible", spanish: spanish)
            case .close: return L.t("Today’s close briefing isn’t available", "El resumen del cierre de hoy no está disponible", spanish: spanish)
            case .weekly: return L.t("This week’s briefing isn’t available", "El resumen de esta semana no está disponible", spanish: spanish)
            }
        }
    }

    /// The US equity session label of a report (never implies a live session when it is closed).
    static func equitySession(_ s: BriefingEquitySession?, spanish: Bool? = nil) -> String? {
        guard let s else { return nil }
        let early = s.earlyClose ? s.closeAt.map {
            L.t(" · early close \(BriefingFormat.time($0, spanish: spanish, zone: BriefingFormat.newYork)) New York",
                " · cierre anticipado \(BriefingFormat.time($0, spanish: spanish, zone: BriefingFormat.newYork)) Nueva York", spanish: spanish)
        } ?? "" : ""
        switch s.state {
        case "open": return L.t("US market open", "Mercado de EE. UU. abierto", spanish: spanish) + early
        case "pre_market": return L.t("US market not open yet (pre-market)", "Mercado de EE. UU. aún sin abrir (pre-mercado)", spanish: spanish) + early
        case "after_close": return L.t("US market closed for the day", "Mercado de EE. UU. cerrado por hoy", spanish: spanish) + early
        case "closed_weekend": return L.t("US market closed (weekend)", "Mercado de EE. UU. cerrado (fin de semana)", spanish: spanish)
        case "closed_holiday": return L.t("US market closed (holiday)", "Mercado de EE. UU. cerrado (feriado)", spanish: spanish)
        default: return L.t("US market session unknown", "Sesión del mercado de EE. UU. desconocida", spanish: spanish)
        }
    }
}

enum BriefingFormat {
    static let newYork = TimeZone(identifier: "America/New_York") ?? TimeZone(secondsFromGMT: -5 * 3600)!

    static func formatter(_ template: String, spanish: Bool?, zone: TimeZone) -> DateFormatter {
        let f = DateFormatter()
        f.locale = L.formatLocale(spanish: spanish)
        f.timeZone = zone
        f.setLocalizedDateFormatFromTemplate(template)
        return f
    }

    static func time(_ d: Date, spanish: Bool? = nil, zone: TimeZone = .current) -> String {
        formatter("jmm", spanish: spanish, zone: zone).string(from: d)
    }

    static func weekdayTime(_ d: Date, spanish: Bool? = nil, zone: TimeZone = .current) -> String {
        formatter("EEEjmm", spanish: spanish, zone: zone).string(from: d)
    }

    /// "Friday, October 2" in New York (a report's market date).
    static func newYorkDay(_ d: Date, spanish: Bool? = nil) -> String {
        formatter("EEEEMMMMd", spanish: spanish, zone: newYork).string(from: d)
    }

    /// An inbox row's date in the phone's zone: "Oct 2, 8:00 AM".
    static func inboxDate(_ d: Date, spanish: Bool? = nil, zone: TimeZone = .current) -> String {
        formatter("MMMdjmm", spanish: spanish, zone: zone).string(from: d)
    }

    /// "Data as of" in the phone's zone; the day is added when it is not today.
    static func asOf(_ d: Date, now: Date = Date(), spanish: Bool? = nil, zone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let sameDay = calendar.isDate(d, inSameDayAs: now)
        return formatter(sameDay ? "jmm" : "MMMdjmm", spanish: spanish, zone: zone).string(from: d)
    }

    /// Whether the phone's zone shows a different wall clock than New York at `d`.
    static func differsFromNewYork(at d: Date, zone: TimeZone) -> Bool {
        zone.secondsFromGMT(for: d) != newYork.secondsFromGMT(for: d)
    }

    /// The server's English weekday name ("Sunday") in the app's language, plural ("Sundays" / "Domingos").
    static func weekdays(_ english: String?, spanish: Bool? = nil) -> String? {
        guard let english else { return nil }
        let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        guard let index = names.firstIndex(of: english) else { return nil }
        let en = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"]
        let es = ["Domingos", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábados"]
        if let spanish { return spanish ? es[index] : en[index] }
        let localized: [String: [String]] = [
            "fr": ["Dimanches", "Lundis", "Mardis", "Mercredis", "Jeudis", "Vendredis", "Samedis"],
            "pt": ["Domingos", "Segundas-feiras", "Terças-feiras", "Quartas-feiras", "Quintas-feiras", "Sextas-feiras", "Sábados"],
            "it": ["Domeniche", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabati"],
            "de": ["Sonntags", "Montags", "Dienstags", "Mittwochs", "Donnerstags", "Freitags", "Samstags"]
        ]
        return localized[L.language]?[index] ?? (L.isSpanish ? es[index] : en[index])
    }

    /// The schedule line under a switch: New York time from the server policy, then the phone's
    /// equivalent from `nextAt` when its zone shows another time. Unadopted: "Schedule pending".
    static func schedule(_ cadence: BriefingCadence, _ s: BriefingSchedule?, spanish: Bool? = nil,
                         zone: TimeZone = .current) -> String {
        guard let s, s.configured else { return L.t("Schedule pending", "Horario en revisión", spanish: spanish) }
        let yours = L.t("your time", "tu hora", spanish: spanish)
        switch cadence {
        case .morning:
            var line = L.t("Every day · \(s.localTime ?? "08:00") New York", "Todos los días · \(s.localTime ?? "08:00") Nueva York", spanish: spanish)
            if let next = s.nextAt, differsFromNewYork(at: next, zone: zone) {
                line += " · \(time(next, spanish: spanish, zone: zone)) \(yours)"
            }
            return line
        case .close:
            let delay = s.delayMinutes ?? 15
            var line = L.t("\(delay) min after the US close (New York)", "\(delay) min después del cierre en EE. UU. (Nueva York)", spanish: spanish)
            if let next = s.nextAt {
                line += " · " + L.t("next \(weekdayTime(next, spanish: spanish, zone: zone)) \(yours)",
                                    "próximo: \(weekdayTime(next, spanish: spanish, zone: zone)) \(yours)", spanish: spanish)
            }
            return line
        case .weekly:
            let day = weekdays(s.weekday ?? "Monday", spanish: spanish) ?? s.weekday ?? ""
            var line = L.t("\(day) · \(s.localTime ?? "08:00") New York", "\(day) · \(s.localTime ?? "08:00") Nueva York", spanish: spanish)
            if let next = s.nextAt, differsFromNewYork(at: next, zone: zone) {
                line += " · \(weekdayTime(next, spanish: spanish, zone: zone)) \(yours)"
            }
            return line
        }
    }
}

// MARK: - What the settings screen shows (pure)

struct BriefingCadenceRow: Equatable, Identifiable {
    let cadence: BriefingCadence
    /// The pending target while saving, else the confirmed value.
    let isOn: Bool
    let saving: Bool
    /// The server has adopted this schedule.
    let configured: Bool
    /// The switch takes a tap: never while saving; turning ON needs Pro + an adopted schedule.
    let interactive: Bool
    var id: String { cadence.rawValue }
}

struct BriefingSettingsPresentation: Equatable {
    let rows: [BriefingCadenceRow]
    /// The account is known not to have Pro: explain and offer the paywall.
    let showsPro: Bool
    /// A switch is on for this account but iOS will not show notifications.
    let blocked: Bool

    static func make(settings: BriefingSettings?, eligiblePro: Bool?, schedules: BriefingSchedules?,
                     pending: [BriefingCadence: Bool], permission: PushPermission) -> BriefingSettingsPresentation {
        let rows = BriefingCadence.offeredCadences.map { c -> BriefingCadenceRow in
            let isOn = pending[c] ?? settings?.isOn(c) ?? false
            let saving = pending[c] != nil
            let configured = schedules?.schedule(for: c)?.configured ?? false
            let canTurnOn = settings != nil && eligiblePro == true && configured
            return BriefingCadenceRow(cadence: c, isOn: isOn, saving: saving, configured: configured,
                                      interactive: settings != nil && !saving && (isOn || canTurnOn))
        }
        return BriefingSettingsPresentation(rows: rows, showsPro: settings != nil && eligiblePro == false,
                                            blocked: permission == .denied && (settings?.weeklyEnabled ?? false))
    }
}

// MARK: - Screen

/// Where the briefing screens lead inside their navigation stack.
enum BriefingsPath: Hashable {
    case inbox, memory
    case report(String)
}

struct BriefingsSettingsView: View {
    @ObservedObject var center: BriefingsCenter = .shared
    /// R11: the profile's risk notice (nothing reaches the network before it is accepted).
    let riskAccepted: Bool
    /// Close this sheet and open Bobby Pro (the AccountSheet's own paywall route).
    let onShowPro: () -> Void
    let onClose: () -> Void
    @ObservedObject private var account = AccountSession.shared
    @State private var path: [BriefingsPath] = []

    static let maxAssets = 6

    private var presentation: BriefingSettingsPresentation {
        .make(settings: center.settings, eligiblePro: center.eligiblePro, schedules: center.schedules,
              pending: center.pendingCadences, permission: center.permission)
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    BriefingTopBar(title: L.t("Weekly market briefing", "Resumen semanal de mercado"), onClose: onClose)
                    content
                }
                .padding(.horizontal, 22)
                .padding(.top, 16)
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)
            .background(Theme.nucleoSurface.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: BriefingsPath.self) { destination in
                switch destination {
                case .inbox:
                    BriefingInboxView(center: center, onShowPro: onShowPro)
                case .memory:
                    MemoryView(riskAccepted: riskAccepted)
                case .report(let id):
                    BriefingReportView(briefId: id, onShowPro: onShowPro)
                }
            }
        }
        .environment(\.colorScheme, .dark)
        .task {
            guard riskAccepted, account.isSignedIn else { return }
            await center.refreshPermission()
            await center.refresh()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            // Back from iOS Settings: the blocked banner follows the new permission (a local read).
            Task { await center.refreshPermission() }
        }
    }

    @ViewBuilder private var content: some View {
        Text(L.t("Start your week with a short market briefing every Monday at 08:00 New York. Bobby lets you know when it is ready; your phone’s time appears below.",
                 "Empieza la semana con un resumen breve de mercado cada lunes a las 08:00 de Nueva York. Bobby te avisa cuando está listo; abajo ves la hora de tu teléfono."))
            .font(.system(size: 13)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
            .padding(.top, 14)
        if !account.isSignedIn {
            BriefingNote(text: L.t("Sign in with Apple in your profile to get market briefings.",
                                   "Inicia sesión con Apple en tu perfil para recibir resúmenes de mercado."))
                .accessibilityIdentifier("briefings-signed-out")
        } else if !riskAccepted {
            BriefingNote(text: L.t("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                                   "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores."))
                .accessibilityIdentifier("briefings-risk-required")
        } else if center.settings == nil {
            loadingOrError
        } else {
            loaded
        }
    }

    @ViewBuilder private var loadingOrError: some View {
        if center.loading {
            ProgressView().tint(Theme.warmMuted).frame(maxWidth: .infinity).padding(.top, 40)
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text((center.lastError ?? .unavailable).message).font(.system(size: 13)).foregroundStyle(Theme.down)
                BriefingPillButton(title: L.t("Try again", "Reintentar")) { Task { await center.refresh() } }
                    .accessibilityIdentifier("briefings-retry")
            }
            .padding(.top, 24)
        }
    }

    @ViewBuilder private var loaded: some View {
        let p = presentation
        if p.showsPro { proCard }
        if p.blocked { blockedBanner }
        BriefingSectionLabel(text: L.t("Weekly briefing", "Resumen semanal"))
        ForEach(p.rows) { row in cadenceRow(row) }
        if let error = center.lastError {
            Text(error.message).font(.system(size: 12)).foregroundStyle(Theme.down)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 8)
                .accessibilityIdentifier("briefings-error")
        }
        BriefingSectionLabel(text: L.t("Your briefings", "Tus resúmenes"))
        BriefingLinkRow(symbol: "tray.full", label: L.t("Your briefings", "Tus resúmenes"),
                        detail: L.t("Every report you received, also when you missed the notification",
                                    "Cada reporte que recibiste, también si no viste la notificación")) { path.append(.inbox) }
            .accessibilityIdentifier("briefings-inbox")
        BriefingSectionLabel(text: L.t("Assets you follow", "Activos que sigues"))
        assetsPicker
        BriefingSectionLabel(text: L.t("Privacy", "Privacidad"))
        consentRows
        BriefingLinkRow(symbol: "brain", label: L.t("Memory", "Memoria"),
                        detail: L.t("See, correct, pause or delete what Bobby remembers", "Ve, corrige, pausa o borra lo que Bobby recuerda")) { path.append(.memory) }
            .accessibilityIdentifier("briefings-memory")
    }

    private var proCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(BriefingsError.subscriptionRequired.message).font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.cream)
            Text(L.t("With Bobby Pro you can turn briefings on. Without it you can still turn them off; your choices stay with your account.",
                     "Con Bobby Pro puedes activar los resúmenes. Sin Pro igual puedes apagarlos; tus elecciones se quedan en tu cuenta."))
                .font(.system(size: 12)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
            BriefingPillButton(title: L.t("See Bobby Pro", "Ver Bobby Pro"), prominent: true, action: onShowPro)
                .accessibilityIdentifier("briefings-pro")
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.nucleoGlass))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.nucleoStroke, lineWidth: 1))
        .padding(.top, 18)
    }

    private var blockedBanner: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "bell.slash").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.cio)
            VStack(alignment: .leading, spacing: 8) {
                Text(L.t("Notifications blocked in iOS", "Notificaciones bloqueadas en iOS"))
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.cream)
                Text(L.t("Your briefings are saved, but this iPhone will not show their notifications until you allow them in Settings.",
                         "Tus resúmenes están guardados, pero este iPhone no mostrará sus notificaciones hasta que las permitas en Configuración."))
                    .font(.system(size: 12)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
                BriefingPillButton(title: L.t("Open Settings", "Abrir Configuración")) { center.openSystemSettings() }
                    .accessibilityIdentifier("briefings-open-settings")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.cio.opacity(0.07)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.cio.opacity(0.25), lineWidth: 1))
        .padding(.top, 18)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("briefings-blocked")
    }

    private func cadenceRow(_ row: BriefingCadenceRow) -> some View {
        BriefingToggleRow(label: BriefingCopy.cadence(row.cadence),
                          detail: BriefingCopy.cadenceDetail(row.cadence),
                          footnote: BriefingFormat.schedule(row.cadence, center.schedules?.schedule(for: row.cadence)),
                          isOn: row.isOn, saving: row.saving, enabled: row.interactive) { on in
            Task { await center.setCadence(row.cadence, on: on) }
        }
        .accessibilityIdentifier("briefings-switch-\(row.cadence.rawValue)")
    }

    @ViewBuilder private var consentRows: some View {
        let s = center.settings
        BriefingToggleRow(label: L.t("Narrate my briefings", "Narrar mis resúmenes"),
                          detail: L.t("Bobby’s server checks the report is yours and sends only its shared text, language and voice to OpenAI to make the audio. No name or account data goes with it.",
                                      "El servidor de Bobby comprueba que el reporte es tuyo y envía a OpenAI solo su texto compartido, el idioma y la voz para hacer el audio. No va tu nombre ni datos de tu cuenta."),
                          footnote: nil,
                          isOn: s?.audioConsentEnabled ?? false, saving: center.savingFields.contains("audioConsent"),
                          enabled: s != nil && !center.savingFields.contains("audioConsent")) { on in
            Task { await center.setAudioConsent(on) }
        }
        .accessibilityIdentifier("briefings-audio-consent")
        BriefingToggleRow(label: L.t("Use my memory", "Usar mi memoria"),
                          detail: L.t("Bobby may add sections for assets you ask about often and adjust explanations to your preferences. That selection happens on Bobby’s servers: your memory is never sent to an AI provider.",
                                      "Bobby puede añadir secciones de activos por los que preguntas seguido y ajustar las explicaciones a tus preferencias. Esa selección ocurre en los servidores de Bobby: tu memoria nunca se envía a un proveedor de IA."),
                          footnote: nil,
                          isOn: s?.analysisConsentEnabled ?? false, saving: center.savingFields.contains("analysisConsent"),
                          enabled: s != nil && !center.savingFields.contains("analysisConsent")) { on in
            Task { await center.setAnalysisConsent(on) }
        }
        .accessibilityIdentifier("briefings-memory-consent")
    }

    @ViewBuilder private var assetsPicker: some View {
        let chosen = center.settings?.assets ?? []
        let universe = center.options?.assets ?? []
        let saving = center.savingFields.contains("assets")
        VStack(alignment: .leading, spacing: 10) {
            Text(L.t("\(chosen.count) of \(Self.maxAssets) · each one gets its own section",
                     "\(chosen.count) de \(Self.maxAssets) · cada uno tiene su propia sección"))
                .font(.mono(10.5, .medium)).tracking(0.8).foregroundStyle(Theme.warmDim)
            if universe.isEmpty {
                Text(L.t("The asset list is not available right now.", "La lista de activos no está disponible por ahora."))
                    .font(.system(size: 12)).foregroundStyle(Theme.warmDim)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 64), spacing: 8)], alignment: .leading, spacing: 8) {
                    ForEach(universe, id: \.self) { symbol in
                        let selected = chosen.contains(symbol)
                        Button {
                            var next = chosen
                            if selected { next.removeAll { $0 == symbol } } else { next.append(symbol) }
                            Task { await center.setAssets(next) }
                        } label: {
                            Text(symbol).font(.mono(12, .medium))
                                .foregroundStyle(selected ? Theme.bg : Theme.cream)
                                .frame(maxWidth: .infinity).frame(height: 32)
                                .background(Capsule().fill(selected ? Theme.cream : Theme.warmFill))
                                .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: selected ? 0 : 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(saving || (!selected && chosen.count >= Self.maxAssets))
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .accessibilityIdentifier("briefings-asset-\(symbol)")
                    }
                }
                .opacity(saving ? 0.6 : 1)
            }
        }
        .padding(.top, 4)
    }
}

// MARK: - Small kit shared by the briefing and memory screens

struct BriefingTopBar: View {
    let title: String
    var onClose: (() -> Void)?

    var body: some View {
        HStack {
            Text(title.uppercased()).font(.mono(11, .medium)).tracking(1.6).foregroundStyle(Theme.warmDim)
            Spacer()
            if let onClose {
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmMuted)
                        .frame(width: 30, height: 30).background(Circle().fill(Theme.warmFill))
                        .frame(width: 44, height: 44, alignment: .trailing)
                        .contentShape(Rectangle())
                }
                .padding(.vertical, -7)
                .accessibilityLabel(L.t("Close", "Cerrar"))
                .accessibilityIdentifier("briefings-close")
            }
        }
        .frame(minHeight: 30)
    }
}

struct BriefingSectionLabel: View {
    let text: String
    var body: some View {
        Text(text.uppercased()).font(.mono(11, .medium)).tracking(1.6).foregroundStyle(Theme.warmDim)
            .padding(.top, 28).padding(.bottom, 8)
    }
}

struct BriefingNote: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.nucleoGlass))
            .padding(.top, 18)
    }
}

struct BriefingPillButton: View {
    let title: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 13, weight: .medium))
                .foregroundStyle(prominent ? Theme.bg : Theme.cream)
                .padding(.horizontal, 14).frame(minHeight: 34)
                .background(Capsule().fill(prominent ? Theme.cream : Theme.warmFill))
                .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: prominent ? 0 : 1))
        }
        .buttonStyle(.plain)
    }
}

/// A switch row: label, what it does, an optional schedule line; a spinner replaces nothing (the switch
/// keeps showing the pending target) but sits next to it while the server has not answered.
struct BriefingToggleRow: View {
    let label: String
    let detail: String
    let footnote: String?
    let isOn: Bool
    let saving: Bool
    let enabled: Bool
    let onChange: (Bool) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(label).font(.system(size: 15)).foregroundStyle(Theme.cream)
                Text(detail).font(.system(size: 12)).foregroundStyle(Theme.warmDim).fixedSize(horizontal: false, vertical: true)
                if let footnote {
                    Text(footnote).font(.mono(10.5)).tracking(0.3).foregroundStyle(Theme.warmMuted)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 2)
                }
            }
            Spacer(minLength: 8)
            if saving { ProgressView().controlSize(.small).tint(Theme.warmMuted).padding(.top, 6) }
            Toggle("", isOn: Binding(get: { isOn }, set: { new in if enabled, new != isOn { onChange(new) } }))
                .labelsHidden()
                .tint(Theme.orbViolet)
                .disabled(!enabled)
        }
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .padding(.vertical, 10)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityValue(saving ? L.t("Saving", "Guardando") : (isOn ? L.t("On", "Activado") : L.t("Off", "Desactivado")))
    }
}

struct BriefingLinkRow: View {
    let symbol: String
    let label: String
    let detail: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.warmMuted)
                    .frame(width: 32, height: 32).background(Theme.warmFill)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.system(size: 15)).foregroundStyle(Theme.cream)
                    if let detail {
                        Text(detail).font(.system(size: 12)).foregroundStyle(Theme.warmDim).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmDim)
            }
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .padding(.vertical, 8)
            .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A small capsule label (quality, freshness).
struct BriefingBadge: View {
    let text: String
    var tint: Color = Theme.warmMuted

    var body: some View {
        Text(text.uppercased()).font(.mono(9.5, .medium)).tracking(0.9).foregroundStyle(tint)
            .padding(.horizontal, 7).frame(height: 18)
            .background(Capsule().fill(tint.opacity(0.12)))
    }
}
