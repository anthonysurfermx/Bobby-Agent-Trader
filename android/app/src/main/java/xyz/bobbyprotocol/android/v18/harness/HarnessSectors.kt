package xyz.bobbyprotocol.android.v18.harness

import java.util.Locale

// The harness (1.8): which sector an asset belongs to. A short curated list of the assets Bobby
// can read (src/lib/okx-asset-search.ts names them), grouped the way people talk about them. An
// asset that is not here has no sector follow-up: nothing is guessed. The same list as
// ios/Bobby/Sources/V18/Harness/HarnessSectors.swift; the sector's name is `HarnessCopy.sectorTitle`.

class HarnessSector(
    val id: String,
    val isEquity: Boolean,
    /** In the order people would name them. */
    val members: List<HarnessSector.Member>,
) {
    data class Member(val symbol: String, val name: String)

    /** The asked asset first, then its closest neighbours. */
    fun board(around: String, limit: Int = 5): List<Member> {
        val asked = around.uppercase(Locale.ROOT)
        return (members.filter { it.symbol == asked } + members.filter { it.symbol != asked }).take(limit)
    }
}

object HarnessSectors {
    val all: List<HarnessSector> = listOf(
        equity("semis", "NVDA" to "NVIDIA", "AMD" to "AMD", "TSM" to "TSMC", "AVGO" to "Broadcom", "QCOM" to "Qualcomm",
               "MU" to "Micron", "INTC" to "Intel", "ARM" to "Arm", "SMCI" to "Super Micro"),
        equity("bigtech", "AAPL" to "Apple", "MSFT" to "Microsoft", "GOOGL" to "Alphabet", "AMZN" to "Amazon", "META" to "Meta",
               "NFLX" to "Netflix"),
        equity("software", "PLTR" to "Palantir", "CRM" to "Salesforce", "ORCL" to "Oracle", "ADBE" to "Adobe", "NOW" to "ServiceNow",
               "SNOW" to "Snowflake", "CRWD" to "CrowdStrike", "NET" to "Cloudflare", "SHOP" to "Shopify"),
        equity("cryptostocks", "COIN" to "Coinbase", "MSTR" to "Strategy", "HOOD" to "Robinhood"),
        equity("ev", "TSLA" to "Tesla", "RIVN" to "Rivian"),
        equity("health", "LLY" to "Eli Lilly", "UNH" to "UnitedHealth", "JNJ" to "Johnson & Johnson", "MRNA" to "Moderna",
               "ISRG" to "Intuitive Surgical"),
        crypto("majors", "BTC" to "Bitcoin", "ETH" to "Ethereum"),
        crypto("layer1", "SOL" to "Solana", "AVAX" to "Avalanche", "ADA" to "Cardano", "NEAR" to "NEAR", "APT" to "Aptos",
               "TRX" to "TRON", "DOT" to "Polkadot", "ATOM" to "Cosmos", "HBAR" to "Hedera"),
        crypto("layer2", "ARB" to "Arbitrum", "OP" to "Optimism", "POL" to "Polygon", "STRK" to "Starknet", "IMX" to "Immutable"),
        crypto("defi", "LINK" to "Chainlink", "UNI" to "Uniswap", "HYPE" to "Hyperliquid", "ENA" to "Ethena", "LDO" to "Lido",
               "JUP" to "Jupiter", "CRV" to "Curve"),
        crypto("memes", "DOGE" to "Dogecoin", "SHIB" to "Shiba Inu", "PEPE" to "Pepe", "WIF" to "dogwifhat", "BONK" to "Bonk",
               "PENGU" to "Pudgy Penguins"),
        crypto("aicrypto", "FET" to "Fetch.ai", "RENDER" to "Render", "WLD" to "Worldcoin", "VIRTUAL" to "Virtuals", "GRT" to "The Graph"),
        crypto("payments", "XRP" to "XRP", "XLM" to "Stellar", "LTC" to "Litecoin", "BCH" to "Bitcoin Cash"),
    )

    private val bySymbol: Map<String, HarnessSector> = HashMap<String, HarnessSector>().also { map ->
        for (sector in all) for (member in sector.members) if (!map.containsKey(member.symbol)) map[member.symbol] = sector
    }

    /** The sector of an asset, when it has one with someone else in it. */
    fun of(symbol: String): HarnessSector? = bySymbol[symbol.uppercase(Locale.ROOT)]?.takeIf { it.members.size >= 2 }

    fun byId(id: String): HarnessSector? = all.firstOrNull { it.id == id }

    private fun equity(id: String, vararg members: Pair<String, String>): HarnessSector =
        HarnessSector(id, true, members.map { HarnessSector.Member(it.first, it.second) })

    private fun crypto(id: String, vararg members: Pair<String, String>): HarnessSector =
        HarnessSector(id, false, members.map { HarnessSector.Member(it.first, it.second) })
}
