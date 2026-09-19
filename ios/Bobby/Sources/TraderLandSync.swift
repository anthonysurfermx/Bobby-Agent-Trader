import Foundation
import Combine

/// The same authenticated contract used by the web island. Practice data is
/// deliberately never uploaded or used as a fallback for an account world.
/// Growth v1 fields (docs/trader-land/GROWTH-v1.md §3) are all optional, so a
/// world from an older API still decodes.
struct TraderLandWorld: Decodable {
    struct Land: Decodable {
        /// Where the Aura Core stands and whether it woke (stage 0 dormant, 1 awake).
        struct Core: Decodable { let x: Int; let y: Int; let stage: Int }
        /// Occupied cells (pieces + the core) against the next growth step; nil at full size.
        struct Growth: Decodable { let occupied: Int; let threshold: Int?; let nextSize: Int? }
        let size: Int
        let theme: String
        let core: Core?
        let growth: Growth?
    }
    struct Inventory: Decodable, Identifiable {
        let id: String
        let item_id: String
        let state: String
        let placed: Bool
        let source: String?
        let review: SeedReview?
        let seeded_at: String?
        let bloomed_at: String?
        let horizon: Horizon?
    }
    /// A seed waits on the thesis it was read with; the server says when it can be reviewed.
    struct SeedReview: Decodable {
        struct Thesis: Decodable { let symbol: String; let direction: String; let price: Double?; let entry: Double? }
        let thesis: Thesis?
        let reviewAt: String
        let ready: Bool
    }
    /// How long a seed's thesis plays out (24 h / 3 days / 7 days) and whether it can still be extended.
    struct Horizon: Decodable {
        let hours: Int
        let tier: String
        let reviewAt: String?
        let extendable: Bool?
        let extendTo: [Int]?

        var value: LandHorizon? { LandHorizon(rawValue: hours) }
        /// Horizons the builder may still pick: upward only, before the review opens.
        var options: [LandHorizon] {
            guard extendable == true else { return [] }
            return (extendTo ?? []).compactMap(LandHorizon.init(rawValue:)).filter { $0.hours > hours }.sorted { $0.hours < $1.hours }
        }
    }
    struct Bilingual: Decodable { let en: String; let es: String; var text: String { L.t(en, es) } }
    /// `PieceSummary` on the server. Only the id is required; a malformed name never breaks the world.
    struct Piece: Decodable {
        let id: String
        let world: String?
        let kind: String?
        let name: Bilingual?
        let footprint: [Int]?

