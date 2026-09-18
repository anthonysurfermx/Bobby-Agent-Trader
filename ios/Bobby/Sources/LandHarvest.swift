// The desk → Trader Land bridge. Every finished read plants the next route
// piece on the server (a seed for a read, a bloomed piece for a respected
// NO TRADE); the harvest card says so right where the read ends, and the
// header chip keeps the island one tap away with what is waiting there.
import SwiftUI
import Combine

/// What a finished desk read did on the island.
struct HarvestMoment: Identifiable, Equatable {
    enum Stage: Equatable {
        /// Signed in, waiting for /api/progress.
        case syncing
        /// A read planted a seed: it blooms when its thesis is reviewed in 24 h.
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

/// A light read of the account island for the desk chip: pieces waiting to be
/// built and theses waiting to be reviewed. Signed out or failing: no badge, no noise.
@MainActor
final class LandPulse: ObservableObject {
    @Published private(set) var readyToBuild = 0
    @Published private(set) var reviewsReady = 0
    @Published private(set) var firstReadyItemID: String?
    private var inflight = false
    private let transport: URLSession

    init(transport: URLSession = .shared) { self.transport = transport }

    var badge: Int { readyToBuild + reviewsReady }

    /// Where the chip opens the island: the reviews first, then a piece to build.
    var focus: TraderLandFocus? {
        if reviewsReady > 0 { return .review }
        return firstReadyItemID.map { .build(itemID: $0) }
    }

    func refresh() async {
        guard let userID = AccountSession.shared.session?.userId else { apply(nil); return }
        guard !inflight else { return }
        inflight = true
        defer { inflight = false }
        guard let token = await AccountSession.shared.accessToken() else { return }
        var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/trader-land"))
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (data, response) = try? await transport.data(for: request),
              (200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0),
              let world = try? JSONDecoder().decode(TraderLandWorld.self, from: data), world.ok,
              AccountSession.shared.session?.userId == userID else { return }
        apply(world)
    }

    func apply(_ world: TraderLandWorld?) {
        readyToBuild = world?.readyToBuild ?? 0
        reviewsReady = world?.reviewsReady ?? 0
        firstReadyItemID = world?.inventory.first { $0.state == "bloomed" && !$0.placed }?.item_id
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

/// The reward line under a finished read: which piece it planted on the
/// island, why, and the one tap that goes there.
struct HarvestCard: View {
    let moment: HarvestMoment
    let onOpen: (TraderLandFocus?) -> Void
    let onSaveProgress: () -> Void

    var body: some View {
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
                        // The NO TRADE card above already shows its XP.
                        if !moment.noTrade, moment.xp > 0 {
                            Text("+\(moment.xp) XP")
                                .font(.mono(8.5, .black))
                                .foregroundStyle(Theme.up)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Theme.up.opacity(0.10)))
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
        .padding(12)
        .background(
            LinearGradient(colors: [tone.opacity(0.11), Theme.card], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(tone.opacity(0.26), lineWidth: 1))
        .transition(.scale(scale: 0.94).combined(with: .opacity))
        .accessibilityIdentifier("desk-harvest")
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
        case .seed: return Theme.up
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
                    Image(uiImage: art).resizable().scaledToFit().scaleEffect(1.3)
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
            if let thesis = moment.thesis {
                return L.t("It blooms when you review this thesis in 24 h: \(thesis.line).",
                           "Florece cuando revises esta tesis en 24 h: \(thesis.line).")
            }
            return L.t("It blooms when you review this read in 24 h.", "Florece cuando revises esta lectura en 24 h.")
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
            primary(L.t("See it on my island", "Verla en mi isla")) { onOpen(nil) }
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
/// `-qa-harvest <seed|bloomed|capped|signedout|syncing|complete|pending|all>`:
/// the harvest card states on a desk background, for screenshots. Fixture data, DEBUG only.
struct HarvestQAFixtureView: View {
    let state: String

    private static let thesis = AwardThesis.make(symbol: "BTC", isEquity: false, direction: "long", price: 64210.5, entry: 64000, stop: 62500, target: 67000)
    private static let seedPiece = RouteGrant.Piece(id: "risk_reef_dual_orbit_antenna", world: "risk_reef", kind: "decor", nameEN: "Dual Orbit Antenna", footprint: [1, 1])
    private static let bloomPiece = RouteGrant.Piece(id: "thesis_citadel_risk_shield", world: "thesis_citadel", kind: "decor", nameEN: "Risk Shield", footprint: [1, 1])

    private static func moment(_ key: String) -> HarvestMoment? {
        switch key {
        case "seed": return HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .seed(seedPiece))
        case "bloomed": return HarvestMoment(eventID: "qa", noTrade: true, thesis: thesis, xp: 20, stage: .bloomed(bloomPiece))
        case "capped": return HarvestMoment(eventID: nil, noTrade: false, thesis: thesis, xp: 0, stage: .capped)
        case "signedout": return HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .signedOut(planted: true))
        case "syncing": return HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .syncing)
        case "complete": return HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .routeComplete)
        case "pending": return HarvestMoment(eventID: "qa", noTrade: false, thesis: thesis, xp: 10, stage: .pending)
        default: return nil
        }
    }

    private var keys: [String] {
        Self.moment(state) == nil ? ["syncing", "seed", "bloomed", "capped", "complete", "signedout", "pending"] : [state]
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
                        if let m = Self.moment(key) {
                            Text(key.uppercased()).font(.mono(8, .bold)).kerning(1.4).foregroundStyle(Theme.muted)
                            HarvestCard(moment: m, onOpen: { _ in }, onSaveProgress: {})
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
