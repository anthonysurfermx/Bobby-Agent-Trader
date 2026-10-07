// Invitations: DEBUG review fixtures (`-qa-v18 <name>`). The invite sheet with a sample referral,
// with a waiting invitation, and with each result line. Fixed sample values: no account, nothing
// stored outside a scratch suite, and no request leaves the process (the sender only fails).
#if DEBUG
import SwiftUI

@MainActor
enum InviteQA {
    static var fixtures: [String: () -> AnyView] {
        var all: [String: () -> AnyView] = [
            "invite-sheet": { AnyView(InviteQASheet(signedIn: true)) },
            "invite-sheet-plain": { AnyView(InviteQASheet(signedIn: true, proPurchasable: false)) },
            "invite-signed-out": { AnyView(InviteQASheet(signedIn: false, referral: false)) },
            "invite-pending": { AnyView(InviteQASheet(signedIn: false, referral: false, pendingCode: friendCode)) },
            "invite-result-saved": { AnyView(InviteQASheet(signedIn: true, pendingCode: friendCode, notice: .savedForLater)) },
        ]
        for (name, notice) in results {
            all["invite-result-\(name)"] = { AnyView(InviteQASheet(signedIn: true, notice: notice)) }
        }
        return all
    }

    /// One fixture per final answer of `referral-claim`.
    static let results: [(name: String, notice: InviteNotice)] = [
        ("accepted", .accepted), ("own", .ownInvitation), ("not-new", .notNew), ("already", .alreadyClaimed),
        ("full", .inviterFull), ("invalid", .invalid), ("not-applied", .notApplied),
    ]

    static let ownCode = "K7QM2XWP"
    static let friendCode = "H4TNRD9B"
    static let suite = "v18.invite.qa"

    /// What GET /api/bobby-access answers for a free account with two of five friends joined.
    static func sampleAccess(referral: Bool) -> [String: Any] {
        var body: [String: Any] = [
            "levels": ["tier": referral ? "free" : "anon", "levels": [String: Any]()],
            "plans": ["referral": ["maxFriends": 5, "rewardDays": 30]],
        ]
        if referral {
            body["referral"] = ["code": ownCode, "url": "https://bobbyprotocol.xyz/i/\(ownCode)", "accepted": 2, "max": 5,
                                "rewardDays": 30, "proUntil": NSNull(), "proSource": NSNull()]
        }
        return body
    }

    static func levels(referral: Bool) -> NucleoLevelCenter {
        let center = NucleoLevelCenter(defaults: scratch())
        let body = sampleAccess(referral: referral)
        center.auth = .none
        center.load = { _ in body }
        center.apply(body)
        return center
    }

    static func invites(signedIn: Bool, pendingCode: String?, notice: InviteNotice?) -> InviteLinkCenter {
        let generation = UUID()
        let center = InviteLinkCenter(defaults: scratch(), riskAccepted: { true }, auth: .none,
                                      currentUser: { signedIn ? "qa-account" : nil }, currentGeneration: { generation },
                                      observe: false,
                                      send: { _, _, _, _, _ in throw URLError(.notConnectedToInternet) },
                                      afterClaim: {})
        center.showForReview(pendingCode: pendingCode, notice: notice)
        return center
    }

    private static func scratch() -> UserDefaults {
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

private struct InviteQASheet: View {
    let proPurchasable: Bool
    @StateObject private var levels: NucleoLevelCenter
    @StateObject private var invites: InviteLinkCenter

    init(signedIn: Bool, referral: Bool = true, proPurchasable: Bool = true, pendingCode: String? = nil, notice: InviteNotice? = nil) {
        self.proPurchasable = proPurchasable
        _levels = StateObject(wrappedValue: InviteQA.levels(referral: referral))
        _invites = StateObject(wrappedValue: InviteQA.invites(signedIn: signedIn, pendingCode: pendingCode, notice: notice))
    }

    var body: some View {
        NucleoInviteSheet(center: levels, proPurchasable: proPurchasable, reason: nil, onPro: nil, onClose: {}, invites: invites)
    }
}
#endif
