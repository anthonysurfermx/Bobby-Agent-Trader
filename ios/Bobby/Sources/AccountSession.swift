// Account — Sign in with Apple → Supabase session, kept in the Keychain.
// Apple sign-in never creates or holds a wallet or private key: the Apple
// identity is exchanged for a Supabase access token that Bobby verifies
// server-side. 1.2 offers Sign in with Apple only (X is Debug-only, see
// SignInMethods). No SDK: REST calls go to the bobby-protocol Auth service.
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
    /// Sessions saved by build 32 or earlier have none; `backfillIdentity()` reads it from Auth.
    var appleUserId: String? = nil
    /// "apple" | "twitter"; nil = unknown (a session saved before build 33).
    var provider: String? = nil
}

/// AccountSession always serializes its persisted state; tests can provide byte storage without
/// depending on the simulator host's Keychain entitlement. Production uses the device Keychain.
@MainActor
struct AccountSessionStorage {
    let read: () -> Data?
    let write: (Data) -> Void
    let clear: () -> Void

    static func keychain(service: String) -> Self {
        Self(read: { Keychain.readData(service: service) },
             write: { Keychain.writeData($0, service: service) },
             clear: { Keychain.delete(service: service) })
    }

    static var none: Self { Self(read: { nil }, write: { _ in }, clear: {}) }
}

/// The sign-in methods this build offers. 1.2 ships Sign in with Apple only: X is
/// switched off in production Auth, so its button (and its copy) is compiled into
/// Debug builds alone.
enum SignInMethods {
    static let isDebugBuild: Bool = {
#if DEBUG
        true
#else
        false
#endif
    }()

    static func offersX(debugBuild: Bool) -> Bool { debugBuild }
    static var offersX: Bool { offersX(debugBuild: isDebugBuild) }
}

/// What an authorized request came to (`AccountSession.send`).
enum AuthorizedResponse: Equatable {
    /// No session, or Auth refused its refresh token: the session is over.
    case signedOut
    /// No bearer could be had right now (a refresh that failed offline), or the account
    /// changed while the request flew: nothing is known, the session stays.
    case unavailable
    case answered(Data, Int)
}

/// What deleting the account came to.
enum AccountDeletion: Equatable {
    case deleted
    /// The person closed Apple's re-authorization sheet: nothing was deleted and nothing needs saying.
    case cancelled
    /// `lastError` says why.
    case failed
}

@MainActor
final class AccountSession: ObservableObject {
    static let shared = AccountSession()
    /// Published session sends willSet; observers needing the new identity use this post-assignment event.
    static let didChange = Notification.Name("BobbyAccountSessionDidChange")
    @Published private(set) var session: StoredSession?
    @Published var lastError: String?
    @Published var manualAppleRevocationRequired = false
    /// Where Apple explains how to stop using Sign in with Apple for an app (the server may name it).
    @Published private(set) var manualRevocationURL = AccountSession.defaultManualRevocationURL
    private var currentNonce: String?
    private var appleRequestGeneration: UUID?
    private var signInAttempt = UUID()
    /// Invalidates every pending request when the account changes or signs out.
    private(set) var generation = UUID()
    private var refreshTask: Task<StoredSession, Error>?
    private var revocationObserver: NSObjectProtocol?
    private static let keychainService = "xyz.bobbyprotocol.bobby.session"
    private let storage: AccountSessionStorage
    private let authTransport: URLSession
    private let defaults: UserDefaults
    /// Tests can defer an OAuth callback without opening a real sign-in sheet.
    var oauthAuthorization: @MainActor (URL) async throws -> URL = {
        try await WebAuthPresenter.shared.run(url: $0, scheme: "bobbyprotocol")
    }
    /// Apple's re-authorization for deletion; tests stand in for the sheet.
    var appleDeletionCode: @MainActor () async throws -> String = { try await AppleDeletionAuthorization.shared.authorize() }

