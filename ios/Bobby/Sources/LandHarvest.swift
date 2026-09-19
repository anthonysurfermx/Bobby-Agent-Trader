// The desk → Trader Land bridge. One question = one seed: every finished read
// plants a piece on the server (a seed for a read, a bloomed piece for a
// respected NO TRADE); the harvest card says so right where the read ends and
// offers the seed's horizon (patience decides the piece), and the header chip
// keeps the island one tap away with what is waiting there.
import SwiftUI
import Combine

/// One Trader Land presentation from the desk, and where it opens.
struct LandRequest: Identifiable {
    let id = UUID()
    let focus: TraderLandFocus?
}

/// What a finished desk read did on the island.
struct HarvestMoment: Identifiable, Equatable {
    enum Stage: Equatable {
        /// Signed in, waiting for /api/progress.
        case syncing
        /// A read planted a seed: it blooms when its thesis is reviewed, once its horizon ends.
        case seed(RouteGrant.Piece)
        /// A respected NO TRADE: the piece is ready to build now.
        case bloomed(RouteGrant.Piece)
        /// The daily cap: nothing planted today any more.
        case capped
        /// Every route piece is owned; XP still counts.
        case routeComplete
        /// No account: nothing reaches the island. `planted` = the read did earn (not capped).
        case signedOut(planted: Bool)
        /// The grant failed or the server did not answer; the island catches up on its next sync.
        case pending
    }
    let id = UUID()
    let eventID: String?
    let noTrade: Bool
    let thesis: AwardThesis?
    var xp: Int
    var stage: Stage
    /// The seed's island row, once the server answered: what an extend names.
    var inventoryID: String? = nil
    /// The account whose island holds that row: the choice is theirs only.
    var ownerID: String? = nil
    /// The seed's horizon as the server applied it. nil = a server before Growth v1: 24 h, no choice.
    var horizon: RouteGrant.Horizon? = nil
    /// What each horizon would bloom into (the server's `tiers`): the choice's preview.
    var tiers: [LandHorizon: RouteGrant.Piece] = [:]
    /// The horizon being asked for right now: one extend at a time.
    var extending: LandHorizon? = nil
    /// Why the last extend did not happen, in the reader's language.
    var extendError: String? = nil

    /// When the seed's review opens, per the server.
    var reviewAt: Date? { horizon?.reviewAt }
    /// The seed's horizon: 24 h unless the server says otherwise.
    var span: LandHorizon { horizon?.hours ?? .day }
    /// The card offers the horizon choice: a read's seed whose row, owner and horizon the server named.
    var offersHorizon: Bool {
        guard case .seed = stage, !noTrade, inventoryID != nil, ownerID != nil, horizon != nil else { return false }
        return true
    }
    /// The horizons this seed may grow to at `now` (upward only, before its review opens).
    func extendOptions(at now: Date = Date()) -> [LandHorizon] {
        offersHorizon ? horizon?.options(at: now) ?? [] : []
    }
    /// A new read keeps this card on the desk until its extend answers: that answer is the
    /// builder's to see, not something a quick-access tap may swallow.
    var holdsThroughNextRead: Bool { extending != nil }

    /// Keeps what the server planted beyond the stage: the seed's row, its horizon, the previews,
    /// and the account (`owner`) whose island the row lives on.
    mutating func adopt(_ outcome: AwardOutcome, owner: String?) {
        guard case let .planted(grant) = outcome.grant else { return }
        inventoryID = grant.inventoryId
        ownerID = owner
        horizon = grant.horizon
        tiers = grant.tiers
    }

    /// Signed out, or into another account: the row is not this desk's to extend any more.
    /// The card keeps its story (the piece and its horizon); only the choice goes. true = changed.
    mutating func forgetSeedRow(unlessOwnedBy userID: String?) -> Bool {
        guard inventoryID != nil, ownerID != userID else { return false }
        inventoryID = nil
        ownerID = nil
        extending = nil
        extendError = nil
        return true
    }

    /// Once the review opened the horizon is set (§1): true = the choice just closed.
    /// An extend on its way is left to its own answer.
    mutating func closeHorizonIfReviewOpen(at now: Date = Date()) -> Bool {
        guard extending == nil, let h = horizon, h.extendable, let at = h.reviewAt, at <= now else { return false }
        horizon = h.closed
        return true
    }

    /// The card with an extend to `target` in flight; nil when it cannot ask for that now
    /// (not an offered horizon, its review already open, or one already on its way: never a double submit).
    func startingExtend(to target: LandHorizon, at now: Date = Date()) -> HarvestMoment? {
        guard extending == nil, extendOptions(at: now).contains(target) else { return nil }
        var next = self
        next.extending = target
        next.extendError = nil
        return next
    }

    /// Applies an extend's answer to the card it was sent from. nil = that card is gone
    /// (a new read replaced it, or it names another seed): the answer is dropped.
    /// `truth` is the seed's row read again after a refusal or a lost answer: the server's
    /// word on what the seed is now, which the card adopts over its own memory.
    static func settlingExtend(_ current: HarvestMoment?, eventID: String, inventoryID: String, target: LandHorizon,
                               result: Result<DeskSeedExtender.Extended, DeskSeedExtender.Failure>,
                               truth: DeskSeedExtender.Extended? = nil) -> HarvestMoment? {
        guard var moment = current, moment.eventID == eventID, moment.inventoryID == inventoryID,
              case .seed = moment.stage else { return nil }
        moment.extending = nil
        switch result {
        case let .success(extended):
            // The seed now points at the next piece of its new tier.
            moment.stage = .seed(extended.item)
            moment.horizon = extended.horizon
            moment.extendError = nil
        case let .failure(failure):
            if let truth, truth.inventoryID == inventoryID {
                // The island's own row: a lost answer that did land, another device, or the
                // same seed as before. It reached what was asked = nothing went wrong.
                moment.stage = .seed(truth.item)
                moment.horizon = truth.horizon
                moment.extendError = truth.horizon.hours.hours >= target.hours ? nil : failure.message
            } else if failure == .notUpward {
                // The server holds it at `target` or longer and its row could not be read: never
                // keep claiming the shorter horizon. Its piece is the server's preview for that tier.
                moment.horizon = RouteGrant.Horizon(hours: target, reviewAt: nil, extendable: false, extendTo: [])
                if let preview = moment.tiers[target] { moment.stage = .seed(preview) }
                moment.extendError = failure.message
            } else {
                moment.extendError = failure.message
                if failure.closesChoice { moment.horizon = moment.horizon?.closed }
            }
        }
        return moment
    }

