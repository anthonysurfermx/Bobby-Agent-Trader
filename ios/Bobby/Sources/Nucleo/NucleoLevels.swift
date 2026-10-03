// Analysis levels (Rápido / Profundo / Máximo) and invite-a-friend, mirroring the web desk
// (src/components/nucleo/LevelControl.tsx, InvitePanel.tsx). The SERVER meters every level;
// the app only says which level the user picked and shows the server's allowance.
//   POST /api/desk-debate {…, level}        403 signin_required | upgrade_required | level_exhausted
//                                            503 budget_paused (premium paused today; Rápido still works)
//   GET  /api/bobby-access                  levels {tier, levels{profundo, maximo}}, referral, plans
//   (POST /api/bobby-access {action:"referral-claim"} is not called: the app opens no invite links yet)
import SwiftUI
import UIKit

enum NucleoAnalysisLevel: String, CaseIterable, Identifiable, Sendable {
    case rapido, profundo, maximo

    var id: String { rawValue }

    var name: String {
        switch self {
        case .rapido: return L.t("Quick", "Rápido")
        case .profundo: return L.t("Deep", "Profundo")
        case .maximo: return L.t("Max", "Máximo")
        }
    }

    /// One line under the name.
    var line: String {
        switch self {
        case .rapido: return L.t("3 agents · 10 s", "3 agentes · 10 s")
        case .profundo: return L.t("More data · 15 s", "Más datos · 15 s")
        case .maximo: return L.t("Two rounds · 40 s", "Dos rondas · 40 s")
        }
    }

    var hex: String {
        switch self {
        case .rapido: return "#F2EDE4"
        case .profundo: return "#7886FA"
        case .maximo: return "#A795EF"
        }
    }

    var color: Color {
        switch self {
        case .rapido: return Theme.cream
        case .profundo: return Theme.orbBlue
        case .maximo: return Theme.orbViolet
        }
    }

    /// The desk request's timeout: a premium debate runs longer on the server.
    var timeout: TimeInterval {
        switch self {
        case .rapido: return 100
        case .profundo: return 130
        case .maximo: return 175
        }
    }

    var isPremium: Bool { self != .rapido }

    /// The level a refusal falls back to.
    var lower: NucleoAnalysisLevel {
        switch self {
        case .maximo: return .profundo
        default: return .rapido
        }
    }

    var index: Int { Self.allCases.firstIndex(of: self) ?? 0 }

    /// The same quiet label is used in the page and the native selector.
    var pillLabel: String { name }

    var pageJSON: [String: Any] { ["id": rawValue, "label": pillLabel, "color": hex] }
}

/// `{used, limit, remaining, windowDays, resetsAt}` for one premium level.
struct NucleoLevelMeter: Equatable, Sendable {
    let used: Int
    let limit: Int?
    let remaining: Int?
    let bonus: Int
    let windowDays: Int?
    let resetsAt: String?