    init(initialSession: StoredSession? = nil, usesKeychain: Bool = true,
         authTransport: URLSession = .shared, defaults: UserDefaults = .standard,
         storage: AccountSessionStorage? = nil) {
        let storage = storage ?? (usesKeychain ? .keychain(service: Self.keychainService) : .none)
        self.storage = storage
        self.authTransport = authTransport
        self.defaults = defaults
        session = initialSession ?? storage.read().flatMap { try? JSONDecoder().decode(StoredSession.self, from: $0) }
        DeskMemory.setOwner(session?.userId, defaults: defaults)
        revocationObserver = NotificationCenter.default.addObserver(forName: ASAuthorizationAppleIDProvider.credentialRevokedNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                guard let self, let s = self.session, s.provider != "twitter" else { return }
                // A known Apple session ends now; a session of unknown provider (saved before
                // build 33) is asked about first, so an X account is never signed out for Apple.
                if s.provider == "apple" || s.appleUserId != nil { self.signOut() } else { await self.checkAppleCredential() }
            }
        }
    }

    deinit { if let revocationObserver { NotificationCenter.default.removeObserver(revocationObserver) } }

    /// Signs out when Apple says this Apple ID no longer authorizes Bobby. Runs at launch and on
    /// every return to the foreground; a session saved before build 33 first learns its Apple ID.
    func checkAppleCredential() async {
        guard let s = session, s.provider != "twitter" else { return }
        let started = generation
        if s.appleUserId == nil { await backfillIdentity() }
        guard generation == started, let appleID = session?.appleUserId else { return }
        let state = try? await ASAuthorizationAppleIDProvider().credentialState(forUserID: appleID)
        guard generation == started else { return }
        if state == .revoked || state == .notFound { signOut() }
    }

    /// Sessions saved by build 32 or earlier carry no Apple user ID or provider, so the credential
    /// check had nothing to ask Apple about. The account's own Auth record names both.
    func backfillIdentity() async {
        guard let s = session, s.appleUserId == nil, s.provider != "twitter" else { return }
        let started = generation
        var request = URLRequest(url: SupabaseConfig.url.appendingPathComponent("auth/v1/user"))
        request.timeoutInterval = 15
        request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        guard case let .answered(data, 200)? = try? await send(request),
              generation == started,
              let user = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              user["id"] as? String == s.userId,
              var current = session, current.userId == s.userId else { return }
        let identity = Self.identity(fromUser: user)
        current.appleUserId = current.appleUserId ?? identity.appleUserId
        current.provider = current.provider ?? identity.provider
        guard current.appleUserId != s.appleUserId || current.provider != s.provider else { return }
        session = current
        persist(current)
    }

    /// The Apple user ID (`identities[provider=apple].identity_data.sub`, the same value as
    /// `ASAuthorizationAppleIDCredential.user`) and the provider of a Supabase user object.
    static func identity(fromUser user: [String: Any]) -> (appleUserId: String?, provider: String?) {
        let identities = user["identities"] as? [[String: Any]] ?? []
        let apple = identities.first { $0["provider"] as? String == "apple" }
        let data = apple?["identity_data"] as? [String: Any]
        let appleUserId = (data?["sub"] as? String) ?? (data?["provider_id"] as? String) ?? (apple?["id"] as? String)
        let provider = (user["app_metadata"] as? [String: Any])?["provider"] as? String
            ?? identities.first?["provider"] as? String
        return (appleUserId.flatMap { $0.isEmpty ? nil : $0 }, provider)
    }

    var isSignedIn: Bool { session != nil }

    /// A valid access token, refreshed when it is about to expire. nil = signed out.
    /// `replacing` a token the server just refused (401) forces the refresh whatever its
    /// clock says, unless another request already replaced it.
    func accessToken(replacing stale: String? = nil) async -> String? {
        guard let s = session else { return nil }
        let refused = stale != nil && s.accessToken == stale
        if !refused, s.expiresAt.timeIntervalSinceNow > 60 { return s.accessToken }
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
            // The refresh answer names the account's identities: a session saved before build 33 learns its Apple ID here.
            refreshed.appleUserId = s.appleUserId ?? refreshed.appleUserId
            refreshed.provider = s.provider ?? refreshed.provider
            session = refreshed; persist(refreshed)
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

    /// Sends `request` with the account's bearer. An access token can expire between being
    /// read and being checked (a slow drain, a long Apple sheet): the first 401 forces one
    /// refresh and one retry, so only a token the server still refuses after a refresh comes
    /// back as `answered(_, 401)`. Transport errors are thrown.
    func send(_ request: URLRequest, via transport: URLSession? = nil) async throws -> AuthorizedResponse {
        let started = generation
        let transport = transport ?? authTransport
        guard let token = await accessToken() else { return session == nil ? .signedOut : .unavailable }
        guard generation == started else { return .unavailable }
        let first = try await Self.data(for: request, token: token, via: transport)
        guard generation == started else { return .unavailable }
        guard first.status == 401 else { return .answered(first.data, first.status) }
        guard generation == started else { return .unavailable }
        guard let fresh = await accessToken(replacing: token) else { return session == nil ? .signedOut : .unavailable }
        guard generation == started else { return .unavailable }
        guard fresh != token else { return .answered(first.data, first.status) }
        let second = try await Self.data(for: request, token: fresh, via: transport)
        guard generation == started else { return .unavailable }
        return .answered(second.data, second.status)
    }

    private static func data(for request: URLRequest, token: String, via transport: URLSession) async throws -> (data: Data, status: Int) {
        var request = request
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await transport.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    func signOut(store: CompanionStore? = nil) {
        generation = UUID()
        cancelPendingSignIn()
        refreshTask?.cancel(); refreshTask = nil
        session = nil
        storage.clear()
        DeskMemory.setOwner(nil, defaults: defaults)
        store?.unbind()
        NotificationCenter.default.post(name: Self.didChange, object: self)
    }

    func accept(_ newSession: StoredSession) {
        generation = UUID()
        cancelPendingSignIn()
        refreshTask?.cancel(); refreshTask = nil
        session = newSession
        persist(newSession)
        DeskMemory.setOwner(newSession.userId, defaults: defaults)
        manualAppleRevocationRequired = false
        manualRevocationURL = Self.defaultManualRevocationURL
        lastError = nil
        NotificationCenter.default.post(name: Self.didChange, object: self)
    }

    private func persist(_ value: StoredSession) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        storage.write(data)
    }

    /// Stops a pending authorization without ending an existing account session.
    func cancelPendingSignIn() {
        signInAttempt = UUID()
        currentNonce = nil
        appleRequestGeneration = nil
    }

    // MARK: - Account deletion

    /// Clients that send it get the build-34 contract of /api/account: the server asks this client
    /// (and only this client) for Apple's authorization code, and answers `appleRevocation:'manual'`
    /// with `manualRevocationURL` when it cannot revoke Apple access itself.
    nonisolated static let accountClientHeader = "X-Bobby-Account-Client"
    nonisolated static let accountClientVersion = "2"
    /// Apple's "Stop using Sign in with Apple" page, in the device's language.
    nonisolated static var defaultManualRevocationURL: URL { defaultManualRevocationURL(spanish: nil) }
    nonisolated static func defaultManualRevocationURL(spanish: Bool? = nil) -> URL {
        URL(string: "https://support.apple.com/" + (spanish.map { $0 ? "es-mx" : "en-us" } ?? L.localeIdentifier.lowercased()) + "/102571")!
    }

    /// `GET` asks what deletion needs; `DELETE` deletes. Both carry the client header.
    nonisolated static func accountRequest(method: String) -> URLRequest {
        var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/account"))
        request.httpMethod = method
        request.timeoutInterval = 45
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("https://bobbyprotocol.xyz", forHTTPHeaderField: "Origin")
        request.setValue(accountClientVersion, forHTTPHeaderField: accountClientHeader)
        return request
    }

    /// Apple's own page only: anything else the server names falls back to it. A Spanish phone
    /// opens the es-MX edition, so the page matches the Spanish steps in the alert.
    nonisolated static func manualRevocationURL(from raw: Any?, spanish: Bool? = nil) -> URL {
        guard let text = raw as? String, let url = URL(string: text), url.scheme == "https",
              let host = url.host?.lowercased(), host == "apple.com" || host.hasSuffix(".apple.com") else {
            return defaultManualRevocationURL(spanish: spanish)
        }
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        // support.apple.com/<lang>-<region>/102571: swap the locale segment, keep the article.
        var segments = parts.path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard segments.count > 1, segments[1].range(of: "^[A-Za-z]{2}-[A-Za-z]{2}$", options: .regularExpression) != nil else { return url }
        segments[1] = spanish.map { $0 ? "es-mx" : "en-us" } ?? L.localeIdentifier.lowercased()
        parts.path = segments.joined(separator: "/")
        return parts.url ?? url
    }

    /// The steps Apple documents for iPhone (support.apple.com/102571, September 2026), in the
    /// words the Settings app uses: "Configuración", not "Ajustes", on an es-MX phone.
    nonisolated static var manualRevocationSteps: String { manualRevocationSteps(spanish: nil) }
    nonisolated static func manualRevocationSteps(spanish: Bool? = nil) -> String {
        L.t("To finish, open Settings, tap your name, tap Sign in with Apple, choose Bobby and tap Delete.",
            "Para terminar, abre Configuración, toca tu nombre, toca Iniciar sesión con Apple, elige Bobby y toca Eliminar.",
            spanish: spanish)
    }

    /// Permanently remove the Bobby account and its synced data. Apple accounts re-authorize
    /// first so the server can revoke Apple access; when it cannot, the answer says so and the
    /// app shows Apple's manual steps. Closing Apple's sheet is a quiet cancel.
    func deleteAccount(store: CompanionStore? = nil) async -> AccountDeletion {
        let started = generation
        manualAppleRevocationRequired = false
        manualRevocationURL = Self.defaultManualRevocationURL
        guard let deletingUserId = session?.userId else {
            lastError = L.t("Sign in again before deleting your account", "Inicia sesión de nuevo antes de borrar tu cuenta")
            return .failed
        }
        var request = Self.accountRequest(method: "DELETE")
        var sentAppleCode = false
        do {
            // 1) What deletion needs. A backend that predates the check (405) never asks for Apple.
            let check = try await send(Self.accountRequest(method: "GET"))
            guard generation == started else { return interrupted() }
            switch check {
            case .signedOut: return interrupted()
            case .unavailable: throw URLError(.networkConnectionLost)
            case let .answered(data, status):
                if status != 405 {
                    guard status == 200, let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                        return fail(data: data, status: status)
                    }
                    if body["appleAuthorizationRequired"] as? Bool == true {
                        try await attachAppleCode(to: &request); sentAppleCode = true
                    }
                }
            }
            // 2) Delete. The bearer is read again: Apple's sheet may have outlived the old one.
            guard generation == started else { return interrupted() }
            var result = try await send(request)
            // A server that began requiring Apple after the check says so once.
            if case let .answered(data, 409) = result, !sentAppleCode,
               (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["appleAuthorizationRequired"] as? Bool == true {
                try await attachAppleCode(to: &request); sentAppleCode = true
                guard generation == started else { return interrupted() }
                result = try await send(request)
            }
            guard case let .answered(data, status) = result else {
                if case .signedOut = result { return interrupted() }
                throw URLError(.networkConnectionLost)
            }
            guard (200..<300).contains(status) else { return fail(data: data, status: status) }
            // A late deletion response must never sign out a different account.
            store?.forgetAccount(deletingUserId)
            DeskMemory.forgetOwner(deletingUserId, defaults: defaults)
            NucleoLedger.forgetOwner(deletingUserId, defaults: defaults)
            // The server cascade removed the device binding; forget its local proof (only if it was this account's).
            PushRegistrar.forgetOwner(deletingUserId)
            guard generation == started else { return .deleted }
            AppleGivenName.forget(owner: session?.appleUserId, defaults: defaults)
            let answer = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            manualAppleRevocationRequired = answer?["appleRevocation"] as? String == "manual"
            manualRevocationURL = Self.manualRevocationURL(from: answer?["manualRevocationURL"])
            signOut(store: store)
            lastError = nil
            return .deleted
        } catch {
            guard generation == started else { return .failed }
            if (error as? ASAuthorizationError)?.code == .canceled { lastError = nil; return .cancelled }
            lastError = L.t("Could not delete the account — try again", "No se pudo borrar la cuenta — inténtalo de nuevo")
            return .failed
        }
    }

    private func attachAppleCode(to request: inout URLRequest) async throws {
        let code = try await appleDeletionCode()
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["appleAuthorizationCode": code])
    }

    /// Signed out (or into another account) mid-deletion: nothing was deleted.
    private func interrupted() -> AccountDeletion {
        lastError = L.t("Sign in again before deleting your account", "Inicia sesión de nuevo antes de borrar tu cuenta")
        return .failed
    }

    private func fail(data: Data, status: Int) -> AccountDeletion {
        if status == 401 { return interrupted() }
        let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
        lastError = L.t(message ?? "Could not delete the account — try again", "No se pudo borrar la cuenta — inténtalo de nuevo")
        return .failed
    }

    // ---- Sign in with Apple ----

    /// What the account sheet says when Apple's sheet fails: never the raw system text
    /// ("com.apple.AuthenticationServices.AuthorizationError error 1000"). Closing the sheet
    /// is a choice, not an error (nil).
    nonisolated static func appleSignInFailure(_ error: Error) -> String? {
        guard let code = (error as? ASAuthorizationError)?.code else {
            return L.t("Sign in with Apple did not finish — try again.", "Iniciar sesión con Apple no terminó — inténtalo de nuevo.")
        }
        switch code {
        case .canceled:
            return nil
        case .unknown, .notHandled, .notInteractive:
            // 1000 is what a phone with no Apple Account signed in returns.
            return L.t("Sign in with Apple is not available right now — check that you are signed in to your Apple Account in Settings.",
                       "Iniciar sesión con Apple no está disponible ahora — revisa que tengas sesión en tu cuenta de Apple en Configuración.")
        default:
            return L.t("Sign in with Apple did not finish — try again.", "Iniciar sesión con Apple no terminó — inténtalo de nuevo.")
        }
    }

    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        signInAttempt = UUID()
        appleRequestGeneration = generation
        currentNonce = nonce
        // The given name only greets the person in the profile ("Hola, Ana"). Apple shares it on
        // the first authorization alone; it stays on this phone and never reaches the server.
        request.requestedScopes = [.fullName]
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func completeApple(_ result: Result<ASAuthorization, Error>) async {
        guard appleRequestGeneration == generation else { return }
        switch result {
        case .failure(let error):
            lastError = Self.appleSignInFailure(error)
            cancelPendingSignIn()
        case .success(let auth):
            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = cred.identityToken, let idToken = String(data: tokenData, encoding: .utf8),
                  currentNonce != nil else { lastError = L.t("Apple returned no identity token", "Apple no devolvió un token de identidad"); return }
            await completeAppleExchange(idToken: idToken, appleUserId: cred.user, givenName: cred.fullName?.givenName)
        }
    }

    /// Exchanges the identity returned by the request prepared above. Both the request and its
    /// network answer belong to that sign-in attempt; logout, consent withdrawal or another login wins.
    func completeAppleExchange(idToken: String, appleUserId: String, givenName: String?) async {
        guard let started = appleRequestGeneration, generation == started, let nonce = currentNonce else { return }
        let attempt = signInAttempt
        appleRequestGeneration = nil
        currentNonce = nil
        do {
            var s = try await exchange(body: ["provider": "apple", "id_token": idToken, "nonce": nonce], grant: "id_token")
            guard generation == started, signInAttempt == attempt else { return }
            s.appleUserId = appleUserId; s.provider = "apple"
            AppleGivenName.remember(givenName, appleUserId: appleUserId, defaults: defaults)
            accept(s)
        } catch {
            guard generation == started, signInAttempt == attempt else { return }
            lastError = L.t("Could not sign in: \(error.localizedDescription)", "No se pudo iniciar sesión — inténtalo de nuevo")
        }
    }

