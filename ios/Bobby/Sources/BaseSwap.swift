// Base USDC <-> Coinbase B20 stock swaps. The server quotes and simulates;
// this file independently validates every transaction before the wallet sees
// it, then verifies mined receipts through Base and Bobby's receipt endpoint.
import Foundation

struct BaseSwapTokenView: Decodable, Equatable {
    let symbol: String
    let name: String
    let address: String
    let decimals: Int
}

struct BaseSwapTransaction: Decodable, Equatable {
    let to: String
    let data: String
    let value: String
    let spender: String?
    let amount: String?
}

struct BaseSwapTransactionSet: Decodable, Equatable {
    let chainId: Int
    let approve: BaseSwapTransaction?
    let swap: BaseSwapTransaction?
    let revoke: BaseSwapTransaction?
    let deadline: Int
}

struct BaseSwapQuote: Decodable, Equatable {
    struct Venue: Decodable, Equatable {
        let name: String
        let router: String
    }

    struct Route: Decodable, Equatable {
        let kind: String
        let fees: [Int]
        let description: String
        let gasEstimate: String
    }

    struct Simulation: Decodable, Equatable {
        let ran: Bool
        let ok: Bool?
        let reason: String?
    }

    struct Limits: Decodable, Equatable {
        let maxTicketUsd: Double
        let minTicketUsd: Double
        let defaultSlippagePct: Double
        let maxSlippagePct: Double
        let maxPriceImpactPct: Double
        let deadlineSec: Int
    }

    struct StockReference: Decodable, Equatable {
        let symbol: String
        let usdPrice: Double
        let ageSec: Int
        let multiplierHuman: Double
        let marketDeviationPct: Double
        let pausedFeatures: String
        let transferPaused: Bool
    }

    let chainId: Int
    let venue: Venue
    let tokenIn: BaseSwapTokenView
    let tokenOut: BaseSwapTokenView
    let amountIn: String
    let amountInRaw: String
    let amountOut: String
    let amountOutRaw: String
    let minAmountOut: String
    let minAmountOutRaw: String
    let executionPrice: Double
    let priceImpactPct: Double?
    let usdValue: Double?
    let slippagePct: Double
    let deadline: Int
    let route: Route
    let recipient: String?
    let tx: BaseSwapTransactionSet?
    let allowanceRaw: String?
    let simulation: Simulation
    let txWithheld: [String]
    let warnings: [String]
    let limits: Limits
    let requiresStockEligibility: Bool
    let stockReference: StockReference?
}

enum BaseSwapSecurityError: LocalizedError, Equatable {
    case refused(String)

    var errorDescription: String? {
        switch self {
        case .refused(let reason):
            return L.t("Unsafe transaction refused: \(reason)", "Transacción insegura rechazada: \(reason)")
        }
    }
}

enum BaseSwapGuard {
    static let chainId = 8453
    static let router = "0x2626664c2603336e57b271c5c0b26f421741e481"
    static let allowedFees = Set([100, 500, 3000, 10_000])
    static let tokenAddresses: [String: String] = [
        "USDC": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        "AAPLc": "0xb200000000000000000000c2e324d24d7eecd1fb",
        "GOOGLc": "0xb2000000000000000000002d0ba3164cc74f58b7",
        "METAc": "0xb2000000000000000000008bc8786b856e61707c",
        "NVDAc": "0xb20000000000000000000078ee7ce2fe4908108c",
    ]

    private static let approveSelector: [UInt8] = [0x09, 0x5e, 0xa7, 0xb3]
    private static let multicallSelector: [UInt8] = [0x5a, 0xe4, 0x01, 0xdc]
    private static let exactInputSingleSelector: [UInt8] = [0x04, 0xe4, 0x5a, 0xaf]

