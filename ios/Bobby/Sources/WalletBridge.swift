// Native, non-custodial wallet bridge for Base. Reown only transports user
// requests to the wallet; Bobby never receives or stores a private key.
import Combine
import CryptoSwift
import Foundation
import ReownAppKit
import Security
import Web3
import WalletConnectNetworking
import WalletConnectRelay
import WalletConnectSigner

private struct BobbyCryptoProvider: CryptoProvider {
    func recoverPubKey(signature: EthereumSignature, message: Data) throws -> Data {
        let publicKey = try EthereumPublicKey(
            message: [UInt8](message),
            v: EthereumQuantity(quantity: BigUInt(signature.v)),
            r: EthereumQuantity(signature.r),
            s: EthereumQuantity(signature.s)
        )
        return Data(publicKey.rawPublicKey)
    }

    func keccak256(_ data: Data) -> Data {
        Data(SHA3(variant: .keccak256).calculate(for: [UInt8](data)))
    }
}

/// URLSession implementation keeps the relay transport on Apple's networking
/// stack instead of adding another websocket dependency to the app.
private final class BobbyWebSocket: NSObject, WebSocketConnecting, URLSessionWebSocketDelegate {
    var onConnect: (() -> Void)?
    var onDisconnect: ((Error?) -> Void)?
    var onText: ((String) -> Void)?
    var request: URLRequest
    private(set) var isConnected = false

    private var session: URLSession?
    private var task: URLSessionWebSocketTask?

    init(url: URL) {
        request = URLRequest(url: url)
        super.init()
    }

    func connect() {
        guard task == nil else { return }
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        let task = session.webSocketTask(with: request)
        self.session = session
        self.task = task
        task.resume()
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        session?.invalidateAndCancel()
        session = nil
        if isConnected {
            isConnected = false
            onDisconnect?(nil)
        }
    }

    func write(string: String, completion: (() -> Void)?) {
        task?.send(.string(string)) { [weak self] error in
            if let error { self?.finish(error) }
            completion?()
        }
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        isConnected = true
        onConnect?()
        receiveNext()
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        finish(nil)
    }

    private func receiveNext() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(.string(let text)):
                self.onText?(text)
                self.receiveNext()
            case .success(.data(let data)):
                if let text = String(data: data, encoding: .utf8) { self.onText?(text) }
                self.receiveNext()
            case .failure(let error):
                self.finish(error)
            @unknown default:
                self.finish(nil)
            }
        }
    }

    private func finish(_ error: Error?) {
        let wasConnected = isConnected
        isConnected = false
        task = nil
        if wasConnected || error != nil { onDisconnect?(error) }
    }
}

private struct BobbyWebSocketFactory: WebSocketFactory {
    func create(with url: URL) -> WebSocketConnecting { BobbyWebSocket(url: url) }
}

struct BobbyWalletSession: Codable, Equatable {
    let token: String
    let wallet: String
    let expiresAt: Date

    var isUsable: Bool { expiresAt.timeIntervalSinceNow > 60 }
}

enum BobbyWalletSessionValidator {
    static let statement = "Sign in to Bobby Protocol to prove you own this wallet. This signature is free, sends no transaction and cannot move funds."