#if DEBUG
    /// `-qa-profile signed-in`: an in-memory Apple session (never the Keychain, never a real token)
    /// so the profile sheet can be captured signed in. Nothing it holds can reach the server.
    func acceptQAFixture(userId: String, appleUserId: String) {
        generation = UUID()
        cancelPendingSignIn()
        session = StoredSession(accessToken: "qa-fixture", refreshToken: "qa-fixture", expiresAt: Date().addingTimeInterval(3600),
                                userId: userId, appleUserId: appleUserId, provider: "apple")
        lastError = nil
        DeskMemory.setOwner(userId, defaults: defaults)
        NotificationCenter.default.post(name: Self.didChange, object: self)
    }
#endif

    // MARK: - X (Twitter) via Supabase OAuth
    //
    // Apple is native (ID token above). Every other social provider goes through
    // Supabase's /authorize in an ASWebAuthenticationSession; Supabase answers on
    // the app's own scheme with the session in the URL fragment. The redirect
    // `bobbyprotocol://auth-callback` must be on Supabase's Redirect URLs list.
    // X is off in production Auth: 1.2 compiles its entry point into Debug only.
    static let oauthCallback = "bobbyprotocol://auth-callback"

#if DEBUG
    func signInWithX() async {
        await signInWithOAuth(provider: "twitter")
    }
