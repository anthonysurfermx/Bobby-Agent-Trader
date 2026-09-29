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
        case .rapido: return "#E8DFD0"
        case .profundo: return "#5CE1FF"
        case .maximo: return "#9A5CFF"
        }
    }

    var color: Color {
        switch self {
        case .rapido: return Color(red: 0xE8 / 255, green: 0xDF / 255, blue: 0xD0 / 255)
        case .profundo: return Color(red: 0x5C / 255, green: 0xE1 / 255, blue: 0xFF / 255)
        case .maximo: return Color(red: 0x9A / 255, green: 0x5C / 255, blue: 0xFF / 255)
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

    /// The pill in the page: "⚡ Rápido" / "Profundo" / "Máximo".
    var pillLabel: String { self == .rapido ? "⚡ " + name : name }

    var pageJSON: [String: Any] { ["id": rawValue, "label": pillLabel, "color": hex] }
}

/// `{used, limit, remaining, windowDays, resetsAt}` for one premium level.
struct NucleoLevelMeter: Equatable, Sendable {
    let used: Int
    let limit: Int?
    let remaining: Int?
    let windowDays: Int?
    let resetsAt: String?

    init?(json: Any?) {
        guard let o = json as? [String: Any] else { return nil }
        used = BobbyReadAccess.count(o["used"]) ?? 0
        limit = BobbyReadAccess.count(o["limit"])
        remaining = BobbyReadAccess.count(o["remaining"])
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

    init?(json: Any?) {
        guard let o = json as? [String: Any], let code = o["code"] as? String, let url = o["url"] as? String,
              !code.isEmpty, URL(string: url) != nil else { return nil }
        self.code = code
        self.url = url
        accepted = BobbyReadAccess.count(o["accepted"]) ?? 0
        max = BobbyReadAccess.count(o["max"]) ?? 5
        rewardDays = BobbyReadAccess.count(o["rewardDays"])
        proUntil = o["proUntil"] as? String
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
    @Published private(set) var referral: NucleoReferral?
    @Published private(set) var rewardDays: Int?
    @Published private(set) var maxFriends: Int = 5
    /// plans.limits[tier][level] = [limit, windowDays]
    @Published private(set) var planLimits: [String: [String: [Int]]] = [:]
    @Published private(set) var loaded = false

    var auth: BobbyMeterAuth = .account
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        level = defaults.string(forKey: Self.defaultsKey).flatMap(NucleoAnalysisLevel.init(rawValue:)) ?? .rapido
    }

    /// GET /api/bobby-access (levels, referral, plans). False when it could not be read.
    @discardableResult
    func refresh() async -> Bool {
        guard let reply = try? await BobbyAccessAPI.send(BobbyAccessAPI.accessPath, method: "GET", auth: auth),
              (200..<300).contains(reply.status), let body = reply.json as? [String: Any] else { return false }
        apply(body)
        return true
    }

    func apply(_ body: [String: Any]) {
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

    func meterUpdated(_ level: NucleoAnalysisLevel, _ meter: NucleoLevelMeter?) {
        guard let meter else { return }
        meters[level] = meter
    }

    /// "2/3 · semana", "Con tu cuenta gratis", "Sin límite" (nil = nothing to say yet).
    func allowance(_ level: NucleoAnalysisLevel) -> String? {
        guard level.isPremium else { return L.t("Unlimited", "Sin límite") }
        if tier == "pro" { return L.t("Unlimited", "Sin límite") }
        guard let m = meters[level] else {
            return tier == "anon" && limit(tier: "anon", level) == 0 ? L.t("With your free account", "Con tu cuenta gratis") : nil
        }
        guard let limit = m.limit else { return L.t("Unlimited", "Sin límite") }
        if limit == 0 { return L.t("With your free account", "Con tu cuenta gratis") }
        let left = m.remaining ?? max(0, limit - m.used)
        return "\(left)/\(limit) · " + window(m.windowDays)
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
    @State private var slider: Double = 0

    var body: some View {
        let level = NucleoAnalysisLevel.allCases[Int(slider.rounded()).clamped(0, 2)]
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(L.t("ANALYSIS LEVEL", "NIVEL DE ANÁLISIS"))
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(Color.white.opacity(0.45))
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.white.opacity(0.5))
                        .frame(width: 30, height: 30).background(Circle().fill(Color.white.opacity(0.06)))
                }
                .accessibilityLabel(L.t("Close", "Cerrar"))
            }
            HStack(alignment: .firstTextBaseline) {
                Text(level.pillLabel)
                    .font(.system(size: 30, weight: .light))
                    .foregroundStyle(level.color)
                    .contentTransition(.opacity)
                Spacer()
                if let allowance = center.allowance(level) {
                    Text(allowance)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.white.opacity(0.6))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Capsule().fill(Color.white.opacity(0.06)))
                }
            }
            Text(level.line)
                .font(.system(size: 15))
                .foregroundStyle(Color.white.opacity(0.72))
            Slider(value: $slider, in: 0...2, step: 1)
                .tint(level.color)
                .accessibilityLabel(L.t("Analysis level", "Nivel de análisis"))
                .accessibilityValue(level.name)
            HStack {
                ForEach(NucleoAnalysisLevel.allCases) { l in
                    Text(l.name)
                        .font(.system(size: 11, weight: l == level ? .semibold : .regular, design: .monospaced))
                        .foregroundStyle(l == level ? l.color : Color.white.opacity(0.35))
                    if l != .maximo { Spacer() }
                }
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 18)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .onAppear { slider = Double(center.level.index) }
        .onChange(of: slider) { _, v in
            let picked = NucleoAnalysisLevel.allCases[Int(v.rounded()).clamped(0, 2)]
            if picked != center.level {
                UISelectionFeedbackGenerator().selectionChanged()
                center.level = picked
            }
        }
        .task { await center.refresh() }
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
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(L.t("INVITE A FRIEND", "INVITA A UN AMIGO"))
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(Color.white.opacity(0.45))
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.white.opacity(0.5))
                        .frame(width: 30, height: 30).background(Circle().fill(Color.white.opacity(0.06)))
                }
                .accessibilityLabel(L.t("Close", "Cerrar"))
            }
            if let reason {
                Text(reason).font(.system(size: 14)).foregroundStyle(Color.white.opacity(0.6))
            }
            Text(L.t("Invite a friend", "Invita a un amigo"))
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(Color.white)
            Text(L.t("Every friend who creates an account with your link gives you \(days) days of Bobby Pro.",
                     "Cada amigo que crea su cuenta con tu link te da \(days) días de Bobby Pro."))
                .font(.system(size: 15))
                .foregroundStyle(Color.white.opacity(0.72))
                .fixedSize(horizontal: false, vertical: true)
            slots
            if let referral = center.referral, let url = URL(string: referral.url) {
                HStack(spacing: 10) {
                    ShareLink(item: url, message: Text(L.t("Bobby: three AI agents debate any stock or crypto before you decide.",
                                                           "Bobby: tres agentes de IA debaten cualquier acción o cripto antes de que decidas."))) {
                        Label(L.t("Share link", "Compartir link"), systemImage: "square.and.arrow.up")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .foregroundStyle(Color.black)
                            .background(Capsule().fill(Color(red: 0.95, green: 0.93, blue: 0.89)))
                    }
                    Button {
                        UIPasteboard.general.string = referral.url
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        copied = true
                    } label: {
                        Text(copied ? L.t("Copied", "Copiado") : L.t("Copy", "Copiar"))
                            .font(.system(size: 15, weight: .medium))
                            .frame(minWidth: 88, minHeight: 48)
                            .foregroundStyle(Color.white)
                            .background(Capsule().stroke(Color.white.opacity(0.18)))
                    }
                }
                Text(referral.url.replacingOccurrences(of: "https://", with: ""))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Color.white.opacity(0.35))
                    .lineLimit(1).truncationMode(.middle)
            } else if AccountSession.shared.isSignedIn {
                Text(center.loaded ? L.t("Your invite link isn’t ready yet.", "Tu link de invitación aún no está listo.")
                                   : L.t("Loading your link…", "Cargando tu link…"))
                    .font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.45))
            } else {
                Text(L.t("Sign in to get your invite link.", "Entra con tu cuenta para tener tu link."))
                    .font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.45))
            }
            Divider().overlay(Color.white.opacity(0.08))
            if proPurchasable, let onPro {
                Button(action: onPro) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Bobby Pro").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.white)
                            Text(L.t("More Deep and Max every month", "Más Profundo y Máximo cada mes"))
                                .font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.55))
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Color.white.opacity(0.4))
                    }
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.04)))
                }
            } else {
                Text(L.t("Bobby Pro is coming soon", "Bobby Pro llega pronto"))
                    .font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.35))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22)
        .padding(.top, 18)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .task { await center.refresh() }
    }

    private var slots: some View {
        let total = center.referral?.max ?? center.maxFriends
        let filled = min(center.referral?.accepted ?? 0, total)
        return HStack(spacing: 10) {
            ForEach(0..<max(1, total), id: \.self) { i in
                ZStack {
                    Circle().stroke(Color.white.opacity(i < filled ? 0 : 0.16), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    if i < filled {
                        Circle().fill(NucleoAnalysisLevel.profundo.color.opacity(0.18))
                        Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(NucleoAnalysisLevel.profundo.color)
                    } else {
                        Image(systemName: "plus").font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.35))
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
