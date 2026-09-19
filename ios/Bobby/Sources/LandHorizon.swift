import Foundation

/// A seed's horizon: how long its thesis plays out before it can be reviewed
/// (docs/trader-land/GROWTH-v1.md §1). Patience decides the piece it blooms into:
/// 24 h → common 1×1, 3 days → building 2×1, 7 days → landmark 2×2.
/// A read plants at 24 h; the builder may extend upward only, before the review opens.
enum LandHorizon: Int, CaseIterable, Identifiable, Codable {
    case day = 24
    case threeDays = 72
    case week = 168

    var id: Int { rawValue }
    var hours: Int { rawValue }

    /// Server tier id (`tl_items.tier`).
    var tier: String {
        switch self {
        case .day: return "common"
        case .threeDays: return "building"
        case .week: return "landmark"
        }
    }

    init?(tier: String) {
        guard let match = Self.allCases.first(where: { $0.tier == tier }) else { return nil }
        self = match
    }

    var footprint: (cols: Int, rows: Int) {
        switch self {
        case .day: return (1, 1)
        case .threeDays: return (2, 1)
        case .week: return (2, 2)
        }
    }

    /// "24 h", "3 days", "7 days", glued with a no-break space so a narrow line never
    /// leaves the unit alone on the next line.
    var label: String {
        switch self {
        case .day: return L.t("24\u{00A0}h", "24\u{00A0}h")
        case .threeDays: return L.t("3\u{00A0}days", "3\u{00A0}días")
        case .week: return L.t("7\u{00A0}days", "7\u{00A0}días")
        }
    }

    /// "Common piece", "Building", "Landmark".
    var tierLabel: String {
        switch self {
        case .day: return L.t("Common piece", "Pieza común")
        case .threeDays: return L.t("Building", "Edificio")
        case .week: return L.t("Landmark", "Monumento")
        }
    }

    /// "1×1", "2×1", "2×2".
    var footprintLabel: String { "\(footprint.cols)×\(footprint.rows)" }

    /// Horizons a seed at `self` may still be extended to.
    var upward: [LandHorizon] { Self.allCases.filter { $0.hours > hours } }
}