#endif

    func signInWithOAuth(provider: String) async {
        let started = generation
        cancelPendingSignIn()
        let attempt = signInAttempt
        var comps = URLComponents(url: SupabaseConfig.url.appendingPathComponent("auth/v1/authorize"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "provider", value: provider), URLQueryItem(name: "redirect_to", value: Self.oauthCallback)]
        guard let authURL = comps.url else { lastError = L.t("bad authorize URL", "URL de autorización no válida"); return }
        do {
            let callback = try await oauthAuthorization(authURL)
            guard generation == started, signInAttempt == attempt else { return }
            guard var s = Self.session(fromCallback: callback) else { lastError = L.t("Supabase returned no session", "Supabase no devolvió una sesión"); return }
            guard generation == started else { return }
            s.provider = provider
            accept(s)
        } catch {
            guard generation == started, signInAttempt == attempt else { return }
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
        let (data, response) = try await authTransport.data(for: req)
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
        let identity = Self.identity(fromUser: user)
        return StoredSession(accessToken: access, refreshToken: refresh, expiresAt: Date().addingTimeInterval(expiresIn), userId: id,
                             appleUserId: identity.appleUserId, provider: identity.provider)
    }

    private static func randomNonce(length: Int = 32) -> String {
        let chars = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { chars[Int($0) % chars.count] })
    }
}