    /// What VoiceOver hears once an extend settled on this card: the new bloom, or why not.
    var extendAnnouncement: String? {
        if let extendError { return extendError }
        guard case let .seed(piece) = stage else { return nil }
        return L.t("Your seed now blooms into \(piece.displayName) in \(span.label).",
                   "Tu semilla ahora florece como \(piece.displayName) en \(span.label).")
    }

    /// Maps the server's answer about this award to what the card says.
    static func stage(for outcome: AwardOutcome) -> Stage {
        if outcome.awarded == 0 { return outcome.duplicate ? .pending : .capped }
        guard case let .planted(grant) = outcome.grant else { return .pending }
        if let piece = grant.item { return grant.state == "bloomed" ? .bloomed(piece) : .seed(piece) }
        return grant.routeComplete ? .routeComplete : .pending
    }

    /// Stages a later server answer (a retry, a sign-in) may still settle.
    var isOpen: Bool {
        switch stage {
        case .syncing, .pending: return true
        case let .signedOut(planted): return planted
        default: return false
        }
    }
}

extension AwardThesis {
    /// "BTC long @ $64,210.50" in the reader's language.
    var line: String {
        let bias = direction == "long" ? L.t("long", "alcista") : direction == "short" ? L.t("short", "bajista") : L.t("no bias", "sin sesgo")
        return "\(symbol) \(bias)" + (price.map { " @ \(BobbyAnswer.money($0))" } ?? "")
    }
}

/// Every desk request to /api/trader-land declares the Growth v1 contract
/// (docs/trader-land/GROWTH-v1.md §3), like the island's own requests.
private enum DeskLandClient {
    static let header = "X-Trader-Land-Client"
    static let version = "2"

    /// `GET /api/trader-land`: the account island, read fresh.
    static func worldRequest(token: String) -> URLRequest {
        var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/trader-land"))
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(version, forHTTPHeaderField: header)
        return request
    }
}

/// A light read of the account island for the desk chip: pieces waiting to be
/// built and theses waiting to be reviewed. Signed out or failing: no badge, no noise.
@MainActor
final class LandPulse: ObservableObject {
    @Published private(set) var readyToBuild = 0
    @Published private(set) var reviewsReady = 0
    @Published private(set) var firstReadyItemID: String?
    /// Every piece the account holds on Trader Land (seeds, bloomed, built); nil = not read yet.
    @Published private(set) var pieces: Int?
    private var inflight = false
    /// A refresh asked for mid-flight (a piece planted during the GET) runs once more after it.
    private var stale = false
    private let transport: URLSession

    init(transport: URLSession = .shared) { self.transport = transport }

    var badge: Int { readyToBuild + reviewsReady }

    /// Where the chip opens the island: the reviews first, then a piece to build.
    var focus: TraderLandFocus? {
        if reviewsReady > 0 { return .review }
        return firstReadyItemID.map { .build(itemID: $0) }
    }

    func refresh() async {
        guard AccountSession.shared.session?.userId != nil else { apply(nil); return }
        guard !inflight else { stale = true; return }
        inflight = true
        defer { inflight = false }
        repeat {
            stale = false
            await fetch()
        } while stale
    }

    private func fetch() async {
        guard let userID = AccountSession.shared.session?.userId else { apply(nil); return }
        guard let token = await AccountSession.shared.accessToken() else { return }
        guard let (data, response) = try? await transport.data(for: DeskLandClient.worldRequest(token: token)),
              (200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0),
              let world = try? JSONDecoder().decode(TraderLandWorld.self, from: data), world.ok,
              AccountSession.shared.session?.userId == userID else { return }
        apply(world)
    }

    func apply(_ world: TraderLandWorld?) {
        readyToBuild = world?.readyToBuild ?? 0
        reviewsReady = world?.reviewsReady ?? 0
        firstReadyItemID = world?.inventory.first { $0.state == "bloomed" && !$0.placed }?.item_id
        pieces = world?.inventory.count
    }
}

/// Who is signed in, and a fresh bearer for them: AccountSession in the app, a stub in tests.
struct DeskAccount {
    var userID: @MainActor () -> String?
    /// nil when no token could be had: signed out, or a refresh that failed offline.
    var token: @MainActor () async -> String?

    static var live: DeskAccount {
        DeskAccount(userID: { AccountSession.shared.session?.userId },
                    token: { await AccountSession.shared.accessToken() })
    }
}

/// The desk's own `extend` (GROWTH-v1 §3): one authenticated POST with LandPulse's
/// bearer, never through TraderLandSync (that one needs a loaded island and shares
/// the island's busy flag). The server re-points the seed to the next piece of its new tier.
struct DeskSeedExtender {
    /// `extended` in the answer: the seed's new piece and horizon. Also a seed's row as the
    /// island reads it (`seedRow`), which has the same shape.
    struct Extended: Equatable {
        let inventoryID: String
        let item: RouteGrant.Piece
        let horizon: RouteGrant.Horizon
    }