    init?(json: Any?) {
        guard let o = json as? [String: Any] else { return nil }
        used = BobbyReadAccess.count(o["used"]) ?? 0
        limit = BobbyReadAccess.count(o["limit"])
        remaining = BobbyReadAccess.count(o["remaining"])
        bonus = BobbyReadAccess.count(o["bonus"]) ?? 0
        windowDays = BobbyReadAccess.count(o["windowDays"])
        resetsAt = (o["resetsAt"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    var resetsDate: Date? { resetsAt.flatMap(BobbyAccessAPI.date) }
}

struct NucleoReferral: Equatable, Sendable {
    let code: String
    let url: String
    let accepted: Int
    let max: Int
    let rewardDays: Int?
    let proUntil: String?
    let proSource: String?

    init?(json: Any?) {
        guard let o = json as? [String: Any], let code = o["code"] as? String, let url = o["url"] as? String,
              !code.isEmpty, URL(string: url) != nil else { return nil }
        self.code = code
        self.url = url
        accepted = BobbyReadAccess.count(o["accepted"]) ?? 0
        max = BobbyReadAccess.count(o["max"]) ?? 5
        rewardDays = BobbyReadAccess.count(o["rewardDays"])
        proUntil = o["proUntil"] as? String
        proSource = o["proSource"] as? String
    }
}

/// The level the user picked (persisted) and the server's word on what each level has left.
@MainActor
final class NucleoLevelCenter: ObservableObject {
    static let shared = NucleoLevelCenter()
    static let defaultsKey = "nucleo.analysisLevel"

    @Published var level: NucleoAnalysisLevel {
        didSet { if level != oldValue { defaults.set(level.rawValue, forKey: Self.defaultsKey) } }
    }
    /// "anon" | "free" | "pro" (nil = unknown: a server that predates levels).
    @Published private(set) var tier: String?
    @Published private(set) var meters: [NucleoAnalysisLevel: NucleoLevelMeter] = [:]
    @Published private(set) var quickAccess: BobbyReadAccess?
    @Published private(set) var referral: NucleoReferral?
    @Published private(set) var rewardDays: Int?
    @Published private(set) var maxFriends: Int = 5
    /// plans.limits[tier][level] = [limit, windowDays]
    @Published private(set) var planLimits: [String: [String: [Int]]] = [:]
    @Published private(set) var loaded = false

    var auth: BobbyMeterAuth = .account
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    var currentGeneration: () -> UUID = { AccountSession.shared.generation }
    /// The response loader is injectable so account changes can be tested during a suspended request.
    var load: (BobbyMeterAuth) async throws -> [String: Any]? = { auth in
        let reply = try await BobbyAccessAPI.send(BobbyAccessAPI.accessPath, method: "GET", auth: auth)
        guard (200..<300).contains(reply.status) else { return nil }
        return reply.json as? [String: Any]
    }
    private let defaults: UserDefaults
    private var owner: String?
    private var ownerGeneration: UUID?
    private var requestGeneration = UUID()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        level = defaults.string(forKey: Self.defaultsKey).flatMap(NucleoAnalysisLevel.init(rawValue:)) ?? .rapido
        owner = currentUser()
        ownerGeneration = currentGeneration()
    }

    /// Clear allowances and private invite details immediately, including when the new account is offline.
    func accountChanged(force: Bool = false) {
        guard force || owner != currentUser() || ownerGeneration != currentGeneration() else { return }
        owner = currentUser()
        ownerGeneration = currentGeneration()
        requestGeneration = UUID()
        tier = nil
        meters = [:]
        quickAccess = nil
        referral = nil
        rewardDays = nil
        maxFriends = 5
        planLimits = [:]
        loaded = false
    }

    /// GET /api/bobby-access (levels, referral, plans). False when it could not be read.
    @discardableResult
    func refresh() async -> Bool {
        accountChanged()
        defer { accountChanged() }
        let revision = UUID()
        requestGeneration = revision
        let authOwner = await auth.owner()
        guard revision == requestGeneration else { return false }
        guard let body = try? await load(auth) else { return false }
        let endingAuthOwner = await auth.owner()
        guard !Task.isCancelled, revision == requestGeneration,
              owner == currentUser(), ownerGeneration == currentGeneration(),
              authOwner == endingAuthOwner else { return false }
        apply(body)
        return true
    }

    func apply(_ body: [String: Any]) {
        accountChanged()
        quickAccess = BobbyReadAccess(json: body["access"])
        tier = nil
        meters = [:]
        planLimits = [:]
        rewardDays = nil
        maxFriends = 5
        if let levels = body["levels"] as? [String: Any] {
            tier = levels["tier"] as? String
            var m: [NucleoAnalysisLevel: NucleoLevelMeter] = [:]
            if let per = levels["levels"] as? [String: Any] {
                for l in NucleoAnalysisLevel.allCases where l.isPremium {
                    if let meter = NucleoLevelMeter(json: per[l.rawValue]) { m[l] = meter }
                }
            }
            meters = m
        }
        referral = NucleoReferral(json: body["referral"])
        if let plans = body["plans"] as? [String: Any] {
            if let limits = plans["limits"] as? [String: Any] {
                var out: [String: [String: [Int]]] = [:]
                for (tier, v) in limits {
                    guard let per = v as? [String: Any] else { continue }
                    var row: [String: [Int]] = [:]
                    for (lvl, pair) in per { row[lvl] = (pair as? [Any])?.compactMap { BobbyReadAccess.count($0) } }
                    out[tier] = row
                }
                planLimits = out
            }
            if let r = plans["referral"] as? [String: Any] {
                rewardDays = BobbyReadAccess.count(r["rewardDays"]) ?? rewardDays
                maxFriends = BobbyReadAccess.count(r["maxFriends"]) ?? maxFriends
            }
        }
        if let r = referral?.rewardDays { rewardDays = r }
        loaded = true
    }

    /// The coupon response is partial: keep referral, plans and billing details intact.
    /// Invalidate a GET that started before this authoritative gift snapshot.
    @discardableResult
    func applyCouponSnapshot(_ body: [String: Any], userID: String, generation: UUID) -> Bool {
        accountChanged()
        guard currentUser() == userID, currentGeneration() == generation else { return false }
        requestGeneration = UUID()
        var recorded = false
        if let access = BobbyReadAccess(json: body["access"]), ["free", "pro"].contains(access.tier) {
            quickAccess = access
            recorded = true
        }
        if let levels = body["levels"] as? [String: Any], let incomingTier = levels["tier"] as? String,
           ["free", "pro"].contains(incomingTier), let per = levels["levels"] as? [String: Any] {
            tier = incomingTier
            for level in NucleoAnalysisLevel.allCases where level.isPremium {
                if let meter = NucleoLevelMeter(json: per[level.rawValue]) { meters[level] = meter }
            }
            recorded = true
        }
        if recorded { loaded = true }
        return recorded
    }

    func meterUpdated(_ level: NucleoAnalysisLevel, _ meter: NucleoLevelMeter?) {
        guard let meter else { return }
        meters[level] = meter
    }

    /// Display the server's allowance, including the general read meter used by Quick.
    func allowance(_ level: NucleoAnalysisLevel) -> String? {
        if level == .rapido {
            guard let access = quickAccess, let limit = access.limit else {
                return L.t("Available", "Disponible")
            }
            let left = access.remaining ?? max(0, limit - access.used)
            let gift = access.bonus > 0 ? " + " + BobbyReadAccess.giftLabel(access.bonus) : ""
            if access.resetsAt != nil {
                return "\(left)/\(limit) · " + window(7) + gift
            }
            return L.t("\(left)/\(limit) left", "Quedan \(left)/\(limit)") + gift
        }
        guard let m = meters[level] else {
            return tier == "anon" && limit(tier: "anon", level) == 0
                ? L.t("With your free account", "Con tu cuenta gratis")
                : L.t("Available", "Disponible")
        }
        guard let limit = m.limit else { return L.t("Available", "Disponible") }
        if limit == 0 {
            return m.bonus > 0 ? BobbyReadAccess.giftLabel(m.bonus) : L.t("With your free account", "Con tu cuenta gratis")
        }
        let gift = m.bonus > 0 ? " + " + BobbyReadAccess.giftLabel(m.bonus) : ""
        let left = m.remaining ?? max(0, limit - m.used)
        return "\(left)/\(limit) · " + window(m.windowDays) + gift
    }

    private func limit(tier: String, _ level: NucleoAnalysisLevel) -> Int? { planLimits[tier]?[level.rawValue]?.first }

    private func window(_ days: Int?) -> String {
        switch days {
        case 7: return L.t("week", "semana")
        case 30: return L.t("month", "mes")
        case let d?: return L.t("\(d) days", "\(d) días")
        default: return L.t("week", "semana")
        }
    }

}

// MARK: - Level sheet

struct NucleoLevelSheet: View {
    @ObservedObject var center: NucleoLevelCenter
    let onClose: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var position: Double = 0

    private var selected: NucleoAnalysisLevel {
        NucleoAnalysisLevel.allCases[Int(position.rounded()).clamped(0, 2)]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text(L.t("ANALYSIS LEVEL", "NIVEL DE ANÁLISIS"))
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(Theme.warmDim)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.warmMuted)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Theme.nucleoGlass))
                        .overlay(Circle().stroke(Theme.nucleoStroke, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L.t("Close", "Cerrar"))
            }
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(selected.name)
                        .font(.system(size: 30, weight: .light))
                        .foregroundStyle(Theme.cream)
                        .contentTransition(.opacity)
                    Text(selected.line)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.warmMuted)
                }
                Spacer(minLength: 0)
                if let allowance = center.allowance(selected) {
                    Text(allowance)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.warmMuted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Theme.nucleoGlass))
                        .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: 1))
                }
            }
            effortControl
        }
        .padding(.horizontal, 22)
        .padding(.top, 12)
        .padding(.bottom, 22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background {
            Theme.nucleoSurface.ignoresSafeArea()
            RadialGradient(colors: [Theme.orbViolet.opacity(0.08), .clear],
                           center: .topLeading, startRadius: 0, endRadius: 320)
                .ignoresSafeArea()
        }
        .preferredColorScheme(.dark)
        .onAppear { position = Double(center.level.index) }
        .onChange(of: position) { _, _ in
            if selected != center.level {
                UISelectionFeedbackGenerator().selectionChanged()
                center.level = selected
            }
        }
        .task { await center.refresh() }
    }

    private var effortControl: some View {
        GeometryReader { geometry in
            let inset: CGFloat = 5
            let width = max(1, (geometry.size.width - inset * 2) / 3)
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Theme.nucleoGlass)
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(Theme.nucleoStroke, lineWidth: 1))
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(LinearGradient(colors: [Theme.orbViolet.opacity(0.23), Theme.orbBlue.opacity(0.18)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(LinearGradient(colors: [Theme.orbViolet.opacity(0.52), Theme.orbBlue.opacity(0.22)],
                                               startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1))
                    .shadow(color: Theme.orbViolet.opacity(0.12), radius: 12, y: 3)
                    .frame(width: width, height: 52)
                    .offset(x: inset + width * CGFloat(position))
                    .accessibilityHidden(true)
                HStack(spacing: 0) {
                    ForEach(NucleoAnalysisLevel.allCases) { level in
                        Button { select(level) } label: {
                            VStack(spacing: 6) {
                                Circle()
                                    .fill(level == selected ? Theme.orbCyan : Theme.warmDim.opacity(0.5))
                                    .frame(width: 3, height: 3)
                                Text(level.name)
                                    .font(.system(size: 14, weight: level == selected ? .medium : .regular))
                                    .foregroundStyle(level == selected ? Theme.cream : Theme.warmMuted)
                            }
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(level.name)
                        .accessibilityHint(level.line)
                        .accessibilityAddTraits(level == selected ? .isSelected : [])
                        .accessibilityIdentifier("nucleo.level.\(level.rawValue)")
                    }
                }
                .padding(.horizontal, inset)
            }
            .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .simultaneousGesture(DragGesture(minimumDistance: 8, coordinateSpace: .local)
                .onChanged { value in
                    position = min(2, max(0, Double((value.location.x - inset - width / 2) / width)))
                }
                .onEnded { _ in select(selected) })
            .accessibilityElement(children: .contain)
        }
        .frame(height: 62)
    }

    private func select(_ level: NucleoAnalysisLevel) {
        withAnimation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.86)) {
            position = Double(level.index)
        }
    }
}

