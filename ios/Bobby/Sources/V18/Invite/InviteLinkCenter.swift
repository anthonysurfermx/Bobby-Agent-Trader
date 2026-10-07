// Invitations (1.8): the invitation a friend sent waits on this phone until an account can accept it.
//   receive(url)        an invitation link opened the app: its code is kept (device-level, 30 days)
//   submit(code:)       the same, typed by hand in the invite sheet
//   claimIfPossible()   POST /api/bobby-access {action:"referral-claim", code}
//                       → {result, access, levels}; result is claimed | invalid_code | self |
//                         account_required | not_new | already_claimed | inviter_full | invalid_invitee
// Nothing is sent before the risk notice is accepted or without an account. A reply is applied only
// to the account that asked (the account generation is captured before the request). Only the friend
// who invited is rewarded by the server; nothing here promises the person accepting anything.
// A final answer is kept for the account that asked until the invite sheet has shown it (`answer`),
// so a link opened with an account still gets its answer in words (InviteNudges puts it on the glass).
import Combine
import Foundation
import UIKit

/// The invitation waiting on this phone.
struct InvitePending: Equatable, Sendable {
    let code: String
    /// When it arrived (a link) or was typed.
    let at: Date
}

/// A final answer nobody has read yet: which invitation, what the server said, and when.
struct InviteAnswer: Equatable, Sendable {
    let code: String
    let notice: InviteNotice
    let at: Date
}

/// What the person is told, once, in words.
enum InviteNotice: String, Equatable, Sendable {
    case accepted, ownInvitation, notNew, alreadyClaimed, inviterFull, invalid, notApplied
    /// The code is kept: an account is needed, or the server could not be reached.
    case signInNeeded, savedForLater
    /// The code is kept: nothing is sent before the risk notice is accepted.
    case consentNeeded

    /// The server's final answers (the only ones kept as an `InviteAnswer`).
    static let final: Set<InviteNotice> = [.accepted, .ownInvitation, .notNew, .alreadyClaimed, .inviterFull, .invalid, .notApplied]

    var text: String {
        switch self {
        case .accepted:
            return L.t("Invitation accepted. It counts for the friend who invited you.",
                       "Invitación aceptada. Cuenta para el amigo que te invitó.")
        case .ownInvitation:
            return L.t("That is your own invitation.", "Esa es tu propia invitación.")
        case .notNew:
            return L.t("Invitations work for new accounts, during their first week.",
                       "Las invitaciones funcionan para cuentas nuevas, durante su primera semana.")
        case .alreadyClaimed:
            return L.t("This account already accepted an invitation.", "Esta cuenta ya aceptó una invitación.")
        case .inviterFull:
            return L.t("Your friend already invited all the friends allowed.",
                       "Tu amigo ya invitó a todos los amigos permitidos.")
        case .invalid:
            return L.t("That invitation code is not valid.", "Ese código de invitación no es válido.")
        case .notApplied:
            return L.t("That invitation could not be applied.", "Esa invitación no se pudo aplicar.")
        case .signInNeeded:
            return L.t("Sign in to accept an invitation.", "Entra con tu cuenta para aceptar una invitación.")
        case .savedForLater:
            return L.t("Bobby could not check that code right now. It is saved and will be tried again.",
                       "Bobby no pudo revisar ese código ahora. Quedó guardado y se intentará de nuevo.")
        case .consentNeeded:
            // The same sentence the memory and briefing screens use.
            return L.t("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                       "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores.")
        }
    }
}

/// How one attempt ended.
enum InviteClaimStep: Equatable, Sendable {
    enum Kept: Equatable, Sendable { case account, unreachable }
    /// The server gave a final answer: the code is gone and the notice says why.
    case settled(InviteNotice)
    /// The code stays and is tried again later.
    case kept(Kept)
    /// The reply belonged to a previous account: ignored, the code stays.
    case dropped
}

@MainActor
final class InviteLinkCenter: ObservableObject {
    struct Reply {
        let json: Any?
        let status: Int
    }
    typealias Sender = @MainActor (String, String, [String: Any], BobbyMeterAuth, UUID) async throws -> Reply

    /// The unit-test host observes nothing: suites build their own centre.
    static let shared = InviteLinkCenter(observe: !BobbyApp.isUnitTestHost)
    /// Device-level, not per account: `{code, at}`.
    static let storeKey = "v18.invite.pending"
    static let lifetime: TimeInterval = 30 * 86_400
    /// Per account: `{code, result, at, user}`. Removed once read, when the account leaves, or after a week.
    static let answerKey = "v18.invite.answer"
    static let answerLifetime: TimeInterval = 7 * 86_400
    /// After an attempt that could not be settled, the next one waits this long.
    static let backOff: TimeInterval = 60
    static let timeout: TimeInterval = 20

