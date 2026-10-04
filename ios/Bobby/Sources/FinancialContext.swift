// Voluntary, narrow financial facts. Kept in RAM only; the account API is the shared source.
import Combine
import Foundation
import CoreFoundation

struct FinancialContextItem: Codable, Equatable {
    static let categories = ["goal", "income", "expense", "debt", "asset", "preference", "transaction"]
    var category: String
    var summary: String
    var amount: Double?
    var currency: String?
    var observedAt: String?

    static func parse(_ value: Any) throws -> Self {
        guard let json = value as? [String: Any], Set(json.keys).isSubset(of: ["category", "summary", "amount", "currency", "observedAt"]),
              let category = json["category"] as? String, categories.contains(category),
              let rawSummary = json["summary"] as? String else { throw FinancialContextError.invalidImport }
        let summary = rawSummary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (3...240).contains(summary.utf16.count),
              !summary.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }),
              !containsSensitiveIdentifier(summary) else { throw FinancialContextError.invalidImport }
        var amount: Double?
        if let raw = json["amount"] {
            guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite,
                  (0...1e12).contains(number.doubleValue) else { throw FinancialContextError.invalidImport }
            amount = number.doubleValue
        }
        var currency: String?
        if let raw = json["currency"] {
            guard let code = raw as? String, code.range(of: "^[A-Z]{3}$", options: .regularExpression) != nil else { throw FinancialContextError.invalidImport }
            currency = code
        }
        guard amount == nil || currency != nil else { throw FinancialContextError.invalidImport }
        var observedAt: String?
        if let raw = json["observedAt"] {
            guard let date = raw as? String, validDate(date) else { throw FinancialContextError.invalidImport }
            observedAt = date
        }
        return Self(category: category, summary: summary, amount: amount, currency: currency, observedAt: observedAt)
    }
    static func containsSensitiveIdentifier(_ value: String) -> Bool {
        [#"\b(?:sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b"#,
         #"\b[A-Z]{2}\d{2}[A-Z0-9 ]{11,30}\b"#, #"\b(?:\d[ -]?){13,19}\b"#,
         #"-----BEGIN [A-Z ]*PRIVATE KEY-----"#].contains { value.range(of: $0, options: [.regularExpression, .caseInsensitive]) != nil }
    }
    static func validDate(_ value: String) -> Bool {
        guard value.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil else { return false }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, parts[0] > 0 else { return false }
        let calendar = Calendar(identifier: .gregorian)
        let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        guard let date = calendar.date(from: components) else { return false }
        let roundtrip = calendar.dateComponents([.year, .month, .day], from: date)
        return roundtrip.year == parts[0] && roundtrip.month == parts[1] && roundtrip.day == parts[2]
    }
    /// Accept one complete decimal in the field's locale. Grouping and partial parses are never guessed.
    static func enteredAmount(_ text: String, locale: Locale) throws -> Double {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let separator = locale.decimalSeparator ?? "."
        let decimal = NSRegularExpression.escapedPattern(for: separator)
        guard value.range(of: "^[0-9]+(?:" + decimal + "[0-9]+)?$", options: .regularExpression) != nil,
              let amount = Double(value.replacingOccurrences(of: separator, with: ".")),
              amount.isFinite, (0...1e12).contains(amount) else { throw FinancialContextError.invalidImport }
        return amount
    }
    static func amountText(_ amount: Double, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 340
        return formatter.string(from: NSNumber(value: amount)) ?? String(amount)
    }
    var body: [String: Any] {
        var json: [String: Any] = ["category": category, "summary": summary]
        if let amount { json["amount"] = amount }
        if let currency { json["currency"] = currency }
        if let observedAt { json["observedAt"] = observedAt }
        return json
    }
    static func importJSON(_ text: String) throws -> [Self] {
        guard text.utf8.count <= 16_384 else { throw FinancialContextError.invalidImport }
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "^```(?:json)?\\s*", with: "", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "\\s*```$", with: "", options: .regularExpression)
        guard let data = clean.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(json.keys) == ["format", "items"], json["format"] as? String == "bobby-context-v1",
              let rows = json["items"] as? [Any], (1...20).contains(rows.count) else { throw FinancialContextError.invalidImport }
        return try rows.map(parse)
    }
}