    enum Failure: Error, Equatable {
        case signedOut
        /// 404: the seed is not on this account's island any more.
        case gone
        /// 409 `not_seed`.
        case bloomed
        /// 409 `review_open`: too late to extend.
        case reviewOpen
        /// 400 `not_upward`: its horizon already reaches that far (a lost answer, another device).
        case notUpward
        /// Offline, a server error, an unreadable answer: nothing is known to have changed.
        case unavailable

        var message: String {
            switch self {
            case .signedOut: return L.t("Sign in again to extend this seed.", "Inicia sesión de nuevo para extender esta semilla.")
            case .gone: return L.t("This seed is no longer on your island.", "Esta semilla ya no está en tu isla.")
            case .bloomed: return L.t("This seed already bloomed.", "Esta semilla ya floreció.")
            case .reviewOpen: return L.t("Its review is already open: its horizon is set.", "Su revisión ya está abierta: su horizonte quedó fijo.")
            case .notUpward: return L.t("This seed's horizon already reaches that far. Open your island to see it.",
                                        "El horizonte de esta semilla ya llega hasta ahí. Abre tu isla para verla.")
            case .unavailable: return L.t("Your seed could not be extended right now. Try again.", "No se pudo extender tu semilla ahora. Inténtalo de nuevo.")
            }
        }

        /// The server says this seed will not grow from here: the choice closes.
        var closesChoice: Bool {
            switch self {
            case .gone, .bloomed, .reviewOpen, .notUpward: return true
            case .signedOut, .unavailable: return false
            }
        }

        /// The seed may not be what the card remembers (an answer lost on the way, a horizon
        /// already longer): read its row again before telling the builder anything.
        var rereads: Bool {
            switch self {
            case .notUpward, .reviewOpen, .unavailable: return true
            case .signedOut, .gone, .bloomed: return false
            }
        }
    }

    /// An answer that reached no card (a new read replaced it): said once, out loud and by haptic.
    static var droppedMessage: String {
        L.t("Your last seed's horizon may not have changed. Check it on your island.",
            "Puede que el horizonte de tu última semilla no haya cambiado. Revísalo en tu isla.")
    }

    var transport: URLSession = .shared
    var account: DeskAccount = .live

    @MainActor
    func extend(inventoryID: String, to horizon: LandHorizon) async -> Result<Extended, Failure> {
        guard let userID = account.userID() else { return .failure(.signedOut) }
        // A refresh that failed offline keeps the session: that is an outage to retry, not a sign-out.
        guard let token = await account.token() else { return .failure(account.userID() == nil ? .signedOut : .unavailable) }
        guard let request = try? Self.request(inventoryID: inventoryID, to: horizon, token: token),
              let (data, response) = try? await transport.data(for: request) else { return .failure(.unavailable) }
        // Signed out, or into another account, while it flew: nothing lands on this desk.
        guard account.userID() == userID else { return .failure(.signedOut) }
        return Self.interpret(data: data, status: (response as? HTTPURLResponse)?.statusCode ?? 0, inventoryID: inventoryID)
    }

    /// The seed's row as the island reads it now (`GET /api/trader-land`): nil when it cannot be
    /// read, is no longer a seed, or the account changed meanwhile.
    @MainActor
    func seedRow(inventoryID: String) async -> Extended? {
        guard let userID = account.userID(), let token = await account.token(),
              let (data, response) = try? await transport.data(for: DeskLandClient.worldRequest(token: token)),
              (200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0),
              account.userID() == userID,
              let world = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              world["ok"] as? Bool == true else { return nil }
        return Self.seedRow(in: world, inventoryID: inventoryID)
    }

    /// `inventory[id == inventoryID]` of a world payload, when it is still a seed with a horizon.
    /// Its `item` is a catalog row; a piece missing from the catalog keeps at least its id.
    static func seedRow(in world: [String: Any], inventoryID: String) -> Extended? {
        guard let rows = world["inventory"] as? [[String: Any]],
              let row = rows.first(where: { $0["id"] as? String == inventoryID }),
              row["state"] as? String == "seed",
              let horizon = RouteGrant.Horizon.parse(row["horizon"]) else { return nil }
        let footprint = [horizon.hours.footprint.cols, horizon.hours.footprint.rows]
        guard let item = RouteGrant.Piece.parse(row["item"])
                ?? (row["item_id"] as? String).map({ RouteGrant.Piece(id: $0, world: nil, kind: nil, nameEN: nil, footprint: footprint) })
        else { return nil }
        return Extended(inventoryID: inventoryID, item: item, horizon: horizon)
    }

    /// `POST /api/trader-land { action: 'extend', inventoryId, hours }` with the bearer and the client header.
    static func request(inventoryID: String, to horizon: LandHorizon, token: String) throws -> URLRequest {
        var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/trader-land"))
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(DeskLandClient.version, forHTTPHeaderField: DeskLandClient.header)
        request.httpBody = try JSONSerialization.data(withJSONObject: ["action": "extend", "inventoryId": inventoryID, "hours": horizon.hours])
        return request
    }

    /// Reads the answer: `{ ok, extended: { inventoryId, item, horizon }, ...world }` or `{ error }`.
    static func interpret(data: Data, status: Int, inventoryID: String) -> Result<Extended, Failure> {
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard (200..<300).contains(status) else {
            let error = (json?["error"] as? String ?? "").lowercased()
            switch status {
            case 401: return .failure(.signedOut)
            case 404: return .failure(.gone)
            case 409 where error.contains("already bloomed"): return .failure(.bloomed)
            case 409 where error.contains("review is already open"): return .failure(.reviewOpen)
            case 400 where error.contains("can only grow"): return .failure(.notUpward)
            default: return .failure(.unavailable)
            }
        }
        guard let json, json["ok"] as? Bool == true, let extended = json["extended"] as? [String: Any],
              (extended["inventoryId"] as? String).map({ $0 == inventoryID }) ?? true,
              let horizon = RouteGrant.Horizon.parse(extended["horizon"]) else { return .failure(.unavailable) }
        // `item: null` = the piece is missing from the active catalog: the extend still happened,
        // and the world in the same answer names the seed's row.
        guard let item = RouteGrant.Piece.parse(extended["item"]) ?? seedRow(in: json, inventoryID: inventoryID)?.item
        else { return .failure(.unavailable) }
        return .success(Extended(inventoryID: inventoryID, item: item, horizon: horizon))
    }
}