    static func validateQuote(
        _ quote: BaseSwapQuote,
        inputAmount: String,
        slippagePct requestedSlippagePct: Double,
        wallet: String,
        now: Date = Date()
    ) throws {
        try require(quote.chainId == chainId, "quote is not on Base")
        try require(quote.venue.router.lowercased() == router, "quote names another router")
        try validateToken(quote.tokenIn)
        try validateToken(quote.tokenOut)
        let symbols = Set([quote.tokenIn.symbol, quote.tokenOut.symbol])
        try require(symbols.contains("USDC") && symbols.count == 2, "only direct USDC/stock pairs are allowed")
        try require(symbols.contains(where: { $0 != "USDC" && tokenAddresses[$0] != nil }), "stock token is not pinned")
        let inputRaw = try rawAmount(inputAmount, decimals: quote.tokenIn.decimals)
        try require(inputRaw != "0", "input amount is zero")
        try require(inputRaw == quote.amountInRaw, "input amount changed since the quote")
        try require(try rawAmount(quote.amountIn, decimals: quote.tokenIn.decimals) == quote.amountInRaw, "displayed input differs from raw units")
        try require(try rawAmount(quote.amountOut, decimals: quote.tokenOut.decimals) == quote.amountOutRaw, "displayed output differs from raw units")
        try require(try rawAmount(quote.minAmountOut, decimals: quote.tokenOut.decimals) == quote.minAmountOutRaw, "displayed minimum differs from raw units")
        try require(isCanonicalInteger(quote.amountInRaw) && isCanonicalInteger(quote.amountOutRaw) && isCanonicalInteger(quote.minAmountOutRaw), "quote amounts are not canonical integers")
        try require(quote.amountOutRaw != "0" && quote.minAmountOutRaw != "0", "quote output is zero")

        try require(requestedSlippagePct >= 0.05 && requestedSlippagePct <= 3, "requested slippage is outside the app limit")
        try require(abs(quote.slippagePct - requestedSlippagePct) < 0.000_001, "quote changed the requested slippage")
        let basisPoints = Int((quote.slippagePct * 100).rounded())
        try require(abs(Double(basisPoints) / 100 - quote.slippagePct) < 0.000_001, "quote slippage is not basis-point precise")
        let expectedMinOut = try multiplyAndDivide(quote.amountOutRaw, multiplier: 10_000 - basisPoints, divisor: 10_000)
        try require(quote.minAmountOutRaw == expectedMinOut, "minimum received was not derived from output and slippage")

        try require(quote.requiresStockEligibility, "quote does not identify the stock eligibility gate")
        try require(quote.route.kind == "single" && quote.route.fees.count == 1 && allowedFees.contains(quote.route.fees[0]), "route is not a pinned direct V3 pool")
        try require(quote.limits.minTicketUsd == 1 && quote.limits.maxTicketUsd >= 1 && quote.limits.maxTicketUsd <= 100, "server ticket limits exceed the app policy")
        try require(quote.limits.defaultSlippagePct == 0.5 && quote.limits.maxSlippagePct == 3, "server slippage limits differ from the app policy")
        try require(quote.limits.maxPriceImpactPct == 3 && quote.limits.deadlineSec == 1_200, "server execution limits differ from the app policy")
        try require(quote.priceImpactPct != nil && abs(quote.priceImpactPct!) <= min(3, quote.limits.maxPriceImpactPct), "price impact is unavailable or over 3%")
        try require(quote.usdValue != nil && quote.usdValue! >= max(1, quote.limits.minTicketUsd) && quote.usdValue! <= min(100, quote.limits.maxTicketUsd), "ticket is outside the $1-$100 limit")
        guard let reference = quote.stockReference else { throw BaseSwapSecurityError.refused("stock reference is missing") }
        let stock = quote.tokenIn.symbol == "USDC" ? quote.tokenOut.symbol : quote.tokenIn.symbol
        try require(reference.symbol == stock, "stock reference is for another token")
        try require(reference.usdPrice > 0 && reference.multiplierHuman > 0, "stock reference values are invalid")
        try require(reference.ageSec >= 0 && reference.ageSec <= 96 * 60 * 60, "stock reference is stale")
        try require(reference.marketDeviationPct >= 0 && reference.marketDeviationPct <= 5, "stock reference deviation is over 5%")
        try require(!reference.transferPaused, "issuer has paused transfers")
        if let transactions = quote.tx {
            let seconds = Int(now.timeIntervalSince1970)
            try require(transactions.chainId == chainId, "transaction set is not on Base")
            try require((transactions.approve == nil) != (transactions.swap == nil), "transaction set must contain exactly one next action")
            try require(quote.recipient?.lowercased() == wallet.lowercased(), "recipient is not the connected wallet")
            try require(quote.txWithheld.isEmpty, "the server withheld this transaction")
            try require(quote.deadline == transactions.deadline, "transaction deadline differs from the quote")
            try require(quote.deadline > seconds + 15 && quote.deadline <= seconds + 1_230, "quote is expired or has an excessive deadline")
            if transactions.swap != nil {
                try require(quote.simulation.ran && quote.simulation.ok == true, "swap was not successfully simulated")
            }
        }
    }