struct SavedFinancialContextItem: Codable, Identifiable {
    let id: String
    let category: String
    let summary: String
    let amount: Double?
    let currency: String?
    let observedAt: String?
    let source: String
    let verification: String
    let createdAt: String
    let updatedAt: String
    var item: FinancialContextItem { .init(category: category, summary: summary, amount: amount, currency: currency, observedAt: observedAt) }
}
struct FinancialContextDraft: Codable, Identifiable {
    let id: String
    let items: [FinancialContextItem]
    let expiresAt: String
}
struct FinancialContextRecommendation: Codable, Identifiable {
    let id: String
    let symbol: String
    let asOf: String
    let headline: String
    let why: String
    let risk: String
    let watch: String
    let verdict: String
    let direction: String
    let createdAt: String
    var shareText: String {
        ["Bobby recommendation · \(symbol)", "Market data as of: \(asOf)", "Saved: \(createdAt)", headline,
         "Why: \(why)", "Risk: \(risk)", "Watch: \(watch)", "Verdict: \(verdict)", "Direction: \(direction)",
         "This is a dated market analysis, not a verified financial statement. Discuss this recommendation with me."].compactMap { $0 }.joined(separator: "\n")
    }
}
struct FinancialContextSnapshot: Codable {
    let enabled: Bool
    let financialMemoryEnabled: Bool
    let accountMemoryEnabled: Bool
    let items: [SavedFinancialContextItem]
    let drafts: [FinancialContextDraft]
    let recommendations: [FinancialContextRecommendation]
}
struct FinancialChatGPTConnection: Codable {
    let connected: Bool
    let scopes: [String]
    let available: Bool
}

enum FinancialContextError: Error {
    case invalidImport, signedOut, unavailable, paused, missingDraft, contextLimit, duplicateContext, requestConflict, missingItem
    static func response(_ data: Data, status: Int) -> Self {
        if status == 401 { return .signedOut }
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        switch (json?["code"] ?? json?["error"]) as? String {
        case "signin_required": return .signedOut
        case "context_paused": return .paused
        case "draft_unavailable": return .missingDraft
        case "context_limit": return .contextLimit
        case "duplicate_context": return .duplicateContext
        case "request_conflict": return .requestConflict
        case "item_unavailable": return .missingItem
        case "invalid_context", "context_too_large": return .invalidImport
        default: return .unavailable
        }
    }
    var message: String {
        switch self {
        case .invalidImport: return L.t("Use the exact Bobby JSON format with 1–20 facts, summaries up to 240 characters, and valid amounts, currencies and dates.", "Usa el formato JSON exacto de Bobby con 1–20 datos, resúmenes de hasta 240 caracteres e importes, monedas y fechas válidos.")
        case .signedOut: return L.t("Sign in to your Bobby account first.", "Primero inicia sesión en tu cuenta de Bobby.")
        case .paused: return L.t("Context is paused. Resume it before saving facts.", "El contexto está en pausa. Reanúdalo antes de guardar datos.")
        case .missingDraft: return L.t("This draft expired or was deleted. Refresh and review again.", "Este borrador caducó o se eliminó. Actualiza y revisa de nuevo.")
        case .contextLimit: return L.t("Your account has room for 50 financial facts. Delete a saved fact or select fewer facts before saving.", "Tu cuenta admite 50 datos financieros. Borra un dato guardado o selecciona menos datos antes de guardar.")
        case .duplicateContext: return L.t("This correction matches another saved fact. Keep one copy or change the correction.", "Esta corrección coincide con otro dato guardado. Conserva una copia o cambia la corrección.")
        case .requestConflict: return L.t("This save attempt was already used for different facts. Review the selected facts again before saving.", "Este intento de guardado ya se usó para otros datos. Vuelve a revisar los datos seleccionados antes de guardar.")
        case .missingItem: return L.t("This saved fact was deleted. Refresh before correcting it.", "Este dato guardado se eliminó. Actualiza antes de corregirlo.")
        case .unavailable: return L.t("Context could not be loaded or saved. Try again.", "No se pudo cargar o guardar el contexto. Intenta de nuevo.")
        }
    }
}

