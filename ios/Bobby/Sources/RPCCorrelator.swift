import Foundation

/// BP-05 (2026-09-04 review): a wallet response completes a request only when it
/// is THAT request's response. The bridge builds the JSON-RPC request itself and
/// remembers its id, session topic, chain, method and account; anything else that
/// arrives — a late answer to a timed-out request, a duplicate, another topic or
/// chain — is ignored. Pure so it is unit-tested without the SDK.
struct PendingRPC: Equatable {
    /// `String(describing:)` of the SDK's RPCID — stable within a process.
    let id: String
    let topic: String
    let chain: String
    let method: String
    let account: String
}

enum RPCCorrelation: Equatable {
    case accepted
    case unrelated(String)
}

enum RPCCorrelator {
    static func check(responseID: String?, responseTopic: String?, responseChain: String?, pending: PendingRPC?) -> RPCCorrelation {
        guard let pending else { return .unrelated("no request pending") }
        guard let responseID else { return .unrelated("response carries no id") }
        guard responseID == pending.id else { return .unrelated("id \(responseID) is not the pending \(pending.id)") }
        if let responseTopic, responseTopic != pending.topic { return .unrelated("topic mismatch") }
        if let responseChain, responseChain != pending.chain { return .unrelated("chain mismatch") }
        return .accepted
    }

    /// Shape check per method, applied after correlation.
    static func resultLooksValid(_ result: String, method: String) -> Bool {
        switch method {
        case "personal_sign": return result.range(of: #"^0x[0-9a-fA-F]{130}$"#, options: .regularExpression) != nil
        case "eth_sendTransaction": return result.range(of: #"^0x[0-9a-fA-F]{64}$"#, options: .regularExpression) != nil
        default: return false
        }
    }
}
