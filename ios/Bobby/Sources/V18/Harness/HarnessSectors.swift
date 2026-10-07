// The harness (1.8): which sector an asset belongs to. A short curated list of the assets Bobby
// can read (src/lib/okx-asset-search.ts names them), grouped the way people talk about them. An
// asset that is not here has no sector follow-up: nothing is guessed.
import Foundation

struct HarnessSector: Equatable, Identifiable {
    struct Member: Equatable, Identifiable {
        let symbol: String
        let name: String
        var id: String { symbol }
    }

    let id: String
    let isEquity: Bool
    /// In the order people would name them.
    let members: [Member]

    /// The sector's name in the app's language.
    var title: String { HarnessSectors.title(id) }

    /// The asked asset first, then its closest neighbours.
    func board(around symbol: String, limit: Int = 5) -> [Member] {
        let asked = members.filter { $0.symbol == symbol.uppercased() }
        return Array((asked + members.filter { $0.symbol != symbol.uppercased() }).prefix(limit))
    }
}

enum HarnessSectors {
    static let all: [HarnessSector] = [
        equity("semis", [("NVDA", "NVIDIA"), ("AMD", "AMD"), ("TSM", "TSMC"), ("AVGO", "Broadcom"), ("QCOM", "Qualcomm"),
                         ("MU", "Micron"), ("INTC", "Intel"), ("ARM", "Arm"), ("SMCI", "Super Micro")]),
        equity("bigtech", [("AAPL", "Apple"), ("MSFT", "Microsoft"), ("GOOGL", "Alphabet"), ("AMZN", "Amazon"), ("META", "Meta"),
                           ("NFLX", "Netflix")]),
        equity("software", [("PLTR", "Palantir"), ("CRM", "Salesforce"), ("ORCL", "Oracle"), ("ADBE", "Adobe"), ("NOW", "ServiceNow"),
                            ("SNOW", "Snowflake"), ("CRWD", "CrowdStrike"), ("NET", "Cloudflare"), ("SHOP", "Shopify")]),
        equity("cryptostocks", [("COIN", "Coinbase"), ("MSTR", "Strategy"), ("HOOD", "Robinhood")]),
        equity("ev", [("TSLA", "Tesla"), ("RIVN", "Rivian")]),
        equity("health", [("LLY", "Eli Lilly"), ("UNH", "UnitedHealth"), ("JNJ", "Johnson & Johnson"), ("MRNA", "Moderna"),
                          ("ISRG", "Intuitive Surgical")]),
        crypto("majors", [("BTC", "Bitcoin"), ("ETH", "Ethereum")]),
        crypto("layer1", [("SOL", "Solana"), ("AVAX", "Avalanche"), ("ADA", "Cardano"), ("NEAR", "NEAR"), ("APT", "Aptos"),
                          ("TRX", "TRON"), ("DOT", "Polkadot"), ("ATOM", "Cosmos"), ("HBAR", "Hedera")]),
        crypto("layer2", [("ARB", "Arbitrum"), ("OP", "Optimism"), ("POL", "Polygon"), ("STRK", "Starknet"), ("IMX", "Immutable")]),
        crypto("defi", [("LINK", "Chainlink"), ("UNI", "Uniswap"), ("HYPE", "Hyperliquid"), ("ENA", "Ethena"), ("LDO", "Lido"),
                        ("JUP", "Jupiter"), ("CRV", "Curve")]),
        crypto("memes", [("DOGE", "Dogecoin"), ("SHIB", "Shiba Inu"), ("PEPE", "Pepe"), ("WIF", "dogwifhat"), ("BONK", "Bonk"),
                         ("PENGU", "Pudgy Penguins")]),
        crypto("aicrypto", [("FET", "Fetch.ai"), ("RENDER", "Render"), ("WLD", "Worldcoin"), ("VIRTUAL", "Virtuals"), ("GRT", "The Graph")]),
        crypto("payments", [("XRP", "XRP"), ("XLM", "Stellar"), ("LTC", "Litecoin"), ("BCH", "Bitcoin Cash")]),
    ]

    private static let bySymbol: [String: HarnessSector] = {
        var map: [String: HarnessSector] = [:]
        for sector in all { for member in sector.members where map[member.symbol] == nil { map[member.symbol] = sector } }
        return map
    }()

    /// The sector of an asset, when it has one with someone else in it.
    static func sector(of symbol: String) -> HarnessSector? {
        guard let sector = bySymbol[symbol.uppercased()], sector.members.count >= 2 else { return nil }
        return sector
    }

    static func sector(id: String) -> HarnessSector? { all.first { $0.id == id } }

    static func title(_ id: String) -> String {
        switch id {
        case "semis": return L.t("Semiconductors", "Semiconductores")
        case "bigtech": return L.t("Big tech", "Grandes tecnológicas")
        case "software": return L.t("Software", "Software")
        case "cryptostocks": return L.t("Crypto stocks", "Acciones cripto")
        case "ev": return L.t("Electric vehicles", "Autos eléctricos")
        case "health": return L.t("Health care", "Salud")
        case "majors": return L.t("Bitcoin and Ethereum", "Bitcoin y Ethereum")
        case "layer1": return L.t("Layer 1 networks", "Redes de capa 1")
        case "layer2": return L.t("Layer 2 networks", "Redes de capa 2")
        case "defi": return L.t("DeFi", "DeFi")
        case "memes": return L.t("Memecoins", "Memecoins")
        case "aicrypto": return L.t("AI tokens", "Tokens de IA")
        case "payments": return L.t("Payment coins", "Monedas de pago")
        default: return id
        }
    }

    private static func equity(_ id: String, _ members: [(String, String)]) -> HarnessSector {
        HarnessSector(id: id, isEquity: true, members: members.map { .init(symbol: $0.0, name: $0.1) })
    }

    private static func crypto(_ id: String, _ members: [(String, String)]) -> HarnessSector {
        HarnessSector(id: id, isEquity: false, members: members.map { .init(symbol: $0.0, name: $0.1) })
    }
}
