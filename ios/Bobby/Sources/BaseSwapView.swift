import SwiftUI

struct BaseSwapView: View {
    private enum Side: String, CaseIterable, Identifiable {
        case buy
        case sell
        var id: String { rawValue }
    }

    private enum Phase: Equatable {
        case idle
        case loading
        case quoted
        case signing(String)
        case confirming
        case confirmed(String)
        case error(String)

        var busy: Bool {
            switch self {
            case .loading, .signing, .confirming: return true
            default: return false
            }
        }
    }

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var wallet = WalletBridge.shared
    @State private var side: Side = .buy
    @State private var stock: String
    @State private var amount = "10"
    @State private var slippage = 0.5
    @State private var eligibilityAccepted = false
    @State private var quote: BaseSwapQuote?
    @State private var phase: Phase = .idle
    @State private var txHash: String?

    private static let stocks = ["AAPLc", "GOOGLc", "METAc", "NVDAc"]

    init(defaultSymbol: String? = nil) {
        let normalized = (defaultSymbol ?? "NVDA").uppercased().replacingOccurrences(of: "C", with: "c")
        let aliases = ["AAPL": "AAPLc", "GOOGL": "GOOGLc", "GOOG": "GOOGLc", "META": "METAc", "NVDA": "NVDAc"]
        let selected = Self.stocks.contains(normalized) ? normalized : aliases[(defaultSymbol ?? "NVDA").uppercased()] ?? "NVDAc"
        _stock = State(initialValue: selected)
    }

