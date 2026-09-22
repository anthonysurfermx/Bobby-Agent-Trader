import Foundation

/// The original Quiet Reef layout, shipped as a permanent read-only example.
/// It belongs to the app, never to an account or its earned inventory.
enum TraderLandShowcase {
    // This namespace cannot collide with the server's 10-character share codes.
    static let code = "showcase-satoshi"
    static let island = PublicIsland(
        code: code, title: "Satoshi Nakamoto", size: 8, publishedAt: nil,
        placements: [
            .init(item_id: "crypto_bay_context_buoy", x: 1, y: 2, rotation: 90),
            .init(item_id: "risk_reef_dual_orbit_antenna", x: 1, y: 5, rotation: 90),
            .init(item_id: "evidence_mines_crystal_vein_rock", x: 5, y: 1, rotation: 90),
            .init(item_id: "axiom_archive_aura_flower", x: 6, y: 5, rotation: 90),
            .init(item_id: "thesis_citadel_risk_shield", x: 4, y: 6, rotation: 90),
            .init(item_id: "axiom_archive_path_straight", x: 2, y: 3, rotation: 90),
            .init(item_id: "axiom_archive_path_straight", x: 2, y: 4, rotation: 90),
            .init(item_id: "thesis_citadel_double_gate", x: 3, y: 5, rotation: 90),
            .init(item_id: "evidence_mines_mother_crystal", x: 0, y: 6, rotation: 0),
            .init(item_id: "evidence_mines_lantern_drone", x: 7, y: 1, rotation: 90)
        ],
        stats: .init(pieces: 10, districts: ["axiom_archive", "crypto_bay", "evidence_mines", "risk_reef", "thesis_citadel"]),
        core: .init(x: 3, y: 3, stage: 1)
    )

    /// Keep the example first, including offline, with a full gallery or no account.
    /// Only the viewer's real island is excluded; the example never consumes it.
    static func neighbors(among islands: [PublicIsland], excluding ownCode: String?) -> [PublicIsland] {
        [island] + islands.filter { $0.code != code && $0.code != ownCode }.prefix(23)
    }
}
