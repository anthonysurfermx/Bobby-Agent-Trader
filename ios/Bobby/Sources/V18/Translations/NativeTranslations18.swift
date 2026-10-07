import Foundation

/// French, Portuguese, Italian and German for the 1.8 features, one table per feature so each
/// lands without touching the others. `NativeTranslations.rows` merges them (an older row wins),
/// and Tests/LocalizationCatalogAudit.py reads every `result["…"] = […]` line in this folder.
enum NativeTranslations18 {
    static var all: [[String: [String: String]]] { [shared, credits, memory, theses, reminders, invite] }

    /// Rows more than one feature uses.
    static let shared: [String: [String: String]] = {
        var result: [String: [String: String]] = [:]
        return result
    }()
}