    @Published private(set) var pending: InvitePending?
    @Published private(set) var notice: InviteNotice?
    /// The last final answer, until the invite sheet has shown it (`acknowledgeNotice`).
    @Published private(set) var answer: InviteAnswer?
    @Published private(set) var isClaiming = false

    var now: () -> Date
    /// Nothing reaches the network before the risk notice is accepted.
    var riskAccepted: () -> Bool
    private let defaults: UserDefaults
    private let auth: BobbyMeterAuth
    private let currentUser: @MainActor () -> String?
    private let currentGeneration: @MainActor () -> UUID
    private let send: Sender
    private let afterClaim: @MainActor () async -> Void
    private var owner: String?
    private var ownerGeneration: UUID
    private var retryNotBefore: Date?
    private var flight: Task<InviteClaimStep, Never>?
    private var lastTrigger: Task<Void, Never>?
    private var refreshTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init(defaults: UserDefaults = .standard,
         now: @escaping () -> Date = { Date() },
         riskAccepted: @escaping () -> Bool = {
             UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion && InviteLinkCenter.liveNetwork
         },
         auth: BobbyMeterAuth = .account,
         currentUser: @escaping @MainActor () -> String? = { AccountSession.shared.session?.userId },
         currentGeneration: @escaping @MainActor () -> UUID = { AccountSession.shared.generation },
         observe: Bool = true,
         send: @escaping Sender = { path, method, body, auth, generation in
             let reply = try await BobbyAccessAPI.send(path, method: method, body: body, auth: auth,
                                                       expectedOwner: generation, timeout: InviteLinkCenter.timeout)
             return Reply(json: reply.json, status: reply.status)
         },
         afterClaim: @escaping @MainActor () async -> Void = {
             await NucleoLevelCenter.shared.refresh()
             await BobbyAccessCenter.shared.refresh()
         }) {
        self.defaults = defaults
        self.now = now
        self.riskAccepted = riskAccepted
        self.auth = auth
        self.currentUser = currentUser
        self.currentGeneration = currentGeneration
        self.send = send
        self.afterClaim = afterClaim
        owner = currentUser()
        ownerGeneration = currentGeneration()
        pending = Self.read(defaults)
        purgeExpired()
        restoreAnswer()
        guard observe else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.accountDidChange() }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.appBecameActive() }
            .store(in: &cancellables)
        // A launch is a moment too: an invitation kept from an earlier run (the server could not be
        // reached, or the session was refused) is tried again without waiting for another event.
        trigger()
    }

    /// Fixture mode (DEBUG) answers every request from recorded captures: no invitation is claimed there.
    nonisolated static var liveNetwork: Bool {
#if DEBUG
        !NucleoFixtures.isActive
#else
        true
#endif
    }

    // MARK: What the screens read

    /// The waiting invitation, or nil once it is older than thirty days.
    var waiting: InvitePending? {
        guard let pending, !expired(pending) else { return nil }
        return pending
    }

    var pendingCode: String? { waiting?.code }

    /// The answer the account that is here now has not read yet (never another account's, never an old one).
    var unreadAnswer: InviteAnswer? {
        guard let answer, let owner, !owner.isEmpty, owner == currentUser(), ownerGeneration == currentGeneration(),
              !expired(answer) else { return nil }
        return answer
    }

    var isSignedIn: Bool { !(currentUser() ?? "").isEmpty }

    // MARK: An invitation arrives

    /// An invitation link opened the app. False for every other URL (the sign-in callback included).
    @discardableResult
    func receive(_ url: URL) -> Bool {
        guard let code = InviteLink.code(from: url) else { return false }
        store(code)
        trigger()
        return true
    }

    /// A universal link (`NSUserActivityTypeBrowsingWeb`).
    @discardableResult
    func receive(activity: NSUserActivity) -> Bool {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb, let url = activity.webpageURL else { return false }
        return receive(url)
    }

    /// A code typed in the invite sheet: kept like a link's, then tried. The result is published in `notice`.
    @discardableResult
    func submit(code raw: String) async -> InviteNotice? {
        accountChanged()
        guard let code = InviteLink.code(fromEntry: raw) else {
            notice = .invalid
            return notice
        }
        store(code)
        notice = nil
        guard riskAccepted() else {
            notice = .consentNeeded
            return notice
        }
        guard let user = currentUser(), !user.isEmpty else {
            notice = .signInNeeded
            return notice
        }
        let generation = currentGeneration()
        // An attempt for an older code may be in the air: let it land, then try this one.
        if let flight { _ = await flight.value }
        let step = await claimIfPossible()
        guard currentUser() == user, currentGeneration() == generation else { return nil }
        switch step {
        case .settled, .dropped:
            break
        case .kept(.account):
            notice = .signInNeeded
        case .kept(.unreachable), nil:
            if pendingCode == code { notice = .savedForLater }
        }
        return notice
    }

    /// The person asked to accept the waiting invitation (the nudge's button).
    @discardableResult
    func acceptPending() async -> InviteNotice? {
        if let flight { _ = await flight.value }
        guard let code = pendingCode else { return notice }
        return await submit(code: code)
    }

    /// The person removes the waiting invitation from this phone.
    func forget() {
        clearPending()
        notice = nil
        clearAnswer()
    }

    /// The result line was on screen: it is not repeated the next time the sheet opens, and the
    /// answer kept for it is removed from the phone.
    func acknowledgeNotice() {
        guard !isClaiming else { return }
        notice = nil
        clearAnswer()
    }

    // MARK: Triggers

    /// A sign-in, a sign-out or another account. The waiting code belongs to the phone and stays.
    func accountDidChange() {
        accountChanged()
        trigger()
    }

    func appBecameActive() {
        purgeExpired()
        trigger()
    }

    /// Makes sure the centre exists (InviteNudges calls it when the Núcleo starts), so its observers
    /// and the launch attempt do not wait for the first invitation link or the first nudge.
    func wake() {}

    /// Everything this centre started has finished (suites and review fixtures).
    func idle() async {
        while true {
            if let task = lastTrigger { lastTrigger = nil; await task.value; continue }
            if let task = flight { _ = await task.value; continue }
            if let task = refreshTask { refreshTask = nil; await task.value; continue }
            return
        }
    }

    private func trigger() {
        lastTrigger = Task { [weak self] in _ = await self?.claimIfPossible() }
    }

    private func accountChanged() {
        guard owner != currentUser() || ownerGeneration != currentGeneration() else { return }
        owner = currentUser()
        ownerGeneration = currentGeneration()
        // The result line and the answer behind it were the previous account's.
        notice = nil
        clearAnswer()
        // So was the back-off: whoever is here now has not been refused anything yet.
        retryNotBefore = nil
    }

    // MARK: The claim

    /// Tries the waiting code when a code, the accepted risk notice and an account are all present.
    /// One attempt at a time (a second caller waits for the one in the air), and none sooner than
    /// `backOff` after an attempt that could not be settled. Nil when nothing was sent.
    @discardableResult
    func claimIfPossible() async -> InviteClaimStep? {
        if let flight { return await flight.value }
        purgeExpired()
        accountChanged()
        guard let code = pendingCode, riskAccepted(), let user = currentUser(), !user.isEmpty else { return nil }
        if let wait = retryNotBefore {
            let left = wait.timeIntervalSince(now())
            // A clock set back must not hold the code for longer than one back-off.
            if left > 0, left <= Self.backOff { return nil }
        }
        let generation = currentGeneration()
        // The consent is here now: the line that asked for it is out of date.
        if notice == .consentNeeded { notice = nil }
        let task = Task { @MainActor in await self.attempt(code: code, user: user, generation: generation) }
        flight = task
        isClaiming = true
        return await task.value
    }

    private func attempt(code: String, user: String, generation: UUID) async -> InviteClaimStep {
        let reply = try? await send(BobbyAccessAPI.accessPath, "POST", ["action": "referral-claim", "code": code], auth, generation)
        flight = nil
        isClaiming = false
        // A reply for a previous account is dropped: the code stays for whoever is here now.
        guard currentUser() == user, currentGeneration() == generation else {
            accountChanged()
            if pendingCode != nil { trigger() }
            return .dropped
        }
        switch reply.map(Self.verdict) ?? .keep(.unreachable) {
        case .keep(let reason):
            retryNotBefore = now().addingTimeInterval(Self.backOff)
            return .kept(reason)
        case .settle(let result):
            retryNotBefore = nil
            // A newer invitation arrived while this one was in the air: it gets its own answer,
            // unless this account has just accepted (an account accepts one invitation, ever).
            let superseded = pending?.code != code
            if result == .accepted || !superseded {
                clearPending()
                notice = result
                keepAnswer(InviteAnswer(code: code, notice: result, at: now()), for: user)
            } else {
                trigger()
            }
            if result == .accepted, riskAccepted() {
                let afterClaim = self.afterClaim
                refreshTask = Task { @MainActor in await afterClaim() }
            }
            return .settled(result)
        }
    }

    private enum Verdict {
        case settle(InviteNotice)
        case keep(InviteClaimStep.Kept)
    }

    private static let results: [String: InviteNotice] = [
        "claimed": .accepted, "self": .ownInvitation, "not_new": .notNew, "already_claimed": .alreadyClaimed,
        "inviter_full": .inviterFull, "invalid_code": .invalid, "invalid_invitee": .invalid,
    ]

    /// Only a JSON answer the server meant as final settles the code. A refused bearer, a failing
    /// server, a captive portal's page or anything unreadable keeps it for a later attempt.
    private static func verdict(_ reply: Reply) -> Verdict {
        if reply.status == 401 { return .keep(.account) }
        let result = (reply.json as? [String: Any])?["result"] as? String
        if (200..<300).contains(reply.status), let result {
            if result == "account_required" { return .keep(.account) }
            return .settle(results[result] ?? .notApplied)
        }
        // The server refuses a malformed code with 400 before it looks anything up.
        if reply.status == 400, result == "invalid_code" { return .settle(.invalid) }
        return .keep(.unreachable)
    }

    // MARK: Store

    private func expired(_ pending: InvitePending) -> Bool {
        let age = now().timeIntervalSince(pending.at)
        // A date far in the future is a broken clock or a broken record, not a fresh invitation.
        return age >= Self.lifetime || age < -Self.lifetime
    }

    private func expired(_ answer: InviteAnswer) -> Bool {
        let age = now().timeIntervalSince(answer.at)
        return age >= Self.answerLifetime || age < -Self.answerLifetime
    }

    private func purgeExpired() {
        if let pending, expired(pending) { clearPending() }
        if let answer, expired(answer) {
            // A week-old answer is not news any more: its line goes with it.
            if notice == answer.notice { notice = nil }
            clearAnswer()
        }
    }

    /// Newest wins: a second invitation replaces the first, and its own result line follows.
    private func store(_ code: String) {
        if pending?.code != code {
            notice = nil
            clearAnswer()
        }
        let fresh = InvitePending(code: code, at: now())
        pending = fresh
        defaults.set(["code": fresh.code, "at": fresh.at.timeIntervalSince1970], forKey: Self.storeKey)
    }

    private func clearPending() {
        pending = nil
        defaults.removeObject(forKey: Self.storeKey)
    }

    // MARK: The answer nobody has read yet

    private func keepAnswer(_ fresh: InviteAnswer, for user: String) {
        answer = fresh
        defaults.set(["code": fresh.code, "result": fresh.notice.rawValue, "at": fresh.at.timeIntervalSince1970, "user": user],
                     forKey: Self.answerKey)
    }

    private func clearAnswer() {
        if answer != nil { answer = nil }
        if defaults.object(forKey: Self.answerKey) != nil { defaults.removeObject(forKey: Self.answerKey) }
    }

    /// A relaunch: the answer comes back only for the account it was given to, and with it the
    /// line the invite sheet shows. Anything else (another account, nobody, a broken or old record) is removed.
    private func restoreAnswer() {
        guard let stored = defaults.dictionary(forKey: Self.answerKey) else { return }
        guard let user = stored["user"] as? String, !user.isEmpty, user == owner,
              let code = (stored["code"] as? String).flatMap(InviteLink.normalized),
              let result = (stored["result"] as? String).flatMap(InviteNotice.init(rawValue:)), InviteNotice.final.contains(result),
              let at = (stored["at"] as? NSNumber)?.doubleValue, at.isFinite else {
            defaults.removeObject(forKey: Self.answerKey)
            return
        }
        let kept = InviteAnswer(code: code, notice: result, at: Date(timeIntervalSince1970: at))
        guard !expired(kept) else {
            defaults.removeObject(forKey: Self.answerKey)
            return
        }
        answer = kept
        notice = result
    }

    private static func read(_ defaults: UserDefaults) -> InvitePending? {
        guard let stored = defaults.dictionary(forKey: storeKey),
              let code = (stored["code"] as? String).flatMap(InviteLink.normalized),
              let at = (stored["at"] as? NSNumber)?.doubleValue, at.isFinite else { return nil }
        return InvitePending(code: code, at: Date(timeIntervalSince1970: at))
    }

#if DEBUG
    /// Review fixtures (`-qa-v18 invite-…`): a recorded state, nothing stored and nothing sent.
    func showForReview(pendingCode: String?, notice: InviteNotice?) {
        pending = pendingCode.map { InvitePending(code: $0, at: now()) }
        self.notice = notice
        answer = nil
    }
#endif
}