@MainActor
final class FinancialContextCenter: ObservableObject {
    @Published private(set) var snapshot: FinancialContextSnapshot?
    @Published private(set) var connection: FinancialChatGPTConnection?
    @Published private(set) var busy = false
    @Published var error: String?
    @Published private(set) var connectionError: String?
    private let account: AccountSession
    private let send: @MainActor (URLRequest) async throws -> AuthorizedResponse
    // A queued button task must never start with the replacement account's bearer.
    private let boundOwner: String?
    private let boundGeneration: UUID
    private var operation = UUID()
    private var observer: AnyCancellable?
    init(account: AccountSession = .shared, send: (@MainActor (URLRequest) async throws -> AuthorizedResponse)? = nil) {
        self.account = account
        let owner = account.session?.userId
        let generation = account.generation
        boundOwner = owner; boundGeneration = generation
        self.send = send ?? { request in
            guard account.session?.userId == owner, account.generation == generation else { return .unavailable }
            return try await account.send(request)
        }
        observer = NotificationCenter.default.publisher(for: AccountSession.didChange, object: account)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.reset() } }
    }
    func reset() { operation = UUID(); snapshot = nil; connection = nil; busy = false; error = nil; connectionError = nil }
    @discardableResult
    func request(method: String = "GET", body: [String: Any]? = nil, query: String = "") async -> Bool {
        await perform(.context, method: method, body: body, query: query)
    }
    @discardableResult
    func loadConnection() async -> Bool { await perform(.connection) }
    @discardableResult
    func revokeConnection() async -> Bool { await perform(.revoke, method: "POST", body: [:]) }
    private enum Destination { case context, connection, revoke }
    private func perform(_ destination: Destination, method: String = "GET", body: [String: Any]? = nil, query: String = "") async -> Bool {
        guard !busy else { return false }
        guard account.session?.userId == boundOwner, account.generation == boundGeneration else { return false }
        guard let owner = account.session?.userId else { error = FinancialContextError.signedOut.message; return false }
        let generation = account.generation
        let ticket = UUID(); operation = ticket
        busy = true
        if destination == .context { error = nil } else { connectionError = nil }
        func current() -> Bool { operation == ticket && account.generation == generation && account.session?.userId == owner && !Task.isCancelled }
        defer { if current() { busy = false } }
        do {
            var request = URLRequest(url: BobbyAPI.base.appendingPathComponent(destination == .context ? "api/financial-context" : "api/chatgpt"))
            let parameters = destination == .context ? query : "op=" + (destination == .connection ? "connection" : "revoke")
            if !parameters.isEmpty { request.url = URL(string: request.url!.absoluteString + "?" + parameters) }
            request.httpMethod = method
            request.timeoutInterval = 30
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
            request.setValue("https://bobbyprotocol.xyz", forHTTPHeaderField: "Origin")
            if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
            let reply = try await send(request)
            guard current() else { return false }
            switch reply {
            case .signedOut: throw FinancialContextError.signedOut
            case .unavailable: throw FinancialContextError.unavailable
            case let .answered(data, status):
                guard (200..<300).contains(status) else { throw FinancialContextError.response(data, status: status) }
                if destination == .context { snapshot = try JSONDecoder().decode(FinancialContextSnapshot.self, from: data) }
                else { connection = try JSONDecoder().decode(FinancialChatGPTConnection.self, from: data) }
                return true
            }
        } catch {
            if current() {
                let message = (error as? FinancialContextError ?? .unavailable).message
                if destination == .context { self.error = message } else { connectionError = message }
            }
            return false
        }
    }
}
