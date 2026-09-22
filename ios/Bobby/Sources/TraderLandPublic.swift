import Foundation
import Combine
import UIKit

/// An island its builder chose to publish. Mirrors `publicWorld()` in
/// api/_lib/trader-land.ts: art positions and the chosen title, never who built it.
struct PublicIsland: Decodable, Identifiable, Equatable {
    struct Placement: Decodable, Equatable {
        let item_id: String
        let x: Int
        let y: Int
        let rotation: Int
    }
    struct Stats: Decodable, Equatable {
        let pieces: Int
        let districts: [String]
    }
    /// The Aura Core's spot and stage (GROWTH-v1 §3); absent from an older server.
    struct Core: Decodable, Equatable { let x: Int; let y: Int; let stage: Int }
    let code: String
    let title: String?
    /// 8, 10, 12 or 16: every size is drawn with its own tiles, in the same slab.
    let size: Int
    let publishedAt: String?
    let placements: [Placement]
    let stats: Stats?
    var core: Core? = nil
    var id: String { code }
    var isShowcase: Bool { code == TraderLandShowcase.code }
    /// The core to draw: 3,3 awake when the server sends none.
    var coreSpot: LandCore { core.map { LandCore(col: $0.x, row: $0.y, stage: $0.stage) } ?? .practice }
}

/// Public islands for the archipelago. No account needed: the gallery endpoint
/// is anonymous and CDN-cached (30 s).
@MainActor
final class TraderLandNeighbors: ObservableObject {
    private struct Gallery: Decodable { let ok: Bool; let worlds: [PublicIsland] }

    @Published private(set) var islands: [PublicIsland] = []
    @Published private(set) var loaded = false
    @Published private(set) var failed = false
    private var inflight = false
    private let transport: URLSession

    init(transport: URLSession = .shared) { self.transport = transport }

    /// Loads the latest published islands (the server caps the list at 24).
    /// `excluding` drops the caller's own island, which already sits at the centre.
    func load(excluding ownCode: String?) async {
        guard !inflight else { return }
        inflight = true
        defer { inflight = false }
        do {
            var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/trader-land-public"))
            request.timeoutInterval = 15
            let (data, response) = try await transport.data(for: request)
            guard (200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0) else { throw URLError(.badServerResponse) }
            let gallery = try JSONDecoder().decode(Gallery.self, from: data)
            guard gallery.ok else { throw URLError(.cannotParseResponse) }
            islands = gallery.worlds.filter { GateLayout.supports($0.size) && $0.code != ownCode }
            failed = false
        } catch {
            failed = true
        }
        loaded = true
    }
}

/// Bundled thumbnails (256 px) of the Trader Land pieces, for surfaces outside
/// the island (the desk harvest card, the header chip).
enum TraderLandArt {
    private struct Manifest: Decodable {
        struct Variant: Decodable { let url: String }
        struct State: Decodable { let variants: [String: Variant] }
        struct Orientation: Decodable { let states: [String: State] }
        struct Item: Decodable { let id: String; let orientations: [String: Orientation] }
        let items: [Item]
    }

    private static let thumbs: [String: String] = {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("gate-A/asset-manifest.json"),
              let data = try? Data(contentsOf: url),
              let manifest = try? JSONDecoder().decode(Manifest.self, from: data) else { return [:] }
        var out: [String: String] = [:]
        for item in manifest.items {
            guard let orientation = item.orientations.values.first,
                  let state = orientation.states["stage1"] ?? orientation.states["bloom"] ?? orientation.states.values.first,
                  let thumb = state.variants["thumb_256"] else { continue }
            out[item.id] = thumb.url.replacingOccurrences(of: "/land/v1/", with: "")
        }
        return out
    }()
    private static let cache = NSCache<NSString, UIImage>()

    /// The piece's thumbnail, for database or manifest ids.
    static func thumb(_ id: String) -> UIImage? {
        guard let path = thumbs[TraderLandCatalog.artID(id)] else { return nil }
        if let hit = cache.object(forKey: path as NSString) { return hit }
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(path),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(image, forKey: path as NSString)
        return image
    }
}
