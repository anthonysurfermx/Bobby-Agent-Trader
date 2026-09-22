import Foundation
import Security

// Shared likes and comments live in the bobby-protocol Supabase project behind
// the pts_* RPCs (migration 20260922_pts_signal_social). The publishable key is
// public by design; tables are closed and every write goes through an RPC.
enum PTSCommunityConfig {
    static let rpcBase = URL(string: "https://qbvdqkknnuweatptjohi.supabase.co/rest/v1/rpc/")!
    static let publishableKey = "sb_publishable_OmdOOoZmg6tqd_8NTCJ5Bw_wSLp6-OB"
}

/// An anonymous member: a random device secret (the server stores only its
/// hash) plus the display name shown next to likes and comments.
enum PTSMember {
    private static let secretKey = "pts.member.secret"
    private static let nameKey = "pts.member.name"

    static var secret: String {
        if let stored = UserDefaults.standard.string(forKey: secretKey), stored.count == 64 { return stored }
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let created = bytes.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(created, forKey: secretKey)
        return created
    }

    static var name: String? {
        get {
            let stored = UserDefaults.standard.string(forKey: nameKey)?.trimmingCharacters(in: .whitespacesAndNewlines)
            return stored?.isEmpty == false ? stored : nil
        }
        set { UserDefaults.standard.set(newValue.map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40)) }, forKey: nameKey) }
    }
}

struct SignalFeed: Decodable, Equatable {
    struct Like: Decodable, Equatable, Identifiable {
        let name: String
        let at: String
        var id: String { name + at }
    }
    struct Comment: Decodable, Equatable, Identifiable {
        let id: String
        let name: String
        let body: String
        let at: String
        let mine: Bool
    }
    let likeCount: Int
    let liked: Bool
    let likes: [Like]
    let comments: [Comment]
    enum CodingKeys: String, CodingKey { case likeCount = "like_count", liked, likes, comments }
}

struct CommunityError: Error { let code: String }

enum PTSCommunityAPI {
    static func call<T: Decodable>(_ function: String, _ body: [String: Any], as type: T.Type) async throws -> T {
        var request = URLRequest(url: PTSCommunityConfig.rpcBase.appendingPathComponent(function))
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(PTSCommunityConfig.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw CommunityError(code: message ?? "http_\(status)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func date(_ iso: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    static func relative(_ iso: String) -> String {
        guard let date = date(iso) else { return "" }
        if Date().timeIntervalSince(date) < 60 { return "ahora" }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

/// Likes and comments for one signal, refreshed while the detail is visible.
@MainActor final class SignalCommunity: ObservableObject {
    @Published private(set) var feed: SignalFeed?
    @Published private(set) var busy = false
    @Published var error: String?
    let signalID: String

    init(signalID: String) { self.signalID = signalID }

    func load() async {
        do {
            feed = try await PTSCommunityAPI.call("pts_signal_feed", ["p_signal_id": signalID, "p_secret": PTSMember.secret], as: SignalFeed.self)
            error = nil
        } catch {
            if feed == nil { self.error = "No se pudo cargar la comunidad. Revisa la conexión." }
        }
    }

    func toggleLike(as name: String) async {
        await mutate("pts_toggle_like", ["p_signal_id": signalID, "p_secret": PTSMember.secret, "p_name": name])
    }

    func comment(_ text: String, as name: String) async -> Bool {
        let body = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        guard !body.isEmpty else { return false }
        return await mutate("pts_add_comment", ["p_signal_id": signalID, "p_secret": PTSMember.secret, "p_name": name, "p_body": body])
    }

    func delete(_ commentID: String) async {
        await mutate("pts_delete_comment", ["p_comment_id": commentID, "p_secret": PTSMember.secret])
    }

    @discardableResult private func mutate(_ function: String, _ body: [String: Any]) async -> Bool {
        guard !busy else { return false }
        busy = true
        defer { busy = false }
        do {
            feed = try await PTSCommunityAPI.call(function, body, as: SignalFeed.self)
            error = nil
            await CommunitySummary.shared.refresh()
            return true
        } catch let failure as CommunityError where failure.code == "rate_limited" {
            error = "Vas muy rápido. Espera unos minutos para volver a comentar."
        } catch {
            self.error = "No se pudo guardar. Revisa la conexión e inténtalo de nuevo."
        }
        return false
    }
}

/// Like and comment counts for the Home cards.
@MainActor final class CommunitySummary: ObservableObject {
    static let shared = CommunitySummary()
    struct Counts: Decodable, Equatable { let likes: Int; let comments: Int }
    @Published private(set) var counts: [String: Counts] = [:]

    func refresh() async {
        if let latest = try? await PTSCommunityAPI.call("pts_signal_summary", [:], as: [String: Counts].self) { counts = latest }
    }
}

/// Saved signals are personal, so they stay on the device.
@MainActor final class SavedSignals: ObservableObject {
    static let shared = SavedSignals()
    private static let key = "pts.saved.signals"
    @Published private(set) var ids: Set<String>

    private init() { ids = Set(UserDefaults.standard.stringArray(forKey: Self.key) ?? []) }

    func contains(_ id: String) -> Bool { ids.contains(id) }

    func toggle(_ id: String) {
        if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
        UserDefaults.standard.set(Array(ids), forKey: Self.key)
    }
}