        private enum CodingKeys: String, CodingKey { case id, world, kind, name, footprint }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            world = try? c.decodeIfPresent(String.self, forKey: .world)
            kind = try? c.decodeIfPresent(String.self, forKey: .kind)
            name = try? c.decodeIfPresent(Bilingual.self, forKey: .name)
            footprint = try? c.decodeIfPresent([Int].self, forKey: .footprint)
        }
    }
    /// One horizon tier's repeating sequence: what the next seed of that horizon blooms into.
    struct Tier: Decodable {
        let id: String
        let hours: Int
        let footprint: [Int]?
        let length: Int?
        let held: Int?
        let next: Piece?
    }
    struct Season: Decodable { let name: Bilingual; let total: Int; let earned: Int; let next: String?; let complete: Bool }
    struct Share: Decodable { let `public`: Bool; let code: String?; let title: String?; let publishedAt: String? }
    /// The legacy Discovery Route (kept by the server for build 31); `tiers` replaces it.
    struct Route: Decodable {
        struct Next: Decodable { let id: String; let world: String? }
        let index: Int
        let total: Int
        let next: Next?
        let complete: Bool
    }
    /// Server count of seeds whose review is already open.
    struct ReviewWindow: Decodable { let windowHours: Int?; let ready: Int? }
    struct Capabilities: Decodable {
        let move: Bool?
        let close: Bool?
        let extend: Bool?
        let moveCore: Bool?
        let grow: Bool?
    }
    /// Present only on the response to a `close` action.
    struct Closed: Decodable {
        struct Piece: Decodable { let id: String }
        struct SeasonAward: Decodable { let piece: Piece? }
        struct Execution: Decodable { let xp: Int; let aura: Int }
        let itemId: String
        let outcome: String
        let symbol: String?
        let direction: String?
        let movePct: Double?
        let xp: Int
        let aura: Int
        let executed: Execution?
        let season: SeasonAward?
    }
    /// Present only on a `place` response that made the island grow a ring.
    struct Grew: Decodable { let from: Int; let to: Int; let shift: Int }
    /// Present only on the response to an `extend` action.
    struct Extended: Decodable { let inventoryId: String; let item: Piece?; let horizon: Horizon? }
    /// Present only on the response to a `move_core` action.
    struct CoreMoved: Decodable { let x: Int; let y: Int }
    struct Placement: Decodable, Identifiable {
        let id: String
        let inventory_id: String
        let x: Int
        let y: Int
        let rotation: Int
    }
    let ok: Bool
    let land: Land
    let inventory: [Inventory]
    let placements: [Placement]
    let xp: Int
    let aura: Int
    let capabilities: Capabilities?
    let share: Share?
    let season: Season?
    let closed: Closed?
    let route: Route?
    let review: ReviewWindow?
    let tiers: [Tier]?
    let grew: Grew?
    let extended: Extended?
    let coreMoved: CoreMoved?

    /// The Aura Core from the land; 3,3 awake when an older server sends none.
    var core: LandCore { land.core.map { LandCore(col: $0.x, row: $0.y, stage: $0.stage) } ?? .practice }
    /// The tier a horizon blooms into, with its next piece.
    func tier(_ horizon: LandHorizon) -> Tier? { tiers?.first { $0.hours == horizon.hours || $0.id == horizon.tier } }

    /// Pieces that bloomed and wait in the collection.
    var readyToBuild: Int { inventory.filter { $0.state == "bloomed" && !$0.placed }.count }
    /// Seeds whose thesis can be reviewed now.
    var reviewsReady: Int { inventory.filter { $0.state == "seed" && $0.review?.ready == true }.count }
    /// Seeds still waiting for the market.
    var seedsGrowing: Int { inventory.filter { $0.state == "seed" && $0.review?.ready != true }.count }
}

extension LandCore {
    /// The core an island draws and reserves. The practice island's stands at 3,3, awake. An
    /// account island's comes from its world only: while the first world loads, or when that load
    /// fails, there is none, rather than a guessed 3,3 awake core that jumps when the world lands.
    static func standing(accountIsland: Bool, world: TraderLandWorld?) -> LandCore? {
        accountIsland ? world?.core : .practice
    }
}

/// Where the desk asks Trader Land to open.
enum TraderLandFocus: Equatable {
    /// A bloomed piece is waiting: open the collection on it, ready to build.
    case build(itemID: String)
    /// Open the collection on the theses to review.
    case review
    /// A seed just planted on the desk: open the reviews on its row, where its horizon can grow.
    case seed(inventoryID: String)
}

enum TraderLandCatalog {
    /// Database ids whose art ships under another manifest id (web: CATALOG_ALIASES).
    static let aliases = ["axiom_archive_return_path": "axiom_archive_return_path_curve"]
    static func artID(_ id: String) -> String { aliases[id] ?? id }

    static let districts = ["crypto_bay", "evidence_mines", "thesis_citadel", "risk_reef", "axiom_archive"]