/// The desk's door to Trader Land: the island's core, plus what waits there.
struct LandChip: View {
    let badge: Int
    /// Bumps when a read just planted a piece: the chip answers with a pop.
    var bump: Int = 0
    let action: () -> Void
    @State private var popped = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Group {
                    if let core = TraderLandArt.thumb("aura_core") {
                        Image(uiImage: core).resizable().scaledToFit()
                    } else {
                        Image(systemName: "map.fill").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.cio)
                    }
                }
                .frame(width: 24, height: 24)
                if badge > 0 {
                    Text("\(min(badge, 99))")
                        .font(.mono(10, .black))
                        .foregroundStyle(Theme.bg)
                        .padding(.horizontal, 5)
                        .frame(minWidth: 17, minHeight: 17)
                        .background(Capsule().fill(Theme.cio))
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.leading, 5)
            .padding(.trailing, badge > 0 ? 6 : 5)
            .frame(height: 32)
            .background(Capsule().fill(badge > 0 ? Theme.cio.opacity(0.10) : Theme.card))
            .overlay(Capsule().stroke(badge > 0 ? Theme.cio.opacity(0.45) : Theme.stroke, lineWidth: 1))
            .scaleEffect(popped ? 1.14 : 1)
        }
        .buttonStyle(.plain)
        .animation(.spring(duration: 0.3, bounce: 0.3), value: badge)
        .onChange(of: bump) {
            withAnimation(.spring(duration: 0.22, bounce: 0.5)) { popped = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) {
                withAnimation(.spring(duration: 0.4, bounce: 0.3)) { popped = false }
            }
        }
        .accessibilityIdentifier("desk-land")
        .accessibilityLabel("Trader Land")
        .accessibilityValue(badge > 0 ? L.t("\(badge) waiting for you", "\(badge) esperándote") : "")
        .accessibilityHint(L.t("Opens your island", "Abre tu isla"))
    }
}


