import XCTest
@testable import Bobby

final class BaseSwapGuardTests: XCTestCase {
    private let wallet = "0x1111111111111111111111111111111111111111"
    private let deadline = 1_788_540_428

    func testAcceptsPinnedApprovalAndDirectSwap() throws {
        let approval = BaseSwapTransaction(
            to: BaseSwapGuard.tokenAddresses["USDC"]!,
            data: approvalData(spender: BaseSwapGuard.router, amountHex: "989680"),
            value: "0x0",
            spender: BaseSwapGuard.router,
            amount: "10000000"
        )
        let approvalQuote = quote(tx: .init(chainId: 8453, approve: approval, swap: nil, revoke: nil, deadline: deadline))
        try BaseSwapGuard.validateQuote(approvalQuote, inputAmount: "10.0", slippagePct: 0.5, wallet: wallet, now: Date(timeIntervalSince1970: 1_788_540_000))
        try BaseSwapGuard.validateApproval(approval, quote: approvalQuote)

        let swap = BaseSwapTransaction(to: BaseSwapGuard.router, data: validSwapData, value: "0x0", spender: nil, amount: nil)
        let swapQuote = quote(tx: .init(chainId: 8453, approve: nil, swap: swap, revoke: nil, deadline: deadline))
        try BaseSwapGuard.validateQuote(swapQuote, inputAmount: "10", slippagePct: 0.5, wallet: wallet, now: Date(timeIntervalSince1970: 1_788_540_000))
        try BaseSwapGuard.validateSwap(swap, quote: swapQuote, wallet: wallet, now: Date(timeIntervalSince1970: 1_788_540_000))
    }

    func testRejectsApprovalSpenderTampering() throws {
        let approval = BaseSwapTransaction(
            to: BaseSwapGuard.tokenAddresses["USDC"]!,
            data: approvalData(spender: "0x2222222222222222222222222222222222222222", amountHex: "989680"),
            value: "0x0",
            spender: BaseSwapGuard.router,
            amount: "10000000"
        )
        let value = quote(tx: .init(chainId: 8453, approve: approval, swap: nil, revoke: nil, deadline: deadline))
        XCTAssertThrowsError(try BaseSwapGuard.validateApproval(approval, quote: value))
    }

    func testRejectsSwapRecipientTampering() throws {
        let tampered = validSwapData.replacingOccurrences(
            of: "1111111111111111111111111111111111111111",
            with: "2222222222222222222222222222222222222222"
        )
        let transaction = BaseSwapTransaction(to: BaseSwapGuard.router, data: tampered, value: "0x0", spender: nil, amount: nil)
        let value = quote(tx: .init(chainId: 8453, approve: nil, swap: transaction, revoke: nil, deadline: deadline))
        XCTAssertThrowsError(try BaseSwapGuard.validateSwap(transaction, quote: value, wallet: wallet, now: Date(timeIntervalSince1970: 1_788_540_000)))
    }

    func testRejectsQuoteAddressAndAmountDrift() throws {
        var value = quote(tx: nil)
        value = BaseSwapQuote(
            chainId: value.chainId,
            venue: value.venue,
            tokenIn: .init(symbol: "USDC", name: "USD Coin", address: "0x2222222222222222222222222222222222222222", decimals: 6),
            tokenOut: value.tokenOut,
            amountIn: value.amountIn,
            amountInRaw: value.amountInRaw,
            amountOut: value.amountOut,
            amountOutRaw: value.amountOutRaw,
            minAmountOut: value.minAmountOut,
            minAmountOutRaw: value.minAmountOutRaw,
            executionPrice: value.executionPrice,
            priceImpactPct: value.priceImpactPct,
            usdValue: value.usdValue,
            slippagePct: value.slippagePct,
            deadline: value.deadline,
            route: value.route,
            recipient: value.recipient,
            tx: value.tx,
            allowanceRaw: value.allowanceRaw,
            simulation: value.simulation,
            txWithheld: value.txWithheld,
            warnings: value.warnings,
            limits: value.limits,
            requiresStockEligibility: value.requiresStockEligibility,
            stockReference: value.stockReference
        )
        XCTAssertThrowsError(try BaseSwapGuard.validateQuote(value, inputAmount: "10", slippagePct: 0.5, wallet: wallet))
        XCTAssertThrowsError(try BaseSwapGuard.validateQuote(quote(tx: nil), inputAmount: "11", slippagePct: 0.5, wallet: wallet))
    }