    /// Spanish display names for the bundled pieces and districts. The English
    /// side is derived from the id; an id missing here falls back to it.
    private static let namesES: [String: String] = [
        "aura_core": "Núcleo de Aura",
        "crypto_bay_data_dock": "Muelle de Datos",
        "crypto_bay_water_walkway": "Pasarela de Agua",
        "crypto_bay_context_buoy": "Boya de Contexto",
        "crypto_bay_candle_tower": "Torre de Velas",
        "crypto_bay_waiting_lighthouse": "Faro de la Espera",
        "evidence_mines_crystal_vein_rock": "Roca con Veta de Cristal",
        "evidence_mines_open_tunnel": "Túnel Abierto",
        "evidence_mines_lantern_drone": "Dron Linterna",
        "evidence_mines_evidence_workshop": "Taller de Evidencia",
        "evidence_mines_mother_crystal": "Cristal Madre",
        "thesis_citadel_wall_slab": "Losa de Muralla",
        "thesis_citadel_fortified_ramp": "Rampa Fortificada",
        "thesis_citadel_risk_shield": "Escudo de Riesgo",
        "thesis_citadel_double_gate": "Puerta Doble",
        "thesis_citadel_three_gate_citadel": "Ciudadela de Tres Puertas",
        "risk_reef_reef_tile": "Loseta de Arrecife",
        "risk_reef_blue_sluice": "Compuerta Azul",
        "risk_reef_dual_orbit_antenna": "Antena de Doble Órbita",
        "risk_reef_red_team_observatory": "Observatorio del Crítico",
        "risk_reef_double_bridge": "Puente Doble",
        "axiom_archive_archive_ring_tile": "Loseta del Anillo",
        "axiom_archive_path_straight": "Camino Recto",
        "axiom_archive_return_path_curve": "Curva de Regreso",
        "axiom_archive_aura_flower": "Flor de Aura",
        "axiom_archive_lit_archive": "Archivo Iluminado",
        "axiom_archive_base_ring_seal": "Sello del Anillo Base",
    ]
    private static let districtNamesES: [String: String] = [
        "crypto_bay": "Bahía Cripto",
        "evidence_mines": "Minas de Evidencia",
        "thesis_citadel": "Ciudadela de Tesis",
        "risk_reef": "Arrecife de Riesgo",
        "axiom_archive": "Archivo de Axiomas",
    ]

    /// Display name of a piece id (database or manifest id) in the reader's language.
    static func name(_ id: String, district: String? = nil) -> String {
        let art = artID(id)
        let district = district ?? districts.first { art.hasPrefix($0 + "_") }
        var en = art
        if let district { en = en.replacingOccurrences(of: district + "_", with: "") }
        en = en.replacingOccurrences(of: "_", with: " ").capitalized
        return L.t(en, namesES[art] ?? en)
    }

    static func districtName(_ id: String) -> String {
        let en = id.replacingOccurrences(of: "_", with: " ").capitalized
        return L.t(en, districtNamesES[id] ?? en)
    }
}

enum TraderLandMutation {
    case place(inventoryID: String, x: Int, y: Int, rotation: Int)
    case move(placementID: String, x: Int, y: Int, rotation: Int)
    case remove(placementID: String)
    case close(inventoryID: String)
    case publish(title: String)
    case unpublish
    /// Give a seed a longer horizon (72 or 168 h): upward only, before its review opens.
    case extend(inventoryID: String, hours: Int)
    /// Move the Aura Core's 2×2 to (x, y).
    case moveCore(x: Int, y: Int)

    var body: [String: Any] {
        switch self {
        case let .place(id, x, y, rotation):
            return ["action": "place", "inventoryId": id, "x": x, "y": y, "rotation": rotation]
        case let .move(id, x, y, rotation):
            return ["action": "move", "placementId": id, "x": x, "y": y, "rotation": rotation]
        case let .remove(id):
            return ["action": "remove", "placementId": id]
        case let .close(id):
            return ["action": "close", "inventoryId": id, "tzOffsetMin": -TimeZone.current.secondsFromGMT() / 60, "platform": "ios"]
        case let .publish(title):
            return ["action": "publish", "title": String(title.prefix(80))]
        case .unpublish:
            return ["action": "unpublish"]
        case let .extend(id, hours):
            return ["action": "extend", "inventoryId": id, "hours": hours]
        case let .moveCore(x, y):
            return ["action": "move_core", "x": x, "y": y]
        }
    }
}

extension TraderLandMutation {
    /// The request body. place / move / move_core coordinates are on the island as this
    /// client drew it, so they carry that size; the server refuses a stale one with 409
    /// (the island grew on another device). docs/trader-land/GROWTH-v1.md §3.
    func payload(drawnOn size: Int?) -> [String: Any] {
        var body = self.body
        switch self {
        case .place, .move, .moveCore:
            if let size { body["size"] = size }
        default:
            break
        }
        return body
    }
}