    static func validateApproval(_ tx: BaseSwapTransaction, quote: BaseSwapQuote) throws {
        try require(quote.tx?.approve == tx && quote.tx?.swap == nil, "approval does not belong to this quote")
        try require(tx.to.lowercased() == quote.tokenIn.address.lowercased(), "approval targets another token")
        try require(isZero(tx.value), "approval transfers native value")
        let bytes = try decodeHex(tx.data)
        try require(bytes.count == 68 && Array(bytes[0..<4]) == approveSelector, "approval is not ERC-20 approve")
        try require(addressWord(bytes, at: 4) == router, "approval spender is not the pinned router")
        try require(decimalMatchesWord(quote.amountInRaw, bytes: bytes, at: 36), "approval amount is not exact")
        try require(tx.spender?.lowercased() == router, "disclosed spender differs from calldata")
        try require(tx.amount == quote.amountInRaw, "disclosed approval amount differs from the quote")
    }

    static func validateRevoke(_ tx: BaseSwapTransaction, quote: BaseSwapQuote) throws {
        try require(quote.tx?.revoke == tx, "revoke does not belong to this quote")
        try require(tx.to.lowercased() == quote.tokenIn.address.lowercased(), "revoke targets another token")
        try require(isZero(tx.value), "revoke transfers native value")
        let bytes = try decodeHex(tx.data)
        try require(bytes.count == 68 && Array(bytes[0..<4]) == approveSelector, "revoke is not ERC-20 approve")
        try require(addressWord(bytes, at: 4) == router, "revoke spender is not the pinned router")
        try require(wordIsZero(bytes, at: 36), "revoke amount is not zero")
        try require(tx.spender?.lowercased() == router, "disclosed revoke spender differs from calldata")
    }