    private var tokenIn: String { side == .buy ? "USDC" : stock }
    private var tokenOut: String { side == .buy ? stock : "USDC" }
    private var explorerURL: URL? {
        txHash.flatMap { URL(string: "https://basescan.org/tx/\($0)") }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    custodyNotice
                    walletCard
                    tradeForm
                    if let quote { quoteCard(quote) }
                    statusCard
                }
                .padding(18)
            }
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle(L.t("Base swap", "Swap en Base"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L.t("Done", "Listo")) { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(Theme.bg)
        .onChange(of: side) { resetQuote() }
        .onChange(of: stock) { resetQuote() }
        .onChange(of: amount) { resetQuote() }
        .onChange(of: slippage) { resetQuote() }
        .onChange(of: eligibilityAccepted) { resetQuote() }
    }

    private var custodyNotice: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(L.t("You sign. Bobby never takes custody.", "Tú firmas. Bobby nunca toma custodia."), systemImage: "lock.shield")
                .font(.mono(12, .bold))
                .foregroundStyle(Theme.up)
            Text(L.t(
                "Bobby prepares and checks transaction data for your connected wallet. Your wallet shows the final request and only you can approve it.",
                "Bobby prepara y verifica los datos de transacción para tu wallet conectada. Tu wallet muestra la solicitud final y sólo tú puedes aprobarla."
            ))
            .font(.rounded(13, .medium))
            .foregroundStyle(Theme.muted)
        }
        .padding(14)
        .background(Theme.up.opacity(0.055))
        .clipShape(RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(Theme.up.opacity(0.22), lineWidth: 1))
    }

    private var walletCard: some View {
        HStack(spacing: 12) {
            Image(systemName: wallet.connected ? "checkmark.circle.fill" : "wallet.bifold")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(wallet.connected ? Theme.up : Theme.accentSoft)
            VStack(alignment: .leading, spacing: 3) {
                Text(wallet.connected ? short(wallet.address ?? "") : L.t("No wallet connected", "Sin wallet conectada"))
                    .font(.mono(12, .bold))
                    .foregroundStyle(Theme.text)
                Text(wallet.connected ? "BASE · CHAIN 8453" : "REOWN · NON-CUSTODIAL")
                    .font(.mono(8, .bold))
                    .kerning(1.1)
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            if wallet.connected {
                Button(L.t("Disconnect", "Desconectar")) { Task { await wallet.disconnect() } }
                    .font(.mono(9, .bold))
                    .foregroundStyle(Theme.muted)
            } else {
                Button(L.t("Connect", "Conectar")) { wallet.presentWallet() }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
            }
        }
        .disabled(phase.busy)
        .padding(14)
        .card()
    }

    private var tradeForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker(L.t("Side", "Lado"), selection: $side) {
                Text(L.t("Buy", "Comprar")).tag(Side.buy)
                Text(L.t("Sell", "Vender")).tag(Side.sell)
            }
            .pickerStyle(.segmented)
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(L.t("YOU PAY", "PAGAS")).fieldLabel()
                    HStack {
                        TextField("10", text: $amount)
                            .keyboardType(.decimalPad)
                            .font(.mono(20, .bold))
                            .foregroundStyle(Theme.text)
                        Text(tokenIn).font(.mono(12, .bold)).foregroundStyle(Theme.accentSoft)
                    }
                }
                .tradeField()
                Image(systemName: "arrow.right").foregroundStyle(Theme.muted)
                VStack(alignment: .leading, spacing: 5) {
                    Text(L.t("YOU RECEIVE", "RECIBES")).fieldLabel()
                    HStack {
                        Text(quote.map { format($0.amountOut) } ?? "—")
                            .font(.mono(20, .bold))
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                            .minimumScaleFactor(0.65)
                        Text(tokenOut).font(.mono(12, .bold)).foregroundStyle(Theme.up)
                    }
                }
                .tradeField()
            }
            Picker(L.t("Stock token", "Token de acción"), selection: $stock) {
                ForEach(Self.stocks, id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.menu)
            HStack {
                Text(L.t("Slippage", "Deslizamiento")).font(.mono(10, .bold)).foregroundStyle(Theme.muted)
                Spacer()
                Picker("", selection: $slippage) {
                    Text("0.1%").tag(0.1)
                    Text("0.5%").tag(0.5)
                    Text("1.0%").tag(1.0)
                }
                .pickerStyle(.segmented)
                .frame(width: 190)
            }
            Button {
                eligibilityAccepted.toggle()
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: eligibilityAccepted ? "checkmark.square.fill" : "square")
                        .foregroundStyle(eligibilityAccepted ? Theme.up : Theme.muted)
                    Text(L.t(
                        "I am in an eligible jurisdiction outside the U.S. I understand this B20 token is not the underlying share, and I will check the contract, chain and minimum received before signing.",
                        "Estoy en una jurisdicción elegible fuera de EE. UU. Entiendo que este token B20 no es la acción subyacente y revisaré contrato, red y mínimo recibido antes de firmar."
                    ))
                    .font(.rounded(12, .medium))
                    .foregroundStyle(Theme.text.opacity(0.72))
                    .multilineTextAlignment(.leading)
                }
            }
            .buttonStyle(.plain)
            Button {
                Task { await loadQuote() }
            } label: {
                Label(
                    phase == .loading ? L.t("Checking…", "Verificando…") : L.t("Review live quote", "Revisar cotización en vivo"),
                    systemImage: "doc.text.magnifyingglass"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.up)
            .disabled(!wallet.connected || !eligibilityAccepted || amount.isEmpty || phase.busy)
        }
        .disabled(phase.busy)
        .padding(14)
        .card()
    }

    private func quoteCard(_ quote: BaseSwapQuote) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(L.t("REVIEWED QUOTE", "COTIZACIÓN REVISADA")).fieldLabel()
                Spacer()
                Text("BASE 8453").font(.mono(9, .bold)).foregroundStyle(Theme.accentSoft)
            }
            row(L.t("Route", "Ruta"), quote.route.description)
            row(L.t("Minimum received", "Mínimo recibido"), "\(format(quote.minAmountOut)) \(quote.tokenOut.symbol)")
            row(L.t("Price impact", "Impacto en precio"), quote.priceImpactPct.map { String(format: "%.2f%%", $0) } ?? "—")
            row(L.t("Router", "Router"), short(quote.venue.router))
            if let reference = quote.stockReference {
                row(L.t("Official reference", "Referencia oficial"), String(format: "$%.2f · %.2f%% away", reference.usdPrice, reference.marketDeviationPct))
            }
            ForEach(quote.warnings, id: \.self) { warning in
                Label(warning, systemImage: "exclamationmark.triangle")
                    .font(.mono(9, .medium))
                    .foregroundStyle(Color.orange)
            }
            ForEach(quote.txWithheld, id: \.self) { reason in
                Label(reason, systemImage: "lock.fill")
                    .font(.mono(9, .medium))
                    .foregroundStyle(Theme.down)
            }
            if let approval = quote.tx?.approve {
                Text(L.t(
                    "Approval is exact: \(quote.amountIn) \(quote.tokenIn.symbol) to \(short(approval.spender ?? "")). If you stop after approval, revoke the allowance below.",
                    "La aprobación es exacta: \(quote.amountIn) \(quote.tokenIn.symbol) a \(short(approval.spender ?? "")). Si te detienes después, revoca el permiso abajo."
                ))
                .font(.rounded(11, .medium))
                .foregroundStyle(Color.orange.opacity(0.9))
                actionButton(L.t("Approve exact amount", "Aprobar monto exacto"), icon: "checkmark.seal") {
                    await approve(approval, quote: quote)
                }
            } else if let swap = quote.tx?.swap {
                Text(L.t(
                    "Simulation passed. Your wallet will show the pinned Uniswap router and this transaction's final calldata.",
                    "La simulación pasó. Tu wallet mostrará el router fijado de Uniswap y los datos finales de esta transacción."
                ))
                .font(.rounded(11, .medium))
                .foregroundStyle(Theme.up.opacity(0.9))
                actionButton(L.t("Sign swap in wallet", "Firmar swap en la wallet"), icon: "signature") {
                    await execute(swap, quote: quote)
                }
            }
            if let revoke = quote.tx?.revoke {
                Button {
                    Task { await revokeAllowance(revoke, quote: quote) }
                } label: {
                    Label(L.t("Revoke router allowance", "Revocar permiso del router"), systemImage: "xmark.shield")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(Theme.muted)
                .disabled(phase.busy)
            }
        }
        .padding(14)
        .card()
    }

    @ViewBuilder
    private var statusCard: some View {
        switch phase {
        case .idle, .quoted:
            EmptyView()
        case .loading:
            status(L.t("Building and validating the quote…", "Construyendo y validando la cotización…"), color: Theme.accentSoft, spinning: true)
        case .signing(let action):
            status(action, color: Color.orange, spinning: true)
        case .confirming:
            status(L.t("Mined. Verifying the receipt against Base…", "Minada. Verificando el recibo contra Base…"), color: Theme.accentSoft, spinning: true)
        case .confirmed(let note):
            VStack(alignment: .leading, spacing: 10) {
                status(note, color: Theme.up, spinning: false)
                if let explorerURL { Link(L.t("Open in BaseScan", "Abrir en BaseScan"), destination: explorerURL).font(.mono(10, .bold)) }
            }
        case .error(let message):
            status(message, color: Theme.down, spinning: false)
        }
    }

    private func actionButton(_ title: String, icon: String, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Label(title, systemImage: icon).frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(Theme.up)
        .disabled(phase.busy)
    }

    private func loadQuote() async {
        phase = .loading
        txHash = nil
        do {
            let session = try await wallet.ensureSession()
            guard let address = wallet.address else { throw WalletBridgeError.notConnected }
            let next = try await BaseSwapAPI.quote(
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amount: amount,
                slippagePct: slippage,
                wallet: address,
                eligible: eligibilityAccepted,
                session: session
            )
            try BaseSwapGuard.validateQuote(next, inputAmount: amount, slippagePct: slippage, wallet: address)
            self.quote = next
            phase = .quoted
        } catch {
            quote = nil
            phase = .error(friendly(error))
        }
    }

    private func approve(_ transaction: BaseSwapTransaction, quote: BaseSwapQuote) async {
        phase = .signing(L.t("Confirm the exact approval in your wallet…", "Confirma la aprobación exacta en tu wallet…"))
        do {
            guard eligibilityAccepted else {
                throw BaseSwapSecurityError.refused("eligibility confirmation was withdrawn")
            }
            guard let address = wallet.address else { throw WalletBridgeError.notConnected }
            try BaseSwapGuard.validateQuote(quote, inputAmount: amount, slippagePct: slippage, wallet: address)
            try BaseSwapGuard.validateApproval(transaction, quote: quote)
            let hash = try await wallet.sendTransaction(transaction)
            txHash = hash
            try await BaseSwapAPI.waitForSuccessfulReceipt(hash)
            guard eligibilityAccepted else {
                throw BaseSwapSecurityError.refused("eligibility confirmation was withdrawn")
            }
            let session = try await wallet.ensureSession()
            let next = try await BaseSwapAPI.quote(tokenIn: tokenIn, tokenOut: tokenOut, amount: amount, slippagePct: slippage, wallet: address, eligible: eligibilityAccepted, session: session)
            try BaseSwapGuard.validateQuote(next, inputAmount: amount, slippagePct: slippage, wallet: address)
            self.quote = next
            phase = .quoted
        } catch {
            phase = .error(friendly(error))
        }
    }

    private func execute(_ transaction: BaseSwapTransaction, quote: BaseSwapQuote) async {
        phase = .signing(L.t("Confirm the swap in your wallet…", "Confirma el swap en tu wallet…"))
        do {
            guard eligibilityAccepted else {
                throw BaseSwapSecurityError.refused("eligibility confirmation was withdrawn")
            }
            guard let address = wallet.address else { throw WalletBridgeError.notConnected }
            try BaseSwapGuard.validateQuote(quote, inputAmount: amount, slippagePct: slippage, wallet: address)
            try BaseSwapGuard.validateSwap(transaction, quote: quote, wallet: address)
            let session = try await wallet.ensureSession()
            let hash = try await wallet.sendTransaction(transaction)
            txHash = hash
            try await BaseSwapAPI.waitForSuccessfulReceipt(hash)
            phase = .confirming
            let outcome = try await BaseSwapAPI.recordReceipt(txHash: hash, wallet: address, session: session)
            phase = .confirmed(L.t("Verified on Base and recorded (\(outcome)).", "Verificado en Base y registrado (\(outcome))."))
        } catch {
            phase = .error(friendly(error))
        }
    }

    private func revokeAllowance(_ transaction: BaseSwapTransaction, quote: BaseSwapQuote) async {
        phase = .signing(L.t("Confirm the zero-allowance transaction…", "Confirma la transacción de permiso cero…"))
        do {
            try BaseSwapGuard.validateRevoke(transaction, quote: quote)
            let hash = try await wallet.sendTransaction(transaction)
            txHash = hash
            try await BaseSwapAPI.waitForSuccessfulReceipt(hash)
            await loadQuote()
        } catch {
            phase = .error(friendly(error))
        }
    }

    private func resetQuote() {
        guard !phase.busy else { return }
        quote = nil
        txHash = nil
        phase = .idle
    }

    private func friendly(_ error: Error) -> String {
        let text = error.localizedDescription
        if text.lowercased().contains("reject") || text.lowercased().contains("denied") {
            return L.t("Request rejected in the wallet.", "Solicitud rechazada en la wallet.")
        }
        return text
    }

    private func short(_ value: String) -> String {
        guard value.count > 12 else { return value }
        return "\(value.prefix(6))…\(value.suffix(4))"
    }

    private func format(_ value: String) -> String {
        guard let number = Decimal(string: value, locale: Locale(identifier: "en_US_POSIX")) else { return value }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 8
        return formatter.string(from: number as NSDecimalNumber) ?? value
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label).font(.rounded(11, .medium)).foregroundStyle(Theme.muted)
            Spacer()
            Text(value).font(.mono(10, .medium)).foregroundStyle(Theme.text.opacity(0.82)).multilineTextAlignment(.trailing)
        }
    }

    private func status(_ text: String, color: Color, spinning: Bool) -> some View {
        HStack(alignment: .top, spacing: 10) {
            if spinning { ProgressView().tint(color) }
            else { Image(systemName: color == Theme.up ? "checkmark.circle.fill" : "exclamationmark.triangle.fill").foregroundStyle(color) }
            Text(text).font(.rounded(12, .semibold)).foregroundStyle(color).fixedSize(horizontal: false, vertical: true)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 11))
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(color.opacity(0.18), lineWidth: 1))
    }
}

private extension Text {
    func fieldLabel() -> some View {
        font(.mono(8, .bold)).kerning(1.2).foregroundStyle(Theme.muted)
    }
}

private extension View {
    func tradeField() -> some View {
        frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.panel.opacity(0.8))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.stroke, lineWidth: 1))
    }
}