// MARK: - Invite sheet

struct NucleoInviteSheet: View {
    @ObservedObject var center: NucleoLevelCenter
    /// True when the RevenueCat paywall can actually sell Bobby Pro in this build.
    let proPurchasable: Bool
    /// Why the sheet opened ("You used your Deep for this week."), nil from the profile.
    let reason: String?
    let onPro: (() -> Void)?
    let onClose: () -> Void
    @State private var copied = false

    private var days: Int { center.referral?.rewardDays ?? center.rewardDays ?? 30 }

    var body: some View {
        // Scrolls so the medium detent never clips the link on a small phone.
        ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(L.t("INVITE A FRIEND", "INVITA A UN AMIGO"))
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(Theme.warmDim)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmMuted)
                        .frame(width: 44, height: 44).background(Circle().fill(Theme.nucleoGlass))
                }
                .accessibilityLabel(L.t("Close", "Cerrar"))
            }
            if let reason {
                Text(reason).font(.system(size: 14)).foregroundStyle(Theme.warmMuted)
            }
            Text(L.t("Invite a friend", "Invita a un amigo"))
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(Theme.cream)
            if proPurchasable {
            Text(L.t("Every friend who creates an account with your link gives you \(days) days of Bobby Pro.",
                     "Cada amigo que crea su cuenta con tu link te da \(days) días de Bobby Pro."))
                .font(.system(size: 15))
                .foregroundStyle(Theme.warmMuted)
                .fixedSize(horizontal: false, vertical: true)
            slots
            } else {
                Text(L.t("Share Bobby with someone you know.", "Comparte Bobby con alguien que conoces."))
                    .font(.system(size: 15)).foregroundStyle(Theme.warmMuted)
            }
            if let referral = center.referral, let url = URL(string: referral.url) {
                HStack(spacing: 10) {
                    ShareLink(item: url, message: Text(L.t("Bobby: three AI agents debate any stock or crypto before you decide.",
                                                           "Bobby: tres agentes de IA debaten cualquier acción o cripto antes de que decidas."))) {
                        Label(L.t("Share link", "Compartir link"), systemImage: "square.and.arrow.up")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .foregroundStyle(Color.black)
                            .background(Capsule().fill(Theme.cream))
                    }
                    Button {
                        UIPasteboard.general.string = referral.url
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        copied = true
                    } label: {
                        Text(copied ? L.t("Copied", "Copiado") : L.t("Copy", "Copiar"))
                            .font(.system(size: 15, weight: .medium))
                            .frame(minWidth: 88, minHeight: 48)
                            .foregroundStyle(Theme.cream)
                            .background(Capsule().stroke(Theme.nucleoStroke))
                    }
                }
                Text(referral.url.replacingOccurrences(of: "https://", with: ""))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Theme.warmDim)
                    .lineLimit(1).truncationMode(.middle)
            } else if AccountSession.shared.isSignedIn {
                Text(center.loaded ? L.t("Your invite link isn’t ready yet.", "Tu link de invitación aún no está listo.")
                                   : L.t("Loading your link…", "Cargando tu link…"))
                    .font(.system(size: 13)).foregroundStyle(Theme.warmDim)
            } else {
                Text(L.t("Sign in to get your invite link.", "Entra con tu cuenta para tener tu link."))
                    .font(.system(size: 13)).foregroundStyle(Theme.warmDim)
            }
            if proPurchasable, let onPro {
                Divider().overlay(Theme.nucleoStroke)
                Button(action: onPro) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Bobby Pro").font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.cream)
                            Text(BobbyStore.Copy.benefits)
                                .font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Theme.warmDim)
                    }
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Theme.nucleoGlass))
                }
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 18)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize)
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .task { await center.refresh() }
    }

    private var slots: some View {
        let total = center.referral?.max ?? center.maxFriends
        let filled = min(center.referral?.accepted ?? 0, total)
        return HStack(spacing: 10) {
            ForEach(0..<max(1, total), id: \.self) { i in
                ZStack {
                    Circle().stroke(Theme.nucleoStroke.opacity(i < filled ? 0 : 1), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    if i < filled {
                        Circle().fill(Theme.orbViolet.opacity(0.16))
                        Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.orbViolet)
                    } else {
                        Image(systemName: "plus").font(.system(size: 13)).foregroundStyle(Theme.warmDim)
                    }
                }
                .frame(width: 44, height: 44)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L.t("\(filled) of \(total) friends", "\(filled) de \(total) amigos"))
    }
}

extension Int {
    func clamped(_ lo: Int, _ hi: Int) -> Int { Swift.min(Swift.max(self, lo), hi) }
}
