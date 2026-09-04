// Account — Sign in with Apple → Supabase session, kept in the Keychain.
// Apple sign-in never creates or holds a wallet or private key: this identity
// is separate from the optional non-custodial wallet connection and is
// exchanged for a Supabase access token that Bobby verifies server-side.
// No SDK: REST calls go to the bobby-protocol Auth service.
import AuthenticationServices
import CryptoKit
import Foundation
import Security

enum SupabaseConfig {
    // Public values of the bobby-protocol project (the anon key is public by design).
    static let url = URL(string: "https://qbvdqkknnuweatptjohi.supabase.co")!
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFidmRxa2tubnV3ZWF0cHRqb2hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MTcxODEsImV4cCI6MjEwMzA5MzE4MX0.RnLq8W0O-S7L4BGkck-yG8NaaMFMsGN6QX3sjfVPkd8"
}

struct StoredSession: Codable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var userId: String
}

@MainActor
final class AccountSession: ObservableObject {
    static let shared = AccountSession()
    @Published private(set) var session: StoredSession?
    @Published var lastError: String?
    private var currentNonce: String?
    private let keychainService = "xyz.bobbyprotocol.bobby.session"

    init() { session = Keychain.read(service: keychainService) }

    var isSignedIn: Bool { session != nil }

    /// A valid access token, refreshed when it is about to expire. nil = signed out.
    func accessToken() async -> String? {
        guard var s = session else { return nil }
        if s.expiresAt.timeIntervalSinceNow > 60 { return s.accessToken }
        do {
            let refreshed = try await exchange(body: ["refresh_token": s.refreshToken], grant: "refresh_token")
            s = refreshed; session = s; Keychain.write(s, service: keychainService)
            return s.accessToken
        } catch {
            lastError = L.t("Session expired — sign in again", "La sesión caducó — inicia sesión de nuevo")
            signOut(); return nil
        }
    }

    func signOut(store: CompanionStore? = nil) {
        session = nil; Keychain.delete(service: keychainService)
        store?.unbind()
    }

    /// Permanently remove the Apple-backed account and synced Bobby data.
    /// Confirmed public-chain transactions cannot be erased; the server removes
    /// their Bobby account link before deleting the Auth user.
    func deleteAccount(store: CompanionStore? = nil) async -> Bool {
        guard let token = await accessToken() else {
            lastError = L.t("Sign in again before deleting your account", "Inicia sesión de nuevo antes de borrar tu cuenta")
            return false
        }
        var request = URLRequest(url: URL(string: "https://bobbyprotocol.xyz/api/account")!)
        request.httpMethod = "DELETE"
        request.timeoutInterval = 20
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("https://bobbyprotocol.xyz", forHTTPHeaderField: "Origin")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                lastError = message ?? L.t("Could not delete the account — try again", "No se pudo borrar la cuenta — inténtalo de nuevo")
                return false
            }
            signOut(store: store)
            lastError = nil
            return true
        } catch {
            lastError = L.t("Could not delete the account — try again", "No se pudo borrar la cuenta — inténtalo de nuevo")
            return false
        }
    }

    // ---- Sign in with Apple ----
    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        currentNonce = nonce
        request.requestedScopes = []
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func completeApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled { lastError = error.localizedDescription }
        case .success(let auth):
            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = cred.identityToken, let idToken = String(data: tokenData, encoding: .utf8),
                  let nonce = currentNonce else { lastError = "Apple returned no identity token"; return }
            do {
                let s = try await exchange(body: ["provider": "apple", "id_token": idToken, "nonce": nonce], grant: "id_token")
                session = s; Keychain.write(s, service: keychainService); lastError = nil
            } catch {
                lastError = L.t("Could not sign in: \(error.localizedDescription)", "No se pudo iniciar sesión: \(error.localizedDescription)")
            }
        }
    }

    private func exchange(body: [String: Any], grant: String) async throws -> StoredSession {
        var req = URLRequest(url: SupabaseConfig.url.appendingPathComponent("auth/v1/token").appending(queryItems: [URLQueryItem(name: "grant_type", value: grant)]))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error_description"] as? String ?? "HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)"
            throw NSError(domain: "supabase.auth", code: 1, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = json["access_token"] as? String, let refresh = json["refresh_token"] as? String,
              let expiresIn = json["expires_in"] as? Double, let user = json["user"] as? [String: Any], let id = user["id"] as? String
        else { throw NSError(domain: "supabase.auth", code: 2, userInfo: [NSLocalizedDescriptionKey: "malformed token response"]) }
        return StoredSession(accessToken: access, refreshToken: refresh, expiresAt: Date().addingTimeInterval(expiresIn), userId: id)
    }

    private static func randomNonce(length: Int = 32) -> String {
        let chars = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { chars[Int($0) % chars.count] })
    }
}

enum Keychain {
    static func read(service: String) -> StoredSession? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(StoredSession.self, from: data)
    }
    static func write(_ s: StoredSession, service: String) {
        guard let data = try? JSONEncoder().encode(s) else { return }
        delete(service: service)
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(q as CFDictionary, nil)
    }
    static func delete(service: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    }
}