    static func validateSwap(_ tx: BaseSwapTransaction, quote: BaseSwapQuote, wallet: String, now: Date = Date()) throws {
        try require(quote.tx?.swap == tx && quote.tx?.approve == nil, "swap does not belong to this quote")
        try require(tx.to.lowercased() == router, "swap targets another router")
        try require(isZero(tx.value), "stock swap transfers native value")
        try require(quote.simulation.ran && quote.simulation.ok == true, "swap was not successfully simulated")
        let seconds = Int(now.timeIntervalSince1970)
        try require(quote.deadline > seconds + 15 && quote.deadline <= seconds + quote.limits.deadlineSec + 30, "quote is expired or has an excessive deadline")

        let outer = try decodeHex(tx.data)
        try require(outer.count >= 164 && Array(outer[0..<4]) == multicallSelector, "swap is not deadline-protected multicall")
        try require(readSmallUInt(outer, at: 4) == quote.deadline, "calldata deadline differs from the quote")
        try require(readSmallUInt(outer, at: 36) == 64, "multicall array offset is malformed")
        let arrayStart = 68
        try require(readSmallUInt(outer, at: arrayStart) == 1, "stock swap must contain exactly one router call")
        try require(readSmallUInt(outer, at: arrayStart + 32) == 32, "inner-call offset is malformed")
        let innerLengthWord = arrayStart + 64
        let innerLength = try readSmallUInt(outer, at: innerLengthWord)
        try require(innerLength == 228, "inner call has an unexpected size")
        let innerStart = innerLengthWord + 32
        try require(outer.count >= innerStart + innerLength, "inner call is truncated")
        let paddedEnd = innerStart + ((innerLength + 31) / 32) * 32
        try require(outer.count == paddedEnd && outer[(innerStart + innerLength)..<paddedEnd].allSatisfy { $0 == 0 }, "multicall has unexpected trailing bytes")
        let inner = Array(outer[innerStart..<(innerStart + innerLength)])
        try require(Array(inner[0..<4]) == exactInputSingleSelector, "inner call is not exactInputSingle")
        try require(addressWord(inner, at: 4) == quote.tokenIn.address.lowercased(), "calldata input token differs from the quote")
        try require(addressWord(inner, at: 36) == quote.tokenOut.address.lowercased(), "calldata output token differs from the quote")
        let fee = try readSmallUInt(inner, at: 68)
        try require(allowedFees.contains(fee) && quote.route.fees == [fee], "calldata fee differs from the quoted pool")
        try require(addressWord(inner, at: 100) == wallet.lowercased(), "calldata recipient is not the connected wallet")
        try require(decimalMatchesWord(quote.amountInRaw, bytes: inner, at: 132), "calldata input amount differs from the quote")
        try require(decimalMatchesWord(quote.minAmountOutRaw, bytes: inner, at: 164), "calldata minimum received differs from the quote")
        try require(wordIsZero(inner, at: 196), "unexpected sqrt price limit")
    }

    static func rawAmount(_ amount: String, decimals: Int) throws -> String {
        let text = amount.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.range(of: #"^\d{1,18}(\.\d{1,18})?$"#, options: .regularExpression) != nil else {
            throw BaseSwapSecurityError.refused("amount is malformed")
        }
        let pieces = text.split(separator: ".", omittingEmptySubsequences: false)
        let whole = String(pieces[0])
        let fraction = pieces.count == 2 ? String(pieces[1]) : ""
        guard fraction.count <= decimals else { throw BaseSwapSecurityError.refused("amount has too many decimals") }
        let combined = whole + fraction + String(repeating: "0", count: decimals - fraction.count)
        let normalized = combined.drop(while: { $0 == "0" })
        return normalized.isEmpty ? "0" : String(normalized)
    }

    private static func validateToken(_ token: BaseSwapTokenView) throws {
        guard let pinned = tokenAddresses[token.symbol] else { throw BaseSwapSecurityError.refused("token is not pinned") }
        try require(token.address.lowercased() == pinned, "token address differs from the app allow-list")
        try require((token.symbol == "USDC" && token.decimals == 6) || (token.symbol != "USDC" && token.decimals == 8), "token decimals differ from the app allow-list")
    }

    private static func require(_ condition: Bool, _ reason: String) throws {
        if !condition { throw BaseSwapSecurityError.refused(reason) }
    }

    private static func isZero(_ hex: String) -> Bool {
        guard hex.hasPrefix("0x"), !hex.dropFirst(2).isEmpty else { return false }
        return hex.dropFirst(2).allSatisfy { $0 == "0" }
    }

