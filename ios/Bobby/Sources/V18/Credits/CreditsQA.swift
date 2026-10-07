// Credits: DEBUG review fixtures (`-qa-v18 <name>`). Every state of the Credits screen from fixed
// sample values: no account, no network, no store. Dates are set from the launch moment so the
// "Resets on Friday" and "renews" lines read as they would that day.
#if DEBUG
import SwiftUI

@MainActor
enum CreditsQA {
    static var fixtures: [String: () -> AnyView] {
        [
            "credits-guest": { screen(guest) },
            "credits-free": { screen(free) },
            "credits-zero": { screen(zero) },
            "credits-pro": { screen(paidPro) },
            "credits-pro-card": { screen(cardPro) },
            "credits-gifted-pro": { screen(giftedPro) },
            "credits-risk": { screen(guest, riskAccepted: false) },
            "credits-loading": { screen(CreditsSnapshot(access: nil), loading: true) },
            "credits-unavailable": { screen(CreditsSnapshot(access: nil, signedIn: true), loadFailed: true) },
            "credits-restore-running": { screen(free, restore: .running) },
            "credits-restore-restored": { screen(paidPro, restore: .done(.subscribed)) },
            "credits-restore-nothing": { screen(free, restore: .done(.nothingToRestore)) },
            "credits-restore-gifted": { screen(giftedPro, restore: .done(.nothingToRestore)) },
            "credits-restore-card": { screen(cardPro, restore: .done(.nothingToRestore)) },
            "credits-restore-signin": { screen(guest, restore: .signedOut) },
            "credits-restore-pending": { screen(free, restore: .done(.pending)) },
            "credits-restore-failed": { screen(free, restore: .done(.failed(BobbyStore.Copy.unreachable))) },
            "credits-restore-risk": { screen(guest, riskAccepted: false, restore: .needsRiskNotice) },
        ]
    }

    private static func screen(_ snapshot: CreditsSnapshot, riskAccepted: Bool = true, loading: Bool = false,
                               loadFailed: Bool = false, restore: CreditsRestoreState = .idle) -> AnyView {
        AnyView(CreditsScreen(riskAccepted: riskAccepted, snapshot: snapshot, loading: loading, loadFailed: loadFailed, restore: restore))
    }

    // MARK: Sample accounts

    private static func iso(daysFromNow days: Double) -> String {
        ISO8601DateFormatter().string(from: Date().addingTimeInterval(days * 86_400))
    }

    private static func meter(used: Int, limit: Int, bonus: Int = 0, windowDays: Int, resetsInDays: Double? = nil) -> NucleoLevelMeter? {
        var json: [String: Any] = ["used": used, "limit": limit, "remaining": max(0, limit - used), "bonus": bonus, "windowDays": windowDays]
        if let resetsInDays { json["resetsAt"] = iso(daysFromNow: resetsInDays) }
        return NucleoLevelMeter(json: json)
    }

    private static func meters(_ deep: NucleoLevelMeter?, _ max: NucleoLevelMeter?) -> [NucleoAnalysisLevel: NucleoLevelMeter] {
        var out: [NucleoAnalysisLevel: NucleoLevelMeter] = [:]
        if let deep { out[.profundo] = deep }
        if let max { out[.maximo] = max }
        return out
    }

    private static func referral(accepted: Int = 0, proUntilDays: Double? = nil, source: String? = nil) -> NucleoReferral? {
        var json: [String: Any] = ["code": "SAMPLE18", "url": "https://bobbyprotocol.xyz/desk?ref=SAMPLE18&v=2",
                                   "accepted": accepted, "max": 5, "rewardDays": 30]
        if let proUntilDays { json["proUntil"] = iso(daysFromNow: proUntilDays) }
        if let source { json["proSource"] = source }
        return NucleoReferral(json: json)
    }

    /// Nobody signed in: two of the three trial reads left.
    static var guest: CreditsSnapshot {
        CreditsSnapshot(access: BobbyReadAccess(tier: "anon", used: 1, limit: 3, remaining: 2, resetsAt: nil, paywall: true),
                        meters: meters(meter(used: 0, limit: 1, windowDays: 30), meter(used: 0, limit: 0, windowDays: 30)),
                        proPurchasable: true, signedIn: false, freeReadsPerWeek: 10, rewardDays: 30, maxFriends: 5)
    }

    /// A free account mid-week, with gifted reads on two levels.
    static var free: CreditsSnapshot {
        CreditsSnapshot(access: BobbyReadAccess(tier: "free", used: 3, limit: 10, remaining: 7, resetsAt: iso(daysFromNow: 3), paywall: true, bonus: 3),
                        meters: meters(meter(used: 1, limit: 3, bonus: 2, windowDays: 7, resetsInDays: 4), meter(used: 0, limit: 1, windowDays: 7)),
                        referral: referral(accepted: 1), proPurchasable: true, signedIn: true, freeReadsPerWeek: 10, rewardDays: 30, maxFriends: 5)
    }

    /// A free account with nothing left this week and no gifts.
    static var zero: CreditsSnapshot {
        CreditsSnapshot(access: BobbyReadAccess(tier: "free", used: 10, limit: 10, remaining: 0, resetsAt: iso(daysFromNow: 2), paywall: true),
                        meters: meters(meter(used: 3, limit: 3, windowDays: 7, resetsInDays: 2), meter(used: 1, limit: 1, windowDays: 7, resetsInDays: 5)),
                        referral: referral(), proPurchasable: true, signedIn: true, freeReadsPerWeek: 10, rewardDays: 30, maxFriends: 5)
    }

    private static var proAccess: BobbyReadAccess {
        BobbyReadAccess(tier: "pro", used: 42, limit: nil, remaining: nil, resetsAt: nil, paywall: true, bonus: 5)
    }

    private static var proMeters: [NucleoAnalysisLevel: NucleoLevelMeter] {
        meters(meter(used: 12, limit: 60, windowDays: 30, resetsInDays: 18), meter(used: 2, limit: 10, bonus: 1, windowDays: 30, resetsInDays: 21))
    }

    /// Bobby Pro paid through the App Store.
    static var paidPro: CreditsSnapshot {
        CreditsSnapshot(access: proAccess, meters: proMeters, referral: referral(accepted: 2),
                        subscription: BobbySubscription(provider: "apple", status: "active", currentPeriodEnd: iso(daysFromNow: 20)),
                        proPurchasable: true, signedIn: true, freeReadsPerWeek: 10, rewardDays: 30, maxFriends: 5)
    }

    /// Bobby Pro paid by card on the web.
    static var cardPro: CreditsSnapshot {
        CreditsSnapshot(access: proAccess, meters: proMeters, referral: referral(),
                        subscription: BobbySubscription(provider: "stripe", status: "active", currentPeriodEnd: iso(daysFromNow: 12)),
                        proPurchasable: true, signedIn: true, freeReadsPerWeek: 10, rewardDays: 30, maxFriends: 5)
    }

    /// Bobby Pro from invitations: no subscription anywhere.
    static var giftedPro: CreditsSnapshot {
        CreditsSnapshot(access: BobbyReadAccess(tier: "pro", used: 9, limit: nil, remaining: nil, resetsAt: nil, paywall: true),
                        meters: meters(meter(used: 4, limit: 60, windowDays: 30, resetsInDays: 25), meter(used: 0, limit: 10, windowDays: 30)),
                        referral: referral(accepted: 2, proUntilDays: 36, source: "referral"),
                        proPurchasable: true, signedIn: true, freeReadsPerWeek: 10, rewardDays: 30, maxFriends: 5)
    }
}
#endif
