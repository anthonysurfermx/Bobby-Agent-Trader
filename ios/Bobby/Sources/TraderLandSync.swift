import Foundation
import Combine

/// The same authenticated contract used by the web island. Practice data is
/// deliberately never uploaded or used as a fallback for an account world.
struct TraderLandWorld: Decodable {
    struct Land: Decodable { let size: Int; let theme: String }
    struct Inventory: Decodable, Identifiable {
        let id: String
        let item_id: String
        let state: String
        let placed: Bool
        let source: String?
        let review: SeedReview?
        let seeded_at: String?
        let bloomed_at: String?
    }
    /// A seed waits on the thesis it was read with; the server says when it can be reviewed.
    struct SeedReview: Decodable {
        struct Thesis: Decodable { let symbol: String; let direction: String; let price: Double?; let entry: Double? }
        let thesis: Thesis?
        let reviewAt: String
        let ready: Bool
    }
    struct Bilingual: Decodable { let en: String; let es: String; var text: String { L.t(en, es) } }
    struct Season: Decodable { let name: Bilingual; let total: Int; let earned: Int; let next: String?; let complete: Bool }
    struct Share: Decodable { let `public`: Bool; let code: String?; let title: String?; let publishedAt: String? }
    /// The Discovery Route: every awarded read or respected no-trade grants the next piece.
    struct Route: Decodable {
        struct Next: Decodable { let id: String; let world: String? }
        let index: Int
        let total: Int
        let next: Next?
        let complete: Bool
    }
    /// Server count of seeds whose 24 h review window is already open.
    struct ReviewWindow: Decodable { let windowHours: Int?; let ready: Int? }
    struct Capabilities: Decodable { let move: Bool?; let close: Bool? }
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

    /// Pieces that bloomed and wait in the collection.
    var readyToBuild: Int { inventory.filter { $0.state == "bloomed" && !$0.placed }.count }
    /// Seeds whose thesis can be reviewed now.
    var reviewsReady: Int { inventory.filter { $0.state == "seed" && $0.review?.ready == true }.count }
    /// Seeds still waiting for the market.
    var seedsGrowing: Int { inventory.filter { $0.state == "seed" && $0.review?.ready != true }.count }
}

/// Where the desk asks Trader Land to open.
enum TraderLandFocus: Equatable {
    /// A bloomed piece is waiting: open the collection on it, ready to build.
    case build(itemID: String)
    /// Open the collection on the theses to review.
    case review
}

enum TraderLandCatalog {
    /// Database ids whose art ships under another manifest id (web: CATALOG_ALIASES).
    static let aliases = ["axiom_archive_return_path": "axiom_archive_return_path_curve"]
    static func artID(_ id: String) -> String { aliases[id] ?? id }
}

enum TraderLandMutation {
    case place(inventoryID: String, x: Int, y: Int, rotation: Int)
    case move(placementID: String, x: Int, y: Int, rotation: Int)
    case remove(placementID: String)
    case close(inventoryID: String)
    case publish(title: String)
    case unpublish

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
        }
    }
}

@MainActor
final class TraderLandSync: ObservableObject {
    @Published private(set) var world: TraderLandWorld?
    @Published private(set) var busy = false
    @Published private(set) var error: String?
    private var generation = UUID()
    private var ownerID: String?
    private let transport: URLSession

    init(transport: URLSession = .shared) { self.transport = transport }

    func reset() {
        generation = UUID(); ownerID = nil; world = nil; error = nil; busy = false
    }

    func load() async {
        guard !busy else { return }
        if ownerID != AccountSession.shared.session?.userId { reset() }
        _ = await request(nil)
    }

    func mutate(_ action: TraderLandMutation) async -> TraderLandWorld? {
        guard !busy, error == nil, world != nil, ownerID == AccountSession.shared.session?.userId else { return nil }
        return await request(action)
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
            if let action {
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: action.body)
            }
            let (data, response) = try await transport.data(for: request)
            guard generation == epoch, AccountSession.shared.session?.userId == userID else { return nil }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else {
                let serverError = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                let message = status == 409 && serverError == "This piece already bloomed"
                    ? L.t("This piece already bloomed. Reload your island.", "Esta pieza ya floreció. Recarga tu isla.")
                    : status == 409 && serverError == "The market has not had time to answer yet"
                    ? L.t("The market has not had time to answer yet. Come back when the review opens.", "El mercado aún no ha tenido tiempo de responder. Vuelve cuando se abra la revisión.")
                    : status == 409
                    ? L.t("The island changed. Reload before trying again.", "La isla cambió. Recarga antes de intentarlo de nuevo.")
                    : status == 401
                    ? L.t("Sign in again to save your island.", "Inicia sesión de nuevo para guardar tu isla.")
                    : L.t("Your island could not be updated. Reload to check its saved state.", "No se pudo actualizar tu isla. Recarga para comprobar su estado guardado.")
                throw NSError(domain: "TraderLand", code: status, userInfo: [NSLocalizedDescriptionKey: message])
            }
            let result = try JSONDecoder().decode(TraderLandWorld.self, from: data)
            guard result.ok, result.land.size == 8 else {
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