    private static func decodeHex(_ value: String) throws -> [UInt8] {
        guard value.hasPrefix("0x") else { throw BaseSwapSecurityError.refused("calldata is not hex") }
        let hex = String(value.dropFirst(2))
        guard !hex.isEmpty, hex.count.isMultiple(of: 2), hex.allSatisfy({ $0.isHexDigit }) else {
            throw BaseSwapSecurityError.refused("calldata is malformed")
        }
        var bytes: [UInt8] = []
        bytes.reserveCapacity(hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<next], radix: 16) else { throw BaseSwapSecurityError.refused("calldata is malformed") }
            bytes.append(byte)
            index = next
        }
        return bytes
    }

    private static func addressWord(_ bytes: [UInt8], at offset: Int) throws -> String {
        guard offset >= 0, offset + 32 <= bytes.count else { throw BaseSwapSecurityError.refused("calldata word is truncated") }
        try require(bytes[offset..<(offset + 12)].allSatisfy { $0 == 0 }, "address word is not canonical")
        return "0x" + bytes[(offset + 12)..<(offset + 32)].map { String(format: "%02x", $0) }.joined()
    }

    private static func readSmallUInt(_ bytes: [UInt8], at offset: Int) throws -> Int {
        guard offset >= 0, offset + 32 <= bytes.count else { throw BaseSwapSecurityError.refused("calldata integer is truncated") }
        try require(bytes[offset..<(offset + 24)].allSatisfy { $0 == 0 }, "calldata integer is too large")
        var value: UInt64 = 0
        for byte in bytes[(offset + 24)..<(offset + 32)] {
            value = (value << 8) | UInt64(truncatingIfNeeded: byte)
        }
        guard value <= UInt64(Int.max) else { throw BaseSwapSecurityError.refused("calldata integer is too large") }
        return Int(value)
    }

    private static func wordIsZero(_ bytes: [UInt8], at offset: Int) -> Bool {
        offset >= 0 && offset + 32 <= bytes.count && bytes[offset..<(offset + 32)].allSatisfy { $0 == 0 }
    }

    private static func decimalMatchesWord(_ decimal: String, bytes: [UInt8], at offset: Int) throws -> Bool {
        guard offset >= 0, offset + 32 <= bytes.count else { throw BaseSwapSecurityError.refused("calldata amount is truncated") }
        guard isCanonicalInteger(decimal) else { throw BaseSwapSecurityError.refused("calldata amount is not canonical") }
        let actual = bytes[offset..<(offset + 32)].drop(while: { $0 == 0 }).map { String(format: "%02x", $0) }.joined()
        let expected = decimalToHex(decimal)
        guard expected.count <= 64 else { throw BaseSwapSecurityError.refused("calldata amount exceeds uint256") }
        return (actual.isEmpty ? "0" : actual) == expected
    }

    private static func isCanonicalInteger(_ value: String) -> Bool {
        value.range(of: #"^(0|[1-9]\d*)$"#, options: .regularExpression) != nil
    }

    /// Multiplies an arbitrarily long decimal integer by a small integer and
    /// performs floor division, matching the server's basis-point bigint math.
    private static func multiplyAndDivide(_ decimal: String, multiplier: Int, divisor: Int) throws -> String {
        guard isCanonicalInteger(decimal), multiplier >= 0, divisor > 0 else {
            throw BaseSwapSecurityError.refused("minimum received inputs are malformed")
        }
        var product: [Int] = []
        var carry = 0
        for digit in decimal.reversed() {
            guard let value = digit.wholeNumberValue else { throw BaseSwapSecurityError.refused("minimum received input is malformed") }
            let next = value * multiplier + carry
            product.append(next % 10)
            carry = next / 10
        }
        while carry > 0 {
            product.append(carry % 10)
            carry /= 10
        }
        var quotient: [Int] = []
        var remainder = 0
        for digit in product.reversed() {
            let next = remainder * 10 + digit
            quotient.append(next / divisor)
            remainder = next % divisor
        }
        while quotient.first == 0 && quotient.count > 1 { quotient.removeFirst() }
        return quotient.map(String.init).joined()
    }

    /// Decimal-to-hex without floating point or a third-party big-integer API.
    private static func decimalToHex(_ decimal: String) -> String {
        var digits = decimal.compactMap(\.wholeNumberValue)
        guard !digits.isEmpty else { return "" }
        var output = ""
        let alphabet = Array("0123456789abcdef")
        while digits.contains(where: { $0 != 0 }) {
            var quotient: [Int] = []
            var remainder = 0
            for digit in digits {
                let value = remainder * 10 + digit
                if !quotient.isEmpty || value / 16 != 0 { quotient.append(value / 16) }
                remainder = value % 16
            }
            output.append(alphabet[remainder])
            digits = quotient.isEmpty ? [0] : quotient
        }
        return output.isEmpty ? "0" : String(output.reversed())
    }
}