/// The given name Apple shared at the first Sign in with Apple, kept on this phone only (UserDefaults)
/// and tied to that Apple ID: another account signing in never inherits it. Deleting the account forgets it.
enum AppleGivenName {
    static let key = "account.appleGivenName"
    static let ownerKey = "account.appleGivenName.owner"

    static func remember(_ name: String?, appleUserId: String, defaults: UserDefaults = .standard) {
        let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        // Apple sends the name once; a later sign-in (empty name) keeps what was stored for the same ID.
        guard !trimmed.isEmpty else { return }
        defaults.set(trimmed, forKey: key)
        defaults.set(appleUserId, forKey: ownerKey)
    }

    /// The stored name when it belongs to `appleUserId`; nil otherwise.
    static func name(for appleUserId: String?, defaults: UserDefaults = .standard) -> String? {
        guard let appleUserId, defaults.string(forKey: ownerKey) == appleUserId,
              let name = defaults.string(forKey: key), !name.isEmpty else { return nil }
        return name
    }

    static func forget(owner: String? = nil, defaults: UserDefaults = .standard) {
        if let owner, defaults.string(forKey: ownerKey) != owner { return }
        defaults.removeObject(forKey: key)
        defaults.removeObject(forKey: ownerKey)
    }
}

enum Keychain {
    static func read(service: String) -> StoredSession? {
        guard let data = readData(service: service) else { return nil }
        return try? JSONDecoder().decode(StoredSession.self, from: data)
    }
    static func readData(service: String) -> Data? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return data
    }
    static func write(_ s: StoredSession, service: String) {
        guard let data = try? JSONEncoder().encode(s) else { return }
        writeData(data, service: service)
    }
    static func writeData(_ data: Data, service: String) {
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