    /// The API builds the message, but the phone independently verifies every
    /// security-sensitive field before showing it to a wallet.
    static func problem(
        message: String,
        wallet: String,
        now: Date = Date()
    ) -> String? {
        let lines = message.components(separatedBy: "\n")
        guard lines.count == 11 else { return "unexpected message shape" }
        guard lines[0] == "bobbyprotocol.xyz wants you to sign in with your Ethereum account:" else { return "unexpected sign-in domain" }
        guard lines[1].lowercased() == wallet.lowercased() else { return "address is not the connected wallet" }
        guard lines[2].isEmpty, lines[3] == statement, lines[4].isEmpty else { return "unexpected sign-in statement" }
        guard lines[5] == "URI: https://bobbyprotocol.xyz" else { return "unexpected sign-in URI" }
        guard lines[6] == "Version: 1", lines[7] == "Chain ID: 8453" else { return "unexpected sign-in version or chain" }
        guard lines[8].range(of: #"^Nonce: [A-Za-z0-9_-]{16,64}$"#, options: .regularExpression) != nil else { return "malformed nonce" }
        guard lines[9].hasPrefix("Issued At: "), lines[10].hasPrefix("Expiration Time: ") else { return "missing sign-in timestamps" }
        guard let issued = parseISO8601(String(lines[9].dropFirst("Issued At: ".count))),
              let expiration = parseISO8601(String(lines[10].dropFirst("Expiration Time: ".count))) else {
            return "invalid sign-in timestamps"
        }
        guard issued.timeIntervalSince(now) < 60, now.timeIntervalSince(issued) < 15 * 60 else { return "sign-in challenge is not fresh" }
        guard expiration > now, expiration.timeIntervalSince(now) <= 15 * 60 else { return "sign-in expiration is outside the safe window" }
        guard !message.contains("\0") else { return "message contains a null byte" }
        return nil
    }

    private static func parseISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

enum WalletBridgeError: LocalizedError {
    case notConnected
    case wrongChain
    case requestInFlight
    case requestTimedOut
    case walletError(String)
    case malformedResponse
    case unsafeChallenge(String)
    case api(String)

    var errorDescription: String? {
        switch self {
        case .notConnected: return L.t("Connect a wallet first.", "Primero conecta una wallet.")
        case .wrongChain: return L.t("The wallet did not authorize Base.", "La wallet no autorizó Base.")
        case .requestInFlight: return L.t("Finish the current wallet request first.", "Termina primero la solicitud actual de la wallet.")
        case .requestTimedOut: return L.t("The wallet request timed out.", "La solicitud de la wallet caducó.")
        case .walletError(let message): return message
        case .malformedResponse: return L.t("The wallet returned an invalid response.", "La wallet devolvió una respuesta inválida.")
        case .unsafeChallenge(let reason): return L.t("Unsafe sign-in request refused: \(reason)", "Solicitud de acceso insegura rechazada: \(reason)")
        case .api(let message): return message
        }
    }
}

@MainActor
final class WalletBridge: ObservableObject {
    static let shared = WalletBridge()
    static let projectId = "4d0d8421a091e769c3306153621ea088"
    nonisolated static let origin = "https://bobbyprotocol.xyz"
    static let appGroup = "group.xyz.bobbyprotocol.bobby"
    static let baseChain = Chain(
        chainName: "Base",
        chainNamespace: "eip155",
        chainReference: "8453",
        requiredMethods: ["personal_sign", "eth_sendTransaction"],
        optionalMethods: ["wallet_switchEthereumChain", "wallet_addEthereumChain"],
        events: ["chainChanged", "accountsChanged"],
        token: .init(name: "Ether", symbol: "ETH", decimal: 18),
        rpcUrl: "https://mainnet.base.org",
        blockExplorerUrl: "https://basescan.org",
        imageId: "7289c336-3981-4081-c5f4-efc26ac64a00"
    )

    @Published private(set) var address: String?
    @Published private(set) var chainReference: String?
    @Published private(set) var connected = false
    @Published private(set) var walletSession: BobbyWalletSession?
    @Published var lastError: String?

    private static var configured = false
    private var cancellables = Set<AnyCancellable>()
    private var pendingRPC: CheckedContinuation<String, Error>?
    private var pendingRPCID: UUID?
    private let sessionService = "xyz.bobbyprotocol.bobby.wallet-session"

    static func configure() {
        guard !configured else { return }
        configured = true
        let metadata = AppMetadata(
            name: "Bobby Protocol",
            description: "Non-custodial Base swaps. Bobby never holds funds or keys.",
            url: origin,
            icons: ["\(origin)/apple-touch-icon-bobby-v3.png"],
            redirect: try! .init(native: "bobbyprotocol://wallet", universal: nil)
        )
        let base = Blockchain("eip155:8453")!
        let namespace = ProposalNamespace(
            chains: [base],
            methods: ["personal_sign", "eth_sendTransaction", "wallet_switchEthereumChain"],
            events: ["chainChanged", "accountsChanged"]
        )
        Networking.configure(
            groupIdentifier: appGroup,
            projectId: projectId,
            socketFactory: BobbyWebSocketFactory()
        )
        AppKit.configure(
            projectId: projectId,
            metadata: metadata,
            crypto: BobbyCryptoProvider(),
            sessionParams: SessionParams(namespaces: ["eip155": namespace]),
            authRequestParams: nil,
            recommendedWalletIds: [
                "971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709",
                "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
                "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e18e4a0eb6f0f9a23f",
                "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0"
            ],
            coinbaseEnabled: false
        )
        AppKit.instance.selectChain(baseChain)
        AppKit.instance.disableAnalytics()
    }

    private init() {
        Self.configure()
        walletSession = readStoredSession()
        AppKit.instance.sessionsPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refreshConnection() }
            .store(in: &cancellables)
        AppKit.instance.sessionSettlePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refreshConnection() }
            .store(in: &cancellables)
        AppKit.instance.sessionDeletePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refreshConnection() }
            .store(in: &cancellables)
        AppKit.instance.sessionResponsePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] response in self?.finishRPC(response.result) }
            .store(in: &cancellables)
        refreshConnection()
    }

    func presentWallet() {
        lastError = nil
        AppKit.present()
    }

    func handleDeepLink(_ url: URL) {
        _ = AppKit.instance.handleDeeplink(url)
        refreshConnection()
    }

    func refreshConnection() {
        address = AppKit.instance.getAddress()?.lowercased()
        chainReference = AppKit.instance.getSelectedChain()?.chainReference
        connected = address != nil
        guard walletSession?.wallet == address, walletSession?.isUsable == true else {
            walletSession = nil
            deleteStoredSession()
            return
        }
    }

    func disconnect() async {
        do {
            if let topic = AppKit.instance.getSessions().first?.topic {
                try await AppKit.instance.disconnect(topic: topic)
            }
        } catch {
            lastError = error.localizedDescription
        }
        address = nil
        chainReference = nil
        connected = false
        walletSession = nil
        deleteStoredSession()
    }

    func ensureSession() async throws -> BobbyWalletSession {
        refreshConnection()
        guard let wallet = address else { throw WalletBridgeError.notConnected }
        if let stored = walletSession, stored.wallet == wallet, stored.isUsable { return stored }

        var components = URLComponents(url: BobbyAPI.base.appendingPathComponent("api/wallet-session"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "address", value: wallet)]
        var challengeRequest = URLRequest(url: components.url!)
        challengeRequest.setValue(Self.origin, forHTTPHeaderField: "Origin")
        challengeRequest.timeoutInterval = 20
        let challengeData = try await fetch(challengeRequest)
        let challenge = try JSONDecoder.bobby.decode(WalletChallenge.self, from: challengeData)
        guard let nonce = challenge.nonce, let message = challenge.message else { throw WalletBridgeError.malformedResponse }
        if let problem = BobbyWalletSessionValidator.problem(message: message, wallet: wallet) {
            throw WalletBridgeError.unsafeChallenge(problem)
        }

        let signature = try await request(.personal_sign(address: wallet, message: message))
        guard signature.range(of: #"^0x[0-9a-fA-F]{130}$"#, options: .regularExpression) != nil else {
            throw WalletBridgeError.malformedResponse
        }

        var exchange = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/wallet-session"))
        exchange.httpMethod = "POST"
        exchange.setValue("application/json", forHTTPHeaderField: "Content-Type")
        exchange.setValue(Self.origin, forHTTPHeaderField: "Origin")
        exchange.httpBody = try JSONEncoder().encode(WalletProof(address: wallet, nonce: nonce, signature: signature))
        exchange.timeoutInterval = 20
        let responseData = try await fetch(exchange)
        let response = try JSONDecoder.bobby.decode(WalletSessionResponse.self, from: responseData)
        guard response.ok, let token = response.token, let responseWallet = response.wallet,
              responseWallet.lowercased() == wallet, let expiresAt = response.expiresAt else {
            throw WalletBridgeError.malformedResponse
        }
        let session = BobbyWalletSession(token: token, wallet: wallet, expiresAt: expiresAt)
        walletSession = session
        writeStoredSession(session)
        return session
    }

    func sendTransaction(_ tx: BaseSwapTransaction) async throws -> String {
        refreshConnection()
        guard let wallet = address else { throw WalletBridgeError.notConnected }
        AppKit.instance.selectChain(Self.baseChain)
        guard AppKit.instance.getSelectedChain()?.chainReference == "8453" else { throw WalletBridgeError.wrongChain }
        let hash = try await request(.eth_sendTransaction(
            from: wallet,
            to: tx.to,
            value: tx.value,
            data: tx.data,
            nonce: nil,
            gas: nil,
            gasPrice: nil,
            maxFeePerGas: nil,
            maxPriorityFeePerGas: nil,
            gasLimit: nil,
            chainId: "0x2105"
        ))
        guard hash.range(of: #"^0x[0-9a-fA-F]{64}$"#, options: .regularExpression) != nil else {
            throw WalletBridgeError.malformedResponse
        }
        return hash
    }

    private func request(_ rpc: W3MJSONRPC) async throws -> String {
        guard connected else { throw WalletBridgeError.notConnected }
        guard pendingRPC == nil else { throw WalletBridgeError.requestInFlight }
        let id = UUID()
        pendingRPCID = id
        return try await withCheckedThrowingContinuation { continuation in
            pendingRPC = continuation
            Task { @MainActor in
                do {
                    try await AppKit.instance.request(rpc)
                    AppKit.instance.launchCurrentWallet()
                } catch {
                    failRPC(error)
                }
            }
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(120))
                guard pendingRPCID == id else { return }
                failRPC(WalletBridgeError.requestTimedOut)
            }
        }
    }

    private func finishRPC(_ result: RPCResult) {
        guard let continuation = pendingRPC else { return }
        pendingRPC = nil
        pendingRPCID = nil
        switch result {
        case .response(let value):
            if let string = try? value.get(String.self) {
                continuation.resume(returning: string)
            } else {
                continuation.resume(throwing: WalletBridgeError.malformedResponse)
            }
        case .error(let error):
            continuation.resume(throwing: WalletBridgeError.walletError(error.message))
        }
    }

    private func failRPC(_ error: Error) {
        guard let continuation = pendingRPC else { return }
        pendingRPC = nil
        pendingRPCID = nil
        continuation.resume(throwing: error)
    }

    private func fetch(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let body = (try? JSONDecoder().decode(APIErrorBody.self, from: data).error) ?? "HTTP \(status)"
            throw WalletBridgeError.api(body)
        }
        return data
    }

    private func readStoredSession() -> BobbyWalletSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: sessionService,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let session = try? JSONDecoder.bobby.decode(BobbyWalletSession.self, from: data),
              session.isUsable else { return nil }
        return session
    }

    private func writeStoredSession(_ session: BobbyWalletSession) {
        guard let data = try? JSONEncoder.bobby.encode(session) else { return }
        deleteStoredSession()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: sessionService,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    private func deleteStoredSession() {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: sessionService,
        ] as CFDictionary)
    }
}

private struct WalletChallenge: Decodable {
    let nonce: String?
    let message: String?
}

private struct WalletProof: Encodable {
    let address: String
    let nonce: String
    let signature: String
}

private struct WalletSessionResponse: Decodable {
    let ok: Bool
    let token: String?
    let wallet: String?
    let expiresAt: Date?
}

struct APIErrorBody: Decodable {
    let error: String
}

extension JSONDecoder {
    static var bobby: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { value in
            let container = try value.singleValueContainer()
            let string = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: string) ?? ISO8601DateFormatter().date(from: string) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected an ISO 8601 date"
            )
        }
        return decoder
    }
}

extension JSONEncoder {
    static var bobby: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, value in
            var container = value.singleValueContainer()
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            try container.encode(formatter.string(from: date))
        }
        return encoder
    }
}
