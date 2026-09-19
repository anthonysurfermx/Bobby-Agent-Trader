import AuthenticationServices
import UIKit

/// Reauthorization gives the server a fresh single-use code to revoke Apple access.
@MainActor
final class AppleDeletionAuthorization: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    static let shared = AppleDeletionAuthorization()
    private var pending: CheckedContinuation<String, Error>?
    private var controller: ASAuthorizationController?

    func authorize() async throws -> String {
        guard pending == nil else { throw URLError(.cannotConnectToHost) }
        return try await withCheckedThrowingContinuation { continuation in
            pending = continuation
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = []
            let controller = ASAuthorizationController(authorizationRequests: [request])
            self.controller = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.authorizationCode, let code = String(data: data, encoding: .utf8) else {
            finish(.failure(URLError(.cannotParseResponse))); return
        }
        finish(.success(code))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) { finish(.failure(error)) }
    private func finish(_ result: Result<String, Error>) {
        let continuation = pending
        pending = nil; controller = nil
        continuation?.resume(with: result)
    }
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
}
