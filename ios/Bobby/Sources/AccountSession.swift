// Account — Sign in with Apple → Supabase session, kept in the Keychain.
// Apple sign-in never creates or holds a wallet or private key: this identity
// is separate from the optional non-custodial wallet connection and is
// exchanged for a Supabase access token that Bobby verifies server-side.
// No SDK: REST calls go to the bobby-protocol Auth service.
import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

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
    var appleUserId: String? = nil
    var provider: String? = nil
}

@MainActor
final class AccountSession: ObservableObject {
    static let shared = AccountSession()
    @Published private(set) var session: StoredSession?
    @Published var lastError: String?
    @Published var manualAppleRevocationRequired = false
    private var currentNonce: String?
    /// Invalidates every pending request when the account changes or signs out.
    private(set) var generation = UUID()
    private var refreshTask: Task<StoredSession, Error>?
    private var revocationObserver: NSObjectProtocol?
    private let keychainService = "xyz.bobbyprotocol.bobby.session"

    init() {
        session = Keychain.read(service: keychainService)
        revocationObserver = NotificationCenter.default.addObserver(forName: ASAuthorizationAppleIDProvider.credentialRevokedNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.session?.provider != "twitter" else { return }
                self.signOut()
            }
        }
    }

    deinit { if let revocationObserver { NotificationCenter.default.removeObserver(revocationObserver) } }

    func checkAppleCredential() async {
        guard let appleID = session?.appleUserId else { return }
        let started = generation
        let state = try? await ASAuthorizationAppleIDProvider().credentialState(forUserID: appleID)
        guard generation == started else { return }
        if state == .revoked || state == .notFound { signOut() }
    }

    var isSignedIn: Bool { session != nil }

    /// A valid access token, refreshed when it is about to expire. nil = signed out.
    func accessToken() async -> String? {
        guard let s = session else { return nil }
        if s.expiresAt.timeIntervalSinceNow > 60 { return s.accessToken }
        let started = generation
        let task: Task<StoredSession, Error>
        if let running = refreshTask { task = running }
        else {
            task = Task { try await self.exchange(body: ["refresh_token": s.refreshToken], grant: "refresh_token") }
            refreshTask = task
        }
        defer { if generation == started { refreshTask = nil } }
        do {
            var refreshed = try await task.value
            guard generation == started, session?.userId == s.userId,
                  refreshed.userId == s.userId else { return nil }
            refreshed.appleUserId = s.appleUserId
            refreshed.provider = refreshed.provider ?? s.provider
            session = refreshed; Keychain.write(refreshed, service: keychainService)
            lastError = nil
            return refreshed.accessToken
        } catch let error as NSError where error.domain == Self.authHTTPDomain && [400, 401, 403].contains(error.code) {
            guard generation == started else { return nil }
            // Supabase rejected the refresh token: the session is really over.
            lastError = L.t("Session expired — sign in again", "La sesión caducó — inicia sesión de nuevo")
            signOut(); return nil
        } catch {
            guard generation == started else { return nil }
            // Offline or a server hiccup: keep the session and try again later.
            lastError = L.t("You're offline — try again in a moment", "Sin conexión — inténtalo de nuevo en un momento")
            return nil
        }
    }

    func signOut(store: CompanionStore? = nil) {
        generation = UUID()
        refreshTask?.cancel(); refreshTask = nil
        session = nil; Keychain.delete(service: keychainService)
        store?.unbind()
    }

    private func accept(_ newSession: StoredSession) {
        generation = UUID()
        refreshTask?.cancel(); refreshTask = nil
        session = newSession
        Keychain.write(newSession, service: keychainService)
        lastError = nil
    }

    /// Permanently remove the Apple-backed account and synced Bobby data.
    /// Confirmed public-chain transactions cannot be erased; the server removes
    /// their Bobby account link before deleting the Auth user.
    func deleteAccount(store: CompanionStore? = nil) async -> Bool {
        let started = generation
        let deletingUserId = session?.userId
        manualAppleRevocationRequired = false
        guard let token = await accessToken() else {
            if session == nil {
                lastError = L.t("Sign in again before deleting your account", "Inicia sesión de nuevo antes de borrar tu cuenta")
            }
            return false
        }
        var request = URLRequest(url: URL(string: "https://bobbyprotocol.xyz/api/account")!)
        request.httpMethod = "DELETE"
        request.timeoutInterval = 45
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("https://bobbyprotocol.xyz", forHTTPHeaderField: "Origin")

        do {
            var check = request
            check.httpMethod = "GET"
            let (requirements, checkResponse) = try await URLSession.shared.data(for: check)
            guard (checkResponse as? HTTPURLResponse)?.statusCode == 200,
                  let body = try JSONSerialization.jsonObject(with: requirements) as? [String: Any] else { throw URLError(.badServerResponse) }
            if body["appleAuthorizationRequired"] as? Bool == true {
                let code = try await AppleDeletionAuthorization.shared.authorize()
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: ["appleAuthorizationCode": code])
            }
            guard generation == started else { return false }
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                lastError = L.t(message ?? "Could not delete the account — try again", "No se pudo borrar la cuenta — inténtalo de nuevo")
                return false
            }
            // A late deletion response must never sign out a different account.
            if let deletingUserId { store?.forgetAccount(deletingUserId) }
            guard generation == started else { return true }
            let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            manualAppleRevocationRequired = result?["appleRevocation"] as? String == "manual"
            signOut(store: store)
            lastError = nil
            return true
        } catch {
            if (error as? ASAuthorizationError)?.code == .canceled { return false }
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
        let started = generation
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled { lastError = error.localizedDescription }
        case .success(let auth):
            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = cred.identityToken, let idToken = String(data: tokenData, encoding: .utf8),
                  let nonce = currentNonce else { lastError = L.t("Apple returned no identity token", "Apple no devolvió un token de identidad"); return }
            do {
                var s = try await exchange(body: ["provider": "apple", "id_token": idToken, "nonce": nonce], grant: "id_token")
                guard generation == started else { return }
                s.appleUserId = cred.user; s.provider = "apple"
                accept(s)
            } catch {
                lastError = L.t("Could not sign in: \(error.localizedDescription)", "No se pudo iniciar sesión — inténtalo de nuevo")
            }
        }
    }

    // MARK: - X (Twitter) via Supabase OAuth
    //
    // Apple is native (ID token above). Every other social provider goes through
    // Supabase's /authorize in an ASWebAuthenticationSession; Supabase answers on
    // the app's own scheme with the session in the URL fragment. The redirect
    // `bobbyprotocol://auth-callback` must be on Supabase's Redirect URLs list.
    static let oauthCallback = "bobbyprotocol://auth-callback"

    func signInWithX() async {
        await signInWithOAuth(provider: "twitter")
    }

    func signInWithOAuth(provider: String) async {
        let started = generation
        var comps = URLComponents(url: SupabaseConfig.url.appendingPathComponent("auth/v1/authorize"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "provider", value: provider), URLQueryItem(name: "redirect_to", value: Self.oauthCallback)]
        guard let authURL = comps.url else { lastError = L.t("bad authorize URL", "URL de autorización no válida"); return }
        do {
            let callback = try await WebAuthPresenter.shared.run(url: authURL, scheme: "bobbyprotocol")
            guard var s = Self.session(fromCallback: callback) else { lastError = L.t("Supabase returned no session", "Supabase no devolvió una sesión"); return }
            guard generation == started else { return }
            s.provider = provider
            accept(s)
        } catch {
            // The visitor closing the sheet is not an error worth showing.
            if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { return }
            lastError = error.localizedDescription
        }
    }

    /// Supabase's implicit flow: `bobbyprotocol://auth-callback#access_token=…&refresh_token=…&expires_in=…`.
    static func session(fromCallback url: URL) -> StoredSession? {
        guard let fragment = url.fragment else { return nil }
        var params: [String: String] = [:]
        for pair in fragment.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
            guard kv.count == 2 else { continue }
            params[kv[0]] = kv[1].removingPercentEncoding ?? kv[1]
        }
        guard let access = params["access_token"], let refresh = params["refresh_token"],
              let expiresIn = Double(params["expires_in"] ?? ""), let userId = jwtSubject(access) else { return nil }
        return StoredSession(accessToken: access, refreshToken: refresh, expiresAt: Date().addingTimeInterval(expiresIn), userId: userId)
    }

    /// `sub` of a Supabase access token (base64url payload, no signature check — the server already verified it).
    static func jwtSubject(_ jwt: String) -> String? {
        let parts = jwt.split(separator: ".")
        guard parts.count == 3 else { return nil }
        var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return json["sub"] as? String
    }

    private static let authHTTPDomain = "supabase.auth.http"

    private func exchange(body: [String: Any], grant: String) async throws -> StoredSession {
        var req = URLRequest(url: SupabaseConfig.url.appendingPathComponent("auth/v1/token").appending(queryItems: [URLQueryItem(name: "grant_type", value: grant)]))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error_description"] as? String ?? "HTTP \(status)"
            // The status travels as the code so callers can tell "rejected" from "unreachable".
            throw NSError(domain: Self.authHTTPDomain, code: status, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = json["access_token"] as? String, let refresh = json["refresh_token"] as? String,
              let expiresIn = json["expires_in"] as? Double, let user = json["user"] as? [String: Any], let id = user["id"] as? String
        else { throw NSError(domain: "supabase.auth", code: 2, userInfo: [NSLocalizedDescriptionKey: L.t("malformed token response", "respuesta de token no válida")]) }
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

/// Hosts ASWebAuthenticationSession on the key window and bridges its callback into async/await.
@MainActor
final class WebAuthPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = WebAuthPresenter()
    private var current: ASWebAuthenticationSession?

    func run(url: URL, scheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                if let error { cont.resume(throwing: error) } else if let callback { cont.resume(returning: callback) }
                else { cont.resume(throwing: NSError(domain: "supabase.auth", code: 3, userInfo: [NSLocalizedDescriptionKey: L.t("no callback", "sin respuesta")])) }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            current = session
            session.start()
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
}