@MainActor
final class TraderLandSync: ObservableObject {
    /// Clients that implement GROWTH-v1 say so on every request; only they may grow an island.
    nonisolated static let clientHeader = "X-Trader-Land-Client"
    nonisolated static let clientVersion = "2"

    @Published private(set) var world: TraderLandWorld?
    @Published private(set) var busy = false
    @Published private(set) var error: String?
    private var generation = UUID()
    private var ownerID: String?
    private let transport: URLSession

    init(transport: URLSession = .shared) { self.transport = transport }

    func reset() {
        generation = UUID(); ownerID = nil; world = nil; error = nil; busy = false
#if DEBUG
        fixture = nil
#endif
    }

    func load() async {
        guard !busy else { return }
#if DEBUG
        if let fixture { error = nil; world = fixture.world(); return }
#endif
        if ownerID != AccountSession.shared.session?.userId { reset() }
        _ = await request(nil)
    }

    func mutate(_ action: TraderLandMutation) async -> TraderLandWorld? {
#if DEBUG
        if let fixture {
            guard !busy, error == nil, world != nil else { return nil }
            switch fixture.apply(action) {
            case let .success(result): world = result; return result
            case let .failure(refusal): error = Self.failure(status: refusal.status, serverError: refusal.error); return nil
            }
        }
#endif
        guard !busy, error == nil, world != nil, ownerID == AccountSession.shared.session?.userId else { return nil }
        return await request(action)
    }

#if DEBUG
    /// `-trader-land-account-fixture`: the account island served from memory, no network.
    private var fixture: TraderLandAccountFixture?

    func useFixture(_ fixture: TraderLandAccountFixture) {
        reset()
        self.fixture = fixture
        world = fixture.world()
    }
#endif

    /// What the player reads when the server refuses a request. Known refusals match exact server strings.
    nonisolated static func failure(status: Int, serverError: String?) -> String {
        switch (status, serverError ?? "") {
        case (409, "This piece already bloomed"):
            return L.t("This piece already bloomed. Reload your island.", "Esta pieza ya floreció. Recarga tu isla.")
        case (409, "The market has not had time to answer yet"):
            return L.t("The market has not had time to answer yet. Come back when the review opens.", "El mercado aún no ha tenido tiempo de responder. Vuelve cuando se abra la revisión.")
        case (409, "This seed already bloomed"):
            return L.t("This seed already bloomed. Reload your island.", "Esta semilla ya floreció. Recarga tu isla.")
        case (409, "Its review is already open"):
            return L.t("Its review is already open, so its horizon can no longer grow. Reload to review it.", "Su revisión ya está abierta, así que su horizonte ya no puede crecer. Recarga para revisarla.")
        case (400, "A horizon can only grow"):
            return L.t("A horizon can only grow. Reload your island.", "Un horizonte solo puede crecer. Recarga tu isla.")
        case (400, "Outside the island"):
            return L.t("That spot is outside the island. Reload before trying again.", "Ese lugar está fuera de la isla. Recarga antes de intentarlo de nuevo.")
        case (404, _):
            return L.t("That piece is no longer in your collection. Reload to check it.", "Esa pieza ya no está en tu colección. Recarga para comprobarlo.")
        case (409, _):
            return L.t("The island changed. Reload before trying again.", "La isla cambió. Recarga antes de intentarlo de nuevo.")
        case (401, _):
            return L.t("Sign in again to save your island.", "Inicia sesión de nuevo para guardar tu isla.")
        default:
            return L.t("Your island could not be updated. Reload to check its saved state.", "No se pudo actualizar tu isla. Recarga para comprobar su estado guardado.")
        }
    }