    func testRejectsSlippageAndMinimumReceivedDrift() throws {
        let drifted = quote(tx: nil, minAmountOut: "0.04", minAmountOutRaw: "4000000")
        XCTAssertThrowsError(try BaseSwapGuard.validateQuote(drifted, inputAmount: "10", slippagePct: 0.5, wallet: wallet))
        XCTAssertThrowsError(try BaseSwapGuard.validateQuote(quote(tx: nil), inputAmount: "10", slippagePct: 0.1, wallet: wallet))
    }

    func testRawAmountUsesIntegerMath() throws {
        XCTAssertEqual(try BaseSwapGuard.rawAmount("10", decimals: 6), "10000000")
        XCTAssertEqual(try BaseSwapGuard.rawAmount("0.00000001", decimals: 8), "1")
        XCTAssertThrowsError(try BaseSwapGuard.rawAmount("1.0000001", decimals: 6))
    }

    private func quote(
        tx: BaseSwapTransactionSet?,
        minAmountOut: String = "0.04283114",
        minAmountOutRaw: String = "4283114"
    ) -> BaseSwapQuote {
        BaseSwapQuote(
            chainId: 8453,
            venue: .init(name: "Uniswap V3 (SwapRouter02)", router: BaseSwapGuard.router),
            tokenIn: .init(symbol: "USDC", name: "USD Coin", address: BaseSwapGuard.tokenAddresses["USDC"]!, decimals: 6),
            tokenOut: .init(symbol: "NVDAc", name: "Coinbase Tokenized NVIDIA", address: BaseSwapGuard.tokenAddresses["NVDAc"]!, decimals: 8),
            amountIn: "10",
            amountInRaw: "10000000",
            amountOut: "0.04304638",
            amountOutRaw: "4304638",
            minAmountOut: minAmountOut,
            minAmountOutRaw: minAmountOutRaw,
            executionPrice: 0.004304638,
            priceImpactPct: 0.3,
            usdValue: 10,
            slippagePct: 0.5,
            deadline: deadline,
            route: .init(kind: "single", fees: [3000], description: "USDC → NVDAc (0.3%)", gasEstimate: "93242"),
            recipient: wallet,
            tx: tx,
            allowanceRaw: "10000000",
            simulation: .init(ran: true, ok: true, reason: nil),
            txWithheld: [],
            warnings: [],
            limits: .init(maxTicketUsd: 100, minTicketUsd: 1, defaultSlippagePct: 0.5, maxSlippagePct: 3, maxPriceImpactPct: 3, deadlineSec: 1200),
            requiresStockEligibility: true,
            stockReference: .init(symbol: "NVDAc", usdPrice: 231.14, ageSec: 60, multiplierHuman: 1, marketDeviationPct: 0.5, pausedFeatures: "0", transferPaused: false)
        )
    }

    private func approvalData(spender: String, amountHex: String) -> String {
        let address = String(spender.lowercased().dropFirst(2))
        return "0x095ea7b3" + String(repeating: "0", count: 64 - address.count) + address
            + String(repeating: "0", count: 64 - amountHex.count) + amountHex
    }

    private var validSwapData: String {
        "0x5ae401dc"
            + word("6a9af60c")
            + word("40")
            + word("1")
            + word("20")
            + word("e4")
            + "04e45aaf"
            + word(String(BaseSwapGuard.tokenAddresses["USDC"]!.dropFirst(2)))
            + word(String(BaseSwapGuard.tokenAddresses["NVDAc"]!.dropFirst(2)))
            + word("bb8")
            + word(String(wallet.dropFirst(2)))
            + word("989680")
            + word("415aea")
            + word("0")
            + String(repeating: "0", count: 56)
    }

    private func word(_ hex: String) -> String {
        String(repeating: "0", count: 64 - hex.count) + hex
    }
}
