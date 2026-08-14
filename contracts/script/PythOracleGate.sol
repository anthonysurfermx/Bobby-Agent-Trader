// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PythOracleGate — canonical Pyth oracle set for TrackRecordV2, pinned
///        per chainId (audit r2 external, Codex/Anthony).
///
/// @dev The V2 constructor accepts `address[] _pyths` (element 0 active, the
///      rest pre-approved instantly-activatable fallbacks — V-03). Left to raw
///      env input, a deploy could pass two arbitrary "canonical" addresses and
///      the D-4 Safe would be trusting whatever the operator typed. This gate
///      removes that discretion: the canonical set is HARDCODED per chain from
///      the official Pyth registry, and the deploy/verify scripts assert the
///      live constructor arg equals it exactly.
///
///      Base is mid-migration to a new Pyth contract (2026-08-18). Pyth's
///      guidance: new integrations use the UPGRADED address. So on mainnet the
///      ACTIVE oracle (index 0) is the upgraded contract and the CURRENT one is
///      pre-approved as the fallback — a `revokePyth(active)` recovers in one
///      tx by activating index 1, with no timelock (V-03), because both were
///      vetted at deploy.
///
///      Source: docs.pyth.network/price-feeds/core/contract-addresses/evm
library PythOracleGate {
    // Base mainnet (8453)
    address internal constant BASE_PYTH_CURRENT  = 0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a;
    address internal constant BASE_PYTH_UPGRADED = 0xbC16aee60f64864882BC6C4E428e148Fc0E272F5;
    // Base Sepolia (84532)
    address internal constant BASE_SEPOLIA_PYTH  = 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729;

    // Canonical Pyth price-feed ids (verified live via Hermes, 2026-08-12).
    bytes32 internal constant FEED_BTC = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 internal constant FEED_ETH = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 internal constant FEED_SOL = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;

    /// @notice The canonical `_pyths` array for a chain: index 0 is the address
    ///         that must be ACTIVE; later entries are pre-approved fallbacks.
    /// @dev Mainnet returns TWO distinct addresses (upgraded active + current
    ///      fallback) so the V-03 recovery promise is real. Reverts on any
    ///      unsupported chain — a wrong RPC can never silently pick an oracle.
    function canonicalPyths(uint256 chainId) internal pure returns (address[] memory pyths) {
        if (chainId == 8453) {
            pyths = new address[](2);
            pyths[0] = BASE_PYTH_UPGRADED; // active per Pyth guidance
            pyths[1] = BASE_PYTH_CURRENT;  // pre-approved fallback
        } else if (chainId == 84532) {
            pyths = new address[](1);
            pyths[0] = BASE_SEPOLIA_PYTH;
        } else {
            revert("PythOracleGate: unsupported chain");
        }
    }

    /// @notice The verified-universe symbols + feed ids, 1:1 and ordered.
    function verifiedFeeds()
        internal
        pure
        returns (string[] memory symbols, bytes32[] memory feedIds)
    {
        symbols = new string[](3);
        feedIds = new bytes32[](3);
        symbols[0] = "BTC"; feedIds[0] = FEED_BTC;
        symbols[1] = "ETH"; feedIds[1] = FEED_ETH;
        symbols[2] = "SOL"; feedIds[2] = FEED_SOL;
    }

    /// @notice Assert a candidate `_pyths` array equals the chain's canonical
    ///         set exactly: same length, same order, distinct entries, and each
    ///         with deployed bytecode. Used identically by deploy and verify so
    ///         the two can never disagree.
    /// @dev On mainnet this ENFORCES >= 2 distinct oracles (the V-03 fallback).
    function assertCanonical(uint256 chainId, address[] memory pyths) internal view {
        address[] memory want = canonicalPyths(chainId);
        require(pyths.length == want.length, "PythOracleGate: wrong pyth count");
        if (chainId == 8453) {
            require(pyths.length >= 2, "PythOracleGate: mainnet needs active + fallback");
        }
        for (uint256 i = 0; i < want.length; i++) {
            require(pyths[i] == want[i], "PythOracleGate: pyth address off canonical set");
            require(pyths[i].code.length > 0, "PythOracleGate: no code at canonical pyth");
            for (uint256 j = i + 1; j < want.length; j++) {
                require(want[i] != want[j], "PythOracleGate: duplicate canonical pyth");
            }
        }
    }
}