    private func request(_ action: TraderLandMutation?) async -> TraderLandWorld? {
        guard let userID = AccountSession.shared.session?.userId else { reset(); return nil }
        let epoch = generation
        ownerID = userID; busy = true; error = nil
        defer { if generation == epoch { busy = false } }
        do {
            guard let token = await AccountSession.shared.accessToken() else {
                throw URLError(.userAuthenticationRequired)
            }
            guard generation == epoch, AccountSession.shared.session?.userId == userID else { return nil }
            var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/trader-land"))
            request.timeoutInterval = 20
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue(Self.clientVersion, forHTTPHeaderField: Self.clientHeader)
            if let action {
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: action.payload(drawnOn: world?.land.size))
            }
            let (data, response) = try await transport.data(for: request)
            guard generation == epoch, AccountSession.shared.session?.userId == userID else { return nil }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else {
                let serverError = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                let message = Self.failure(status: status, serverError: serverError)
                throw NSError(domain: "TraderLand", code: status, userInfo: [NSLocalizedDescriptionKey: message])
            }
            let result = try JSONDecoder().decode(TraderLandWorld.self, from: data)
            guard result.ok, GateLayout.supports(result.land.size) else {
                throw NSError(domain: "TraderLand", code: 1, userInfo: [NSLocalizedDescriptionKey: L.t("This island version is not supported yet.", "Esta versión de isla todavía no es compatible.")])
            }
            world = result
            return result
        } catch {
            guard generation == epoch, AccountSession.shared.session?.userId == userID else { return nil }
            self.error = (error as NSError).domain == "TraderLand" ? error.localizedDescription
                : L.t("Connection interrupted. Reload to check your saved island; do not repeat the placement yet.", "Conexión interrumpida. Recarga para comprobar tu isla guardada; no repitas todavía la colocación.")
            return nil
        }
    }
}

extension LandHorizon {
    /// "3 days · building 2×1", the way an extend option names itself (GROWTH-v1 §4).
    var optionLabel: String { "\(label) · \(tierLabel.lowercased()) \(footprintLabel)" }
}

#if DEBUG
// MARK: QA fixture — `-trader-land-account-fixture` serves an account island from memory (Debug builds only).

