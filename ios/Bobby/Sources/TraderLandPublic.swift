import Foundation
import Combine

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
    let code: String
    let title: String?
    let size: Int
    let publishedAt: String?
    let placements: [Placement]
    let stats: Stats?
    var id: String { code }
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
            islands = gallery.worlds.filter { $0.size == 8 && $0.code != ownCode }
            failed = false
        } catch {
            failed = true
        }
        loaded = true
    }
}