/// A horizon chip draws its own states: the seed's current horizon is not tappable
/// yet must read at full strength, so no system dimming for disabled.
private struct HorizonChipStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// The reward line under a finished read: which piece it planted on the
/// island, why, and the one tap that goes there.
struct HarvestCard: View {
    let moment: HarvestMoment
    /// Off while the NO TRADE card above already shows this read's XP.
    var showsXP = true
    let onOpen: (TraderLandFocus?) -> Void
    let onSaveProgress: () -> Void
    /// A confirmed horizon for the seed: the desk sends the extend.
    var onExtend: (LandHorizon) -> Void = { _ in }
    /// The horizon tapped but not confirmed yet (the card's own confirm step).
    @State private var proposed: LandHorizon?
    /// Moves when the seed's review opens: the choice locks on screen, not after a refused tap.
    @State private var clock = Date()

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            summary
            if moment.offersHorizon { horizonChoice(now: max(clock, Date())) }
        }
        .padding(12)
        .background(
            LinearGradient(colors: [tone.opacity(0.11), Theme.card], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(tone.opacity(0.26), lineWidth: 1))
        .transition(.scale(scale: 0.94).combined(with: .opacity))
        // A new read's card never inherits the last one's unconfirmed choice.
        .onChange(of: moment.id) { proposed = nil }
        // Wakes once, when the review opens (a return from the background wakes it late, never early).
        .task(id: moment.reviewAt) {
            guard let at = moment.reviewAt, at > Date(),
                  (try? await Task.sleep(for: .seconds(at.timeIntervalSinceNow + 0.25))) != nil else { return }
            clock = Date()
        }
        // The confirm step appears without moving focus: say what it asks.
        .onChange(of: proposed) { _, next in
            guard let next, moment.extending == nil else { return }
            AccessibilityNotification.Announcement(Self.confirmQuestion(next)).post()
        }
        // A container, so the card's identifier does not overwrite its buttons'.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("desk-harvest")
    }

    private var summary: some View {
        HStack(alignment: .top, spacing: 12) {
            thumbnail
            VStack(alignment: .leading, spacing: 4) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(eyebrow)
                            .font(.mono(8.5, .bold))
                            .kerning(1.4)
                            .foregroundStyle(tone)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 4)
                        if showsXP, moment.xp > 0 {
                            Text("+\(moment.xp) XP")
                                .font(.mono(8.5, .black))
                                .foregroundStyle(Theme.accentSoft)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Theme.accent.opacity(0.14)))
                        }
                    }
                    Text(title)
                        .font(.rounded(15, .bold))
                        .foregroundStyle(Theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                    if let detail {
                        Text(detail)
                            .font(.rounded(11.5, .medium))
                            .foregroundStyle(Theme.text.opacity(0.62))
                            .lineSpacing(1.5)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .combine)
                actions.padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: Pieces

    private var piece: RouteGrant.Piece? {
        switch moment.stage {
        case let .seed(p), let .bloomed(p): return p
        default: return nil
        }
    }

    private var tone: Color {
        switch moment.stage {
        // Blue, not the desk's price-up green: a seed from a short thesis is not bullish.
        case .seed: return Theme.accent
        case .bloomed: return Theme.cio
        case .signedOut: return Theme.accentSoft
        default: return Theme.accentSoft.opacity(0.8)
        }
    }

    private var thumbnail: some View {
        let art = TraderLandArt.thumb(piece?.id ?? "aura_core")
        return ZStack(alignment: .bottomTrailing) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(RadialGradient(colors: [tone.opacity(0.22), Theme.panel.opacity(0.9)], center: .center, startRadius: 2, endRadius: 44))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(tone.opacity(0.22), lineWidth: 1))
            Group {
                if let art {
                    // The 256 px thumbs carry a wide transparent margin: frame the piece itself.
                    // A building or landmark fills more of its thumb than a 1×1 does.
                    Image(uiImage: art).resizable().scaledToFit().scaleEffect(Self.thumbScale(piece))
                } else {
                    Image(systemName: "leaf.fill").font(.system(size: 22, weight: .bold)).foregroundStyle(tone)
                }
            }
            .frame(width: 66, height: 66)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            // A seed is the piece before it grows: shown quiet until its review.
            .saturation(isSeed ? 0.3 : 1)
            .opacity(dimmed ? 0.5 : isSeed ? 0.82 : 1)
            Group {
                if case .syncing = moment.stage {
                    ProgressView().controlSize(.mini).tint(Theme.bg)
                } else if let badge {
                    Image(systemName: badge).font(.system(size: 10, weight: .heavy)).foregroundStyle(Theme.bg)
                }
            }
            .frame(width: 21, height: 21)
            .background(Circle().fill(tone))
            .overlay(Circle().stroke(Theme.bg, lineWidth: 2))
            .offset(x: 5, y: 5)
        }
        .frame(width: 66, height: 66)
        .accessibilityHidden(true)
    }

    /// How far a thumb zooms past its transparent margin: less for wider pieces.
    private static func thumbScale(_ piece: RouteGrant.Piece?) -> CGFloat {
        guard let piece else { return 1.3 }
        switch piece.footprint.reduce(1, *) {
        case ..<2: return 1.3
        case 2: return 1.18
        default: return 1.08
        }
    }

    private var isSeed: Bool { if case .seed = moment.stage { return true }; return false }
    private var dimmed: Bool {
        switch moment.stage {
        case .seed, .bloomed: return false
        default: return true
        }
    }

    private var badge: String? {
        switch moment.stage {
        case .syncing: return nil
        case .seed: return "hourglass"
        case .bloomed: return "sparkles"
        case .capped: return "checkmark"
        case .routeComplete: return "flag.fill"
        case .signedOut: return "icloud.and.arrow.up"
        case .pending: return "arrow.triangle.2.circlepath"
        }
    }

    // MARK: Copy

    private var eyebrow: String {
        switch moment.stage {
        case .syncing: return L.t("TRADER LAND · PLANTING", "TRADER LAND · PLANTANDO")
        case .seed: return L.t("TRADER LAND · SEED", "TRADER LAND · SEMILLA")
        case .bloomed: return L.t("TRADER LAND · READY TO BUILD", "TRADER LAND · LISTA PARA CONSTRUIR")
        case .capped: return L.t("TRADER LAND · DAILY LIMIT", "TRADER LAND · LÍMITE DIARIO")
        case .routeComplete: return L.t("TRADER LAND · ROUTE COMPLETE", "TRADER LAND · RUTA COMPLETA")
        case .signedOut: return "TRADER LAND"
        case .pending: return L.t("TRADER LAND · SYNCING", "TRADER LAND · SINCRONIZANDO")
        }
    }

    private var title: String {
        switch moment.stage {
        case .syncing:
            return L.t("Planting your piece…", "Plantando tu pieza…")
        case let .seed(p):
            return L.t("Seed planted · \(p.displayName)", "Semilla plantada · \(p.displayName)")
        case let .bloomed(p):
            return L.t("Piece ready · \(p.displayName)", "Pieza lista · \(p.displayName)")
        case .capped:
            return L.t("Today's pieces are planted", "Las piezas de hoy ya están plantadas")
        case .routeComplete:
            return L.t("Route complete", "Ruta completa")
        case let .signedOut(planted):
            return planted
                ? L.t("This read would plant a piece on your island.", "Esta lectura plantaría una pieza en tu isla.")
                : L.t("Your reads can plant pieces on your island.", "Tus lecturas pueden plantar piezas en tu isla.")
        case .pending:
            return L.t("Your piece will show up when your island syncs.", "Tu pieza aparecerá cuando tu isla se sincronice.")
        }
    }

    private var detail: String? {
        switch moment.stage {
        case .syncing:
            return moment.noTrade
                ? L.t("Respecting NO TRADE earns a piece you can build today.", "Respetar el NO OPERAR te da una pieza para construir hoy.")
                : L.t("This read becomes a seed on your island.", "Esta lectura se vuelve una semilla en tu isla.")
        case .seed:
            // The seed's own horizon: 24 h as planted, 3 or 7 days once grown.
            let when = moment.span.label
            if let thesis = moment.thesis {
                return L.t("It blooms when you review this thesis in \(when): \(thesis.line).",
                           "Florece cuando revises esta tesis en \(when): \(thesis.line).")
            }
            return L.t("It blooms when you review this read in \(when).", "Florece cuando revises esta lectura en \(when).")
        case .bloomed:
            return L.t("Respecting NO TRADE made it bloom right away.", "Respetar el NO OPERAR la hizo florecer al instante.")
        case .capped:
            return L.t("Come back tomorrow for the next seed.", "Vuelve mañana por la siguiente semilla.")
        case .routeComplete:
            return L.t("Every route piece is yours · your XP still counts.", "Todas las piezas de la ruta son tuyas · tu XP sigue sumando.")
        case .signedOut:
            return L.t("Save your progress and every read starts building it.", "Guarda tu progreso y cada lectura empieza a construirla.")
        case .pending:
            return nil
        }
    }

    // MARK: Actions

    @ViewBuilder private var actions: some View {
        switch moment.stage {
        case .syncing:
            EmptyView()
        case .seed:
            // The island opens on this seed's row in the reviews list (or on the list if the id is unknown).
            primary(L.t("See it on my island", "Verla en mi isla")) { onOpen(moment.inventoryID.map { .seed(inventoryID: $0) } ?? .review) }
        case let .bloomed(p):
            primary(L.t("Build it", "Constrúyela")) { onOpen(.build(itemID: p.id)) }
        case .capped, .routeComplete, .pending:
            secondary(L.t("Open my island", "Abrir mi isla")) { onOpen(nil) }
        case .signedOut:
            // Two actions share the row: the save is the ask, the island a quiet link.
            HStack(spacing: 12) {
                primary(L.t("Save progress", "Guardar progreso"), arrow: false, onSaveProgress)
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onOpen(nil)
                } label: {
                    Text(L.t("See Trader Land", "Ver Trader Land"))
                        .font(.rounded(12.5, .semibold))
                        .foregroundStyle(Theme.accentSoft)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(height: 31)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("harvest-secondary")
            }
        }
    }

    // MARK: Horizon

    /// The tapped horizon while it waits for its confirmation, or the one on its way to the server.
    private func pendingChoice(at now: Date) -> LandHorizon? {
        if let inFlight = moment.extending { return inFlight }
        guard let proposed, moment.extendOptions(at: now).contains(proposed) else { return nil }
        return proposed
    }

    /// Patience decides the piece: the planted 24 h, or 3 or 7 days for a bigger piece.
    /// Upward only, confirmed once, never while an answer is on its way, never once the review opened.
    private func horizonChoice(now: Date) -> some View {
        let options = moment.extendOptions(at: now)
        let pending = pendingChoice(at: now)
        return VStack(alignment: .leading, spacing: 6) {
            Text(L.t("PATIENCE DECIDES THE PIECE", "LA PACIENCIA DECIDE LA PIEZA"))
                .font(.mono(7.5, .bold))
                .kerning(1.3)
                .foregroundStyle(Theme.muted)
                .accessibilityAddTraits(.isHeader)
            ForEach(LandHorizon.allCases) { horizonChip($0, options: options, pending: pending) }
            if let pending { confirmStep(pending) }
            if let error = moment.extendError {
                Label(error, systemImage: "exclamationmark.circle")
                    .font(.rounded(11, .medium))
                    .foregroundStyle(Theme.down.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("harvest-horizon-error")
            }
        }
        .animation(.spring(duration: 0.3, bounce: 0.15), value: pending)
        .animation(.easeOut(duration: 0.2), value: moment.extendError)
    }

    private static func tierWord(_ h: LandHorizon) -> String {
        switch h {
        case .day: return L.t("common", "común")
        case .threeDays: return L.t("building", "edificio")
        case .week: return L.t("landmark", "monumento")
        }
    }

    /// "24 h · common 1×1", "3 days · building 2×1", "7 days · landmark 2×2".
    static func horizonLine(_ h: LandHorizon) -> String {
        "\(h.label) · \(tierWord(h)) \(h.footprintLabel)"
    }

    /// The same line for VoiceOver, which reads "×" as a multiplication: "3 days · building 2 by 1".
    static func spokenHorizonLine(_ h: LandHorizon) -> String {
        let (cols, rows) = h.footprint
        return "\(h.label) · \(tierWord(h)) " + L.t("\(cols) by \(rows)", "\(cols) por \(rows)")
    }

    /// What the confirm step asks, as VoiceOver announces it when it appears.
    static func confirmQuestion(_ h: LandHorizon) -> String {
        L.t("Extend to \(h.label)? You can't shorten it later.", "¿Extender a \(h.label)? No se puede acortar después.")
    }

    /// The piece a horizon blooms into: the seed's own for its horizon, the server's preview otherwise.
    private func bloomPiece(_ h: LandHorizon) -> RouteGrant.Piece? {
        h == moment.span ? piece ?? moment.tiers[h] : moment.tiers[h]
    }

    private func horizonChip(_ h: LandHorizon, options: [LandHorizon], pending: LandHorizon?) -> some View {
        let current = h == moment.span
        let open = moment.extending == nil && options.contains(h)
        let chosen = pending == h
        let bloom = bloomPiece(h)
        let spoken = Self.spokenHorizonLine(h) + (bloom.map { " · \($0.displayName)" } ?? "")
        let value = chosen ? L.t("Waiting for confirmation", "Esperando confirmación") : ""
        let hint = open && !chosen ? L.t("Asks you to confirm first", "Primero te pide confirmar") : ""
        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            proposed = chosen ? nil : h
        } label: {
            chipLabel(h, bloom: bloom, current: current, open: open, chosen: chosen)
        }
        .buttonStyle(HorizonChipStyle())
        .disabled(!open)
        // The seed's own horizon reads at full strength; closed ones step back.
        .opacity(current || open || chosen ? 1 : 0.45)
        .accessibilityIdentifier("harvest-horizon-\(Self.horizonKey(h))")
        .accessibilityLabel(spoken)
        .accessibilityValue(value)
        .accessibilityHint(hint)
        .accessibilityAddTraits(current ? .isSelected : [])
    }

    private func chipLabel(_ h: LandHorizon, bloom: RouteGrant.Piece?, current: Bool, open: Bool, chosen: Bool) -> some View {
        let ink = chosen ? Theme.accentSoft : Theme.text
        let fill = current ? tone.opacity(0.16) : chosen ? Theme.accent.opacity(0.07) : Theme.cardSoft
        let edge = current ? tone.opacity(0.5) : chosen ? Theme.accentSoft.opacity(0.8) : Theme.stroke
        let mark = current ? "checkmark.circle.fill" : chosen ? "largecircle.fill.circle" : open ? "circle" : "lock.fill"
        let markInk = current ? tone : chosen ? Theme.accent : Theme.muted
        return HStack(spacing: 8) {
            chipThumb(h, bloom: bloom, ink: ink, lit: current || chosen)
            chipText(h, bloom: bloom, ink: ink)
            Image(systemName: mark)
                .font(.system(size: current || chosen || open ? 13 : 9, weight: .bold))
                .foregroundStyle(markInk)
                .frame(width: 15)
        }
        .padding(.leading, 4)
        .padding(.trailing, 10)
        .padding(.vertical, 4)
        .frame(minHeight: 34)
        .background(Capsule().fill(fill))
        // Dashed while it waits for its confirmation: proposed, not the seed's yet.
        .overlay(Capsule().stroke(edge, style: StrokeStyle(lineWidth: 1, dash: chosen ? [4, 3] : [])))
        .contentShape(Capsule())
    }

    private func chipThumb(_ h: LandHorizon, bloom: RouteGrant.Piece?, ink: Color, lit: Bool) -> some View {
        Group {
            if let art = bloom.flatMap({ TraderLandArt.thumb($0.id) }) {
                Image(uiImage: art).resizable().scaledToFit().scaleEffect(Self.thumbScale(bloom))
            } else {
                Image(systemName: h == .day ? "square.fill" : h == .threeDays ? "building.2.fill" : "building.columns.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(ink.opacity(0.8))
            }
        }
        .frame(width: 26, height: 26)
        .background(Circle().fill(Theme.panel.opacity(0.9)))
        .clipShape(Circle())
        .saturation(lit ? 1 : 0.55)
    }

    /// One line when the piece's name fits beside its horizon; a long name (a Spanish
    /// landmark on a 375 pt phone) moves under it instead of being cut.
    private func chipText(_ h: LandHorizon, bloom: RouteGrant.Piece?, ink: Color) -> some View {
        let line = Text(Self.horizonLine(h))
            .font(.rounded(12, .bold))
            .foregroundStyle(ink)
            .lineLimit(1)
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                line.layoutPriority(1)
                Spacer(minLength: 6)
                if let bloom { pieceName(bloom) }
            }
            VStack(alignment: .leading, spacing: 1) {
                line
                if let bloom { pieceName(bloom).minimumScaleFactor(0.8) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func pieceName(_ piece: RouteGrant.Piece) -> some View {
        Text(piece.displayName)
            .font(.rounded(10.5, .medium))
            .foregroundStyle(Theme.text.opacity(0.58))
            .lineLimit(1)
    }

    /// Stable test ids: 24h, 3d, 7d.
    private static func horizonKey(_ h: LandHorizon) -> String {
        switch h {
        case .day: return "24h"
        case .threeDays: return "3d"
        case .week: return "7d"
        }
    }

    /// The one confirmation: what the longer horizon earns, and that it cannot come back.
    private func confirmStep(_ h: LandHorizon) -> some View {
        let busy = moment.extending == h
        let bloomLine: String
        if let bloom = bloomPiece(h) {
            bloomLine = L.t("It blooms into \(bloom.displayName) when you review it in \(h.label).",
                            "Florece como \(bloom.displayName) cuando la revises en \(h.label).")
        } else {
            bloomLine = L.t("It blooms into a bigger piece when you review it in \(h.label).",
                            "Florece como una pieza más grande cuando la revises en \(h.label).")
        }
        return VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(bloomLine)
                    .font(.rounded(11.5, .medium))
                    .foregroundStyle(Theme.text.opacity(0.78))
                Text(L.t("You can't shorten it later.", "No se puede acortar después."))
                    .font(.rounded(11.5, .bold))
                    .foregroundStyle(Theme.cio)
            }
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            HStack(spacing: 12) {
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    onExtend(h)
                } label: {
                    HStack(spacing: 6) {
                        if busy { ProgressView().controlSize(.mini).tint(.white) }
                        Text(busy ? L.t("Extending…", "Extendiendo…") : L.t("Extend to \(h.label)", "Extender a \(h.label)"))
                            .lineLimit(1)
                            .fixedSize()
                    }
                    .font(.rounded(12.5, .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 13)
                    .frame(height: 31)
                    .background(Capsule().fill(Theme.accent.opacity(busy ? 0.6 : 1)))
                }
                .buttonStyle(.plain)
                .disabled(busy)
                .accessibilityIdentifier("harvest-horizon-confirm")
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    proposed = nil
                } label: {
                    Text(L.t("Keep \(moment.span.label)", "Dejar en \(moment.span.label)"))
                        .font(.rounded(12.5, .semibold))
                        .foregroundStyle(Theme.accentSoft)
                        .lineLimit(1)
                        .frame(height: 31)
                }
                .buttonStyle(.plain)
                .disabled(busy)
                .opacity(busy ? 0.4 : 1)
                .accessibilityIdentifier("harvest-horizon-cancel")
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.panel.opacity(0.78)))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.accent.opacity(0.3), lineWidth: 1))
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private func primary(_ label: String, arrow: Bool = true, _ action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            action()
        } label: {
            HStack(spacing: 5) {
                Text(label).lineLimit(1).fixedSize()
                if arrow { Image(systemName: "arrow.right").font(.system(size: 10, weight: .black)) }
            }
            .font(.rounded(12.5, .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 13)
            .frame(height: 31)
            .background(Capsule().fill(Theme.accent))
            .shadow(color: Theme.accent.opacity(0.28), radius: 8)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("harvest-primary")
    }

    private func secondary(_ label: String, _ action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            Text(label)
                .font(.rounded(12.5, .semibold))
                .foregroundStyle(Theme.accentSoft)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .padding(.horizontal, 13)
                .frame(height: 31)
                .background(Capsule().fill(Theme.cardSoft))
                .overlay(Capsule().stroke(Theme.accent.opacity(0.28), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("harvest-secondary")
    }
}

#if DEBUG
/// `-qa-harvest <seed|picker|seed-3d|seed-7d|bloomed|capped|signedout|syncing|complete|pending|all>`:
/// the harvest card states on a desk background, for screenshots and UI tests. `seed` is a
/// server before Growth v1 (no horizon); `picker` is a fresh 24 h seed with its choice, and
/// `seed-3d` / `seed-7d` are seeds already grown. Only by name: `review-open` (the server said
/// extendable, but its review opened since), `picker-closing` (it opens 6 s after launch) and
/// `picker-long` (the longest landmark name, for narrow phones). Fixture data, DEBUG only: an
/// extend here answers locally after a beat, through the same transitions as the desk.
struct HarvestQAFixtureView: View {
    let state: String
    /// Cards an extend changed, by fixture key.
    @State private var grown: [String: HarvestMoment] = [:]

    private typealias Piece = RouteGrant.Piece
    private static let thesis = AwardThesis.make(symbol: "BTC", isEquity: false, direction: "long", price: 64210.5, entry: 64000, stop: 62500, target: 67000)
    private static let seedPiece = Piece(id: "risk_reef_dual_orbit_antenna", world: "risk_reef", kind: "decor", nameEN: "Dual Orbit Antenna", footprint: [1, 1])
    private static let bloomPiece = Piece(id: "thesis_citadel_risk_shield", world: "thesis_citadel", kind: "decor", nameEN: "Risk Shield", footprint: [1, 1])
    /// The first building and landmark of their tier sequences (GROWTH-v1 §1).
    private static let tiers: [LandHorizon: Piece] = [
        .day: seedPiece,
        .threeDays: Piece(id: "thesis_citadel_double_gate", world: "thesis_citadel", kind: "building", nameEN: "Double Gate", footprint: [2, 1]),
        .week: Piece(id: "crypto_bay_waiting_lighthouse", world: "crypto_bay", kind: "landmark", nameEN: "Waiting Lighthouse", footprint: [2, 2]),
    ]

    private static func horizon(_ h: LandHorizon, opensIn seconds: TimeInterval? = nil) -> RouteGrant.Horizon {
        RouteGrant.Horizon(hours: h, reviewAt: Date(timeIntervalSinceNow: seconds ?? Double(h.hours) * 3600),
                           extendable: !h.upward.isEmpty, extendTo: h.upward)
    }

    private static func seed(_ h: LandHorizon, opensIn seconds: TimeInterval? = nil,
                             previews: [LandHorizon: Piece] = HarvestQAFixtureView.tiers) -> HarvestMoment {
        var moment = HarvestMoment(eventID: "qa-\(h.hours)", noTrade: false, thesis: thesis, xp: 10, stage: .seed(previews[h] ?? seedPiece))
        moment.inventoryID = "qa-inventory-\(h.hours)"
        moment.ownerID = "qa-owner"
        moment.horizon = horizon(h, opensIn: seconds)
        moment.tiers = previews
        return moment
    }

    /// Built once: a card keeps its identity across renders (its confirm step lives on it).
    private static let fixtures: [String: HarvestMoment] = [
        "seed": HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .seed(seedPiece)),
        "picker": seed(.day),
        "seed-3d": seed(.threeDays),
        "seed-7d": seed(.week),
        "review-open": seed(.day, opensIn: -60),
        "picker-closing": seed(.day, opensIn: 6),
        // The 4th landmark of the sequence: the longest Spanish name ("Ciudadela de Tres Puertas").
        "picker-long": seed(.day, previews: tiers.merging([.week: Piece(id: "thesis_citadel_three_gate_citadel", world: "thesis_citadel", kind: "landmark",
                                                                     nameEN: "Three Gate Citadel", footprint: [2, 2])]) { $1 }),
        "bloomed": HarvestMoment(eventID: "qa", noTrade: true, thesis: thesis, xp: 20, stage: .bloomed(bloomPiece)),
        "capped": HarvestMoment(eventID: nil, noTrade: false, thesis: thesis, xp: 0, stage: .capped),
        "signedout": HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .signedOut(planted: true)),
        "syncing": HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .syncing),
        "complete": HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .routeComplete),
        "pending": HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .pending),
    ]
    private static let order = ["syncing", "seed", "picker", "seed-3d", "seed-7d", "bloomed", "capped", "complete", "signedout", "pending"]

    private var keys: [String] { Self.fixtures[state] == nil ? Self.order : [state] }

    private func moment(_ key: String) -> HarvestMoment? { grown[key] ?? Self.fixtures[key] }

    private func extend(_ key: String, to target: LandHorizon) {
        guard let current = moment(key), let eventID = current.eventID, let inventoryID = current.inventoryID,
              let started = current.startingExtend(to: target), let piece = current.tiers[target] else { return }
        grown[key] = started
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
            let answer = DeskSeedExtender.Extended(inventoryID: inventoryID, item: piece, horizon: Self.horizon(target))
            guard let settled = HarvestMoment.settlingExtend(grown[key], eventID: eventID, inventoryID: inventoryID, target: target,
                                                             result: .success(answer)) else { return }
            withAnimation(.spring(duration: 0.45, bounce: 0.2)) { grown[key] = settled }
        }
    }

    var body: some View {
        ZStack {
            KineticBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        Text("QA // HARVEST").font(.mono(13, .bold)).kerning(2.6).foregroundStyle(Theme.text.opacity(0.85))
                        Spacer()
                        LandChip(badge: 2) {}
                        LandChip(badge: 0) {}
                    }
                    .padding(.vertical, 6)
                    ForEach(keys, id: \.self) { key in
                        if let m = moment(key) {
                            Text(key.uppercased()).font(.mono(8, .bold)).kerning(1.4).foregroundStyle(Theme.muted)
                            HarvestCard(moment: m, onOpen: { _ in }, onSaveProgress: {}, onExtend: { extend(key, to: $0) })
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
        }
    }
}
#endif