/// A 10×10 account island with its core moved and dormant, a seed that can still grow to
/// 3 or 7 days, a seed ready to review and the three horizon tiers. No account, no network:
/// mutations follow the server rules (GROWTH-v1 §1–§3) closely enough to drive the UI in
/// tests and screenshots.
@MainActor final class TraderLandAccountFixture {
    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("-trader-land-account-fixture") }

    struct Refusal: Error { let status: Int; let error: String }

    /// The tier sequences of GROWTH-v1 §1 (`tl_items.tier`, `tier_index`).
    static let sequences: [(tier: String, hours: Int, footprint: [Int], ids: [String])] = [
        ("common", 24, [1, 1], ["crypto_bay_data_dock", "crypto_bay_water_walkway", "risk_reef_dual_orbit_antenna",
                                "thesis_citadel_risk_shield", "evidence_mines_crystal_vein_rock", "axiom_archive_return_path",
                                "axiom_archive_aura_flower", "crypto_bay_context_buoy", "evidence_mines_open_tunnel",
                                "evidence_mines_lantern_drone", "thesis_citadel_wall_slab", "thesis_citadel_fortified_ramp",
                                "risk_reef_reef_tile", "risk_reef_blue_sluice", "axiom_archive_archive_ring_tile"]),
        ("building", 72, [2, 1], ["thesis_citadel_double_gate", "crypto_bay_candle_tower", "evidence_mines_evidence_workshop",
                                  "risk_reef_red_team_observatory", "axiom_archive_lit_archive"]),
        ("landmark", 168, [2, 2], ["crypto_bay_waiting_lighthouse", "evidence_mines_mother_crystal", "risk_reef_double_bridge",
                                   "thesis_citadel_three_gate_citadel", "axiom_archive_base_ring_seal"]),
    ]

    private struct Row {
        let id: String
        var itemID: String
        var state: String
        var hours: Int
        let seededAt: Date
        var bloomedAt: Date?
        let thesis: [String: Any]?
    }
    private struct Spot { let id: String; let inventoryID: String; var x: Int; var y: Int; var rotation: Int }

    private let now: Date
    private var size = 10
    private var core = (x: 6, y: 2, stage: 0)
    private var rows: [Row]
    private var spots: [Spot]
    private var shareTitle: String?
    private var isPublic = false
    private var xp = 180
    private var aura = 36

    init(now: Date = Date()) {
        self.now = now
        let hour: TimeInterval = 3600
        rows = [
            Row(id: "fx-dock", itemID: "crypto_bay_data_dock", state: "bloomed", hours: 24, seededAt: now - 90 * hour, bloomedAt: now - 60 * hour, thesis: nil),
            Row(id: "fx-walkway", itemID: "crypto_bay_water_walkway", state: "bloomed", hours: 24, seededAt: now - 80 * hour, bloomedAt: now - 55 * hour, thesis: nil),
            Row(id: "fx-antenna", itemID: "risk_reef_dual_orbit_antenna", state: "bloomed", hours: 24, seededAt: now - 70 * hour, bloomedAt: now - 45 * hour, thesis: nil),
            Row(id: "fx-gate", itemID: "thesis_citadel_double_gate", state: "bloomed", hours: 72, seededAt: now - 140 * hour, bloomedAt: now - 66 * hour, thesis: nil),
            Row(id: "fx-shield", itemID: "thesis_citadel_risk_shield", state: "bloomed", hours: 24, seededAt: now - 40 * hour, bloomedAt: now - 14 * hour, thesis: nil),
            Row(id: "fx-seed-growing", itemID: "evidence_mines_crystal_vein_rock", state: "seed", hours: 24, seededAt: now - 4 * hour, bloomedAt: nil,
                thesis: ["symbol": "BTC", "direction": "long", "price": 64_250, "entry": NSNull()]),
            Row(id: "fx-seed-ready", itemID: "axiom_archive_return_path", state: "seed", hours: 24, seededAt: now - 26 * hour, bloomedAt: nil,
                thesis: ["symbol": "ETH", "direction": "short", "price": 2_480.5, "entry": NSNull()]),
        ]
        spots = [
            Spot(id: "fx-p-dock", inventoryID: "fx-dock", x: 2, y: 6, rotation: 0),
            Spot(id: "fx-p-walkway", inventoryID: "fx-walkway", x: 4, y: 7, rotation: 0),
            Spot(id: "fx-p-antenna", inventoryID: "fx-antenna", x: 7, y: 7, rotation: 0),
            Spot(id: "fx-p-gate", inventoryID: "fx-gate", x: 3, y: 3, rotation: 0),
        ]
    }

    // MARK: Rules

    private static func tier(of itemID: String) -> (tier: String, hours: Int, footprint: [Int], ids: [String])? {
        sequences.first { $0.ids.contains(itemID) }
    }
    private static func tier(hours: Int) -> (tier: String, hours: Int, footprint: [Int], ids: [String])? {
        sequences.first { $0.hours == hours }
    }
    /// n = route rows whose item is in the tier, in any state (the extended seed excluded).
    private func held(_ tier: String, excluding: String? = nil) -> Int {
        rows.filter { $0.id != excluding && Self.tier(of: $0.itemID)?.tier == tier }.count
    }
    private func next(_ tier: String, excluding: String? = nil) -> String? {
        guard let sequence = Self.sequences.first(where: { $0.tier == tier }) else { return nil }
        return sequence.ids[held(tier, excluding: excluding) % sequence.ids.count]
    }
    private func reviewAt(_ row: Row) -> Date { row.seededAt.addingTimeInterval(TimeInterval(row.hours) * 3600) }
    private func cells(_ spot: Spot) -> Set<String> {
        guard let row = rows.first(where: { $0.id == spot.inventoryID }),
              let item = RuntimeBundle.items[TraderLandCatalog.artID(row.itemID)] else { return [] }
        return landCells(item, LandPlacement(uid: spot.id, itemId: item.id, col: spot.x, row: spot.y, orientation: spot.rotation == 90 || spot.rotation == 270 ? .nwSE : .neSW))
    }
    private var occupied: Int { spots.reduce(4) { $0 + cells($1).count } }
    private func fits(_ cells: Set<String>, ignoring: String?) -> Bool {
        let layout = GateLayout(size: size)
        var taken = LandCore.cells(col: core.x, row: core.y)
        for spot in spots where spot.id != ignoring { taken.formUnion(self.cells(spot)) }
        return layout.contains(cells) && taken.isDisjoint(with: cells)
    }

    func apply(_ mutation: TraderLandMutation) -> Result<TraderLandWorld, Refusal> {
        var extra: [String: Any] = [:]
        switch mutation {
        case let .extend(id, hours):
            guard let index = rows.firstIndex(where: { $0.id == id }) else { return .failure(Refusal(status: 404, error: "not_found")) }
            guard rows[index].state == "seed" else { return .failure(Refusal(status: 409, error: "This seed already bloomed")) }
            guard [72, 168].contains(hours), hours > rows[index].hours, let tier = Self.tier(hours: hours) else {
                return .failure(Refusal(status: 400, error: "A horizon can only grow"))
            }
            guard now < reviewAt(rows[index]) else { return .failure(Refusal(status: 409, error: "Its review is already open")) }
            rows[index].itemID = next(tier.tier, excluding: id) ?? rows[index].itemID
            rows[index].hours = hours
            extra["extended"] = ["inventoryId": id, "item": piece(rows[index].itemID), "horizon": horizon(rows[index])]
        case let .moveCore(x, y):
            guard x >= 0, y >= 0, x + 2 <= size, y + 2 <= size else { return .failure(Refusal(status: 400, error: "Outside the island")) }
            var taken = Set<String>()
            for spot in spots { taken.formUnion(cells(spot)) }
            guard taken.isDisjoint(with: LandCore.cells(col: x, row: y)) else {
                return .failure(Refusal(status: 409, error: "The island changed. Reload before trying again."))
            }
            core.x = x; core.y = y
            extra["coreMoved"] = ["x": x, "y": y]
        case let .place(id, x, y, rotation):
            guard let row = rows.first(where: { $0.id == id && $0.state == "bloomed" }), !spots.contains(where: { $0.inventoryID == id }) else {
                return .failure(Refusal(status: 404, error: "Piece not in your inventory"))
            }
            let spot = Spot(id: "fx-p-\(row.id)-\(spots.count)", inventoryID: id, x: x, y: y, rotation: rotation)
            guard fits(cells(spot), ignoring: nil) else { return .failure(Refusal(status: 409, error: "The island changed. Reload before trying again.")) }
            spots.append(spot)
            extra["grew"] = Self.null(grow())
        case let .move(id, x, y, rotation):
            guard let index = spots.firstIndex(where: { $0.id == id }) else { return .failure(Refusal(status: 404, error: "Placement not found")) }
            var moved = spots[index]; moved.x = x; moved.y = y; moved.rotation = rotation
            guard fits(cells(moved), ignoring: id) else { return .failure(Refusal(status: 409, error: "The island changed. Reload before trying again.")) }
            spots[index] = moved
        case let .remove(id):
            spots.removeAll { $0.id == id }
        case let .close(id):
            guard let index = rows.firstIndex(where: { $0.id == id && $0.state == "seed" }) else {
                return .failure(Refusal(status: 409, error: "This piece already bloomed"))
            }
            guard reviewAt(rows[index]) <= now else { return .failure(Refusal(status: 409, error: "The market has not had time to answer yet")) }
            rows[index].state = "bloomed"; rows[index].bloomedAt = now
            xp += 12; aura += 3
            extra["closed"] = ["itemId": rows[index].itemID, "outcome": "expired", "symbol": Self.null(rows[index].thesis?["symbol"]),
                               "direction": Self.null(rows[index].thesis?["direction"]), "movePct": 0.8, "xp": 12, "aura": 3,
                               "executed": NSNull(), "season": ["piece": NSNull()]]
        case let .publish(title):
            isPublic = true; shareTitle = title.isEmpty ? nil : title
        case .unpublish:
            isPublic = false
        }
        return .success(world(extra))
    }

    /// The core wakes at five pieces; then the island grows a ring while it is full enough.
    private func grow() -> [String: Int]? {
        if spots.count >= 5 { core.stage = 1 }
        let from = size
        var shift = 0
        while let step = GateLayout.growth[size], occupied >= step.threshold {
            let delta = (step.next - size) / 2
            size = step.next; shift += delta
            core.x += delta; core.y += delta
            for index in spots.indices { spots[index].x += delta; spots[index].y += delta }
        }
        return size == from ? nil : ["from": from, "to": size, "shift": shift]
    }

    // MARK: Payload

    /// JSON null for a missing value.
    private static func null(_ value: Any?) -> Any { value ?? NSNull() }

    private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private func piece(_ id: String) -> [String: Any] {
        let item = RuntimeBundle.items[TraderLandCatalog.artID(id)]
        let name = TraderLandCatalog.name(id)
        return ["id": id, "world": item?.district ?? "", "attribution": "", "kind": item?.kind ?? "",
                "name": ["en": name, "es": name], "footprint": [item?.footprint.cols ?? 1, item?.footprint.rows ?? 1]]
    }

    private func horizon(_ row: Row) -> [String: Any] {
        let open = row.state != "seed" || now >= reviewAt(row)
        return ["hours": row.hours, "tier": Self.tier(hours: row.hours)?.tier ?? "common",
                "reviewAt": Self.iso.string(from: reviewAt(row)), "extendable": !open && row.hours < 168,
                "extendTo": open ? [] : [72, 168].filter { $0 > row.hours }]
    }

    func world(_ extra: [String: Any] = [:]) -> TraderLandWorld {
        let placedIDs = Set(spots.map(\.inventoryID))
        let inventory: [[String: Any]] = rows.map { row in
            var entry: [String: Any] = ["id": row.id, "item_id": row.itemID, "state": row.state, "source": "route",
                                        "placed": placedIDs.contains(row.id), "seeded_at": Self.iso.string(from: row.seededAt),
                                        "bloomed_at": Self.null(row.bloomedAt.map(Self.iso.string(from:))), "horizon": horizon(row)]
            entry["review"] = row.state == "seed"
                ? ["thesis": Self.null(row.thesis), "reviewAt": Self.iso.string(from: reviewAt(row)), "ready": now >= reviewAt(row)] as [String: Any]
                : NSNull()
            return entry
        }
        let step = GateLayout.growth[size]
        let commonNext = next("common") ?? ""
        var payload: [String: Any] = [
            "ok": true, "xp": xp, "aura": aura,
            "land": ["size": size, "theme": "default", "visibility": isPublic ? "public" : "private", "share_code": Self.null(isPublic ? "qafixture" : nil),
                     "title": Self.null(shareTitle), "published_at": NSNull(),
                     "core": ["x": core.x, "y": core.y, "stage": core.stage],
                     "growth": ["occupied": occupied, "threshold": Self.null(step?.threshold), "nextSize": Self.null(step?.next)] as [String: Any]] as [String: Any],
            "inventory": inventory,
            "placements": spots.map { ["id": $0.id, "inventory_id": $0.inventoryID, "x": $0.x, "y": $0.y, "rotation": $0.rotation] },
            "tiers": Self.sequences.map { tier -> [String: Any] in
                ["id": tier.tier, "hours": tier.hours, "footprint": tier.footprint, "length": tier.ids.count, "held": held(tier.tier),
                 "next": piece(next(tier.tier) ?? tier.ids[0])]
            },
            "route": ["index": held("common") % 15, "total": 15, "next": ["id": commonNext, "world": piece(commonNext)["world"] ?? ""], "complete": false],
            "review": ["windowHours": 24, "ready": rows.filter { $0.state == "seed" && now >= reviewAt($0) }.count],
            "capabilities": ["move": true, "close": true, "extend": true, "moveCore": true, "grow": true],
            "share": ["public": isPublic, "code": Self.null(isPublic ? "qafixture" : nil), "title": Self.null(shareTitle), "publishedAt": NSNull()],
        ]
        payload.merge(extra) { _, new in new }
        do {
            return try JSONDecoder().decode(TraderLandWorld.self, from: JSONSerialization.data(withJSONObject: payload))
        } catch {
            fatalError("Trader Land account fixture does not decode: \(error)")
        }
    }
}
#endif
