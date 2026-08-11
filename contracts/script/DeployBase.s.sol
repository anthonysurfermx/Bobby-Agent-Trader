// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {BobbyTrackRecord} from "../src/BobbyTrackRecord.sol";
import {BobbyConvictionOracle} from "../src/BobbyConvictionOracle.sol";
import {BobbyAgentEconomyV2} from "../src/BobbyAgentEconomyV2.sol";
import {BobbyAdversarialBounties} from "../src/BobbyAdversarialBounties.sol";
import {HardnessRegistry} from "../src/HardnessRegistry.sol";
import {BobbyAgentRegistry} from "../src/BobbyAgentRegistry.sol";
import {BobbyIntentEscrow} from "../src/BobbyIntentEscrow.sol";

/// @title DeployBase — audited Base (8453) / Base Sepolia (84532) deployment
/// @notice Decision D-3 (Anthony, 2026-08-11): fees stay NATIVE (ETH), resized
///         from their OKB-era values and injected per deploy — never source
///         constants. USDC remains the x402/off-chain rail; ERC-20 on-chain fees
///         are a future v2 with its own audit.
///
/// @dev Every fee env var below is documented with its APPROXIMATE USD TARGET.
///      The wei defaults assume ETH ≈ $4,000 — recompute at deploy time and
///      override via env if ETH has moved materially:
///
///        FEE_MCP_CALL_WEI          target ≈ $0.10   (default 0.000025 ether)
///        FEE_DEBATE_PER_AGENT_WEI  target ≈ $0.01   (default 0.0000025 ether)
///        MIN_BOUNTY_WEI            target ≈ $0.10   (default 0.000025 ether)
///        ABSOLUTE_MIN_BOUNTY_WEI   target ≈ $0.01   (default 0.0000025 ether)
///        REGISTRATION_STAKE_WEI    target ≈ $1.00   (default 0.00025 ether)
///
///      AgentEconomy V1 is intentionally NOT deployed (audit r1: superseded,
///      zero coverage, forgeable payDebateFee).
///
/// Usage (Sepolia dry-run):
///   forge script script/DeployBase.s.sol --rpc-url https://sepolia.base.org \
///     --broadcast --verify -vvvv
contract DeployBase is Script {
    struct Deployed {
        address trackRecord;
        address convictionOracle;
        address agentEconomyV2;
        address adversarialBounties;
        address hardnessRegistry;
        address agentRegistry;
        address intentEscrow;
    }

    struct Config {
        address bobby;
        address alpha;
        address red;
        address cio;
        address resolver;
        address arbiter;
        address keeper;
        uint256 mcpCallFee;
        uint256 debateFeePerAgent;
        uint96 minBounty;
        uint96 absoluteMinBounty;
        uint96 registrationStake;
        uint256 maxSizeUsd;
        uint8 resolverThreshold;
    }

    function _config() internal view returns (Config memory c) {
        c.bobby = vm.envAddress("BOBBY_ADDRESS");
        c.alpha = vm.envOr("ALPHA_ADDRESS", c.bobby);
        c.red = vm.envOr("RED_ADDRESS", c.bobby);
        c.cio = vm.envOr("CIO_ADDRESS", c.bobby);
        c.resolver = vm.envOr("RESOLVER_ADDRESS", c.bobby);
        // IntentEscrow F-013 requires cio/arbiter/keeper/resolver to be four
        // DISTINCT addresses (and owner != keeper). There is no safe default
        // for these — set them explicitly per deploy.
        c.arbiter = vm.envAddress("ARBITER_ADDRESS");
        c.keeper = vm.envAddress("KEEPER_ADDRESS");
        c.mcpCallFee = vm.envOr("FEE_MCP_CALL_WEI", uint256(0.000025 ether));
        c.debateFeePerAgent = vm.envOr("FEE_DEBATE_PER_AGENT_WEI", uint256(0.0000025 ether));
        c.minBounty = uint96(vm.envOr("MIN_BOUNTY_WEI", uint256(0.000025 ether)));
        c.absoluteMinBounty = uint96(vm.envOr("ABSOLUTE_MIN_BOUNTY_WEI", uint256(0.0000025 ether)));
        c.registrationStake = uint96(vm.envOr("REGISTRATION_STAKE_WEI", uint256(0.00025 ether)));
        c.maxSizeUsd = vm.envOr("ESCROW_MAX_SIZE_USD", uint256(10_000e18)); // $10k, 18dp encoding
        c.resolverThreshold = uint8(vm.envOr("RESOLVER_THRESHOLD", uint256(1)));
    }

    function run() external returns (Deployed memory d) {
        Config memory c = _config();
        address[] memory initialResolvers = new address[](1);
        initialResolvers[0] = c.resolver;

        vm.startBroadcast();

        d.trackRecord = address(new BobbyTrackRecord(c.bobby));
        d.convictionOracle = address(new BobbyConvictionOracle(c.bobby));

        BobbyAgentEconomyV2 economy = new BobbyAgentEconomyV2(c.alpha, c.red, c.cio);
        economy.updateFees(c.mcpCallFee, c.debateFeePerAgent);
        d.agentEconomyV2 = address(economy);

        d.adversarialBounties = address(
            new BobbyAdversarialBounties(c.resolver, c.absoluteMinBounty, c.minBounty)
        );

        d.hardnessRegistry = address(
            new HardnessRegistry(
                initialResolvers, c.resolverThreshold, c.absoluteMinBounty, c.registrationStake, c.minBounty
            )
        );

        d.agentRegistry = address(new BobbyAgentRegistry());

        d.intentEscrow = address(
            new BobbyIntentEscrow(
                block.chainid, c.maxSizeUsd, msg.sender, c.cio, c.arbiter, c.keeper, c.resolver
            )
        );

        vm.stopBroadcast();

        console2.log("chain id            ", block.chainid);
        console2.log("TrackRecord         ", d.trackRecord);
        console2.log("ConvictionOracle    ", d.convictionOracle);
        console2.log("AgentEconomyV2      ", d.agentEconomyV2);
        console2.log("AdversarialBounties ", d.adversarialBounties);
        console2.log("HardnessRegistry    ", d.hardnessRegistry);
        console2.log("AgentRegistry       ", d.agentRegistry);
        console2.log("IntentEscrow        ", d.intentEscrow);
        console2.log("--- fees (wei) ---");
        console2.log("mcpCallFee          ", c.mcpCallFee);
        console2.log("debateFeePerAgent   ", c.debateFeePerAgent);
        console2.log("minBounty           ", c.minBounty);
        console2.log("absoluteMinBounty   ", c.absoluteMinBounty);
        console2.log("registrationStake   ", c.registrationStake);
    }
}