enum BaseSwapAPIError: LocalizedError {
    case response(String)
    case pendingTimeout
    case reverted

    var errorDescription: String? {
        switch self {
        case .response(let message): return message
        case .pendingTimeout: return L.t("The transaction is still pending. Check it in BaseScan.", "La transacción sigue pendiente. Revísala en BaseScan.")
        case .reverted: return L.t("The transaction reverted on Base.", "La transacción revirtió en Base.")
        }
    }
}

enum BaseSwapAPI {
    private struct Envelope: Decodable {
        let ok: Bool
        let quote: BaseSwapQuote?
        let error: String?
    }

    static func quote(
        tokenIn: String,
        tokenOut: String,
        amount: String,
        slippagePct: Double,
        wallet: String,
        eligible: Bool,
        session: BobbyWalletSession
    ) async throws -> BaseSwapQuote {
        var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/base-swap"))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(WalletBridge.origin, forHTTPHeaderField: "Origin")
        request.setValue(session.token, forHTTPHeaderField: "x-bobby-session")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "tokenIn": tokenIn,
            "tokenOut": tokenOut,
            "amount": amount,
            "slippagePct": slippagePct,
            "wallet": wallet,
            "stockEligibilityConfirmed": eligible,
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let envelope = try? JSONDecoder.bobby.decode(Envelope.self, from: data)
        guard (200..<300).contains(status), envelope?.ok == true, let quote = envelope?.quote else {
            throw BaseSwapAPIError.response(envelope?.error ?? "HTTP \(status)")
        }
        return quote
    }

    static func waitForSuccessfulReceipt(_ txHash: String) async throws {
        let endpoint = URL(string: "https://mainnet.base.org")!
        for attempt in 0..<30 {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.timeoutInterval = 15
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "jsonrpc": "2.0",
                "id": attempt + 1,
                "method": "eth_getTransactionReceipt",
                "params": [txHash],
            ])
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200..<300).contains(status),
               let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let receipt = object["result"] as? [String: Any],
               let chainStatus = receipt["status"] as? String {
                guard chainStatus == "0x1" else { throw BaseSwapAPIError.reverted }
                return
            }
            try await Task.sleep(for: .seconds(min(2 + attempt / 6, 6)))
        }
        throw BaseSwapAPIError.pendingTimeout
    }

    static func recordReceipt(txHash: String, wallet: String, session: BobbyWalletSession) async throws -> String {
        for attempt in 0..<6 {
            var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/swap-receipt"))
            request.httpMethod = "POST"
            request.timeoutInterval = 30
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(WalletBridge.origin, forHTTPHeaderField: "Origin")
            request.setValue(session.token, forHTTPHeaderField: "x-bobby-session")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "txHash": txHash,
                "wallet": wallet,
                "platform": "ios",
            ])
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            if status == 202 {
                try await Task.sleep(for: .seconds(2 * (attempt + 1)))
                continue
            }
            guard (200..<300).contains(status), object?["ok"] as? Bool == true else {
                throw BaseSwapAPIError.response((object?["error"] as? String) ?? "HTTP \(status)")
            }
            let receipt = object?["receipt"] as? [String: Any]
            return receipt?["outcome"] as? String ?? "confirmed"
        }
        throw BaseSwapAPIError.pendingTimeout
    }
}
