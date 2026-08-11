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

/// @title VerifyBaseDeployment — trust what was MINED, not what was simulated
/// @notice Reads the manifest DeployBase wrote (deployments/<chainid>.json) and
///         re-runs every assertion against the LIVE chain state. Run it after
///         the broadcast, before loading addresses into Vercel or flipping
///         PROTOCOL_CHAIN:
///
///           forge script script/VerifyBaseDeployment.s.sol --rpc-url base_sepolia
///
///         Override the manifest path with MANIFEST_PATH if needed. Read-only:
///         no broadcast, no keys, safe to run as many times as you like.
contract VerifyBaseDeployment is Script {
    uint256 internal checksPassed;

    struct Addrs {
        address trackRecord;
        address oracle;
        address economy;
        address bounties;
        address hardness;
        address agentRegistry;
        address escrow;
    }

    struct Roles {
        address deployer;
        address bobby;
        address alpha;
        address red;
        address cio;
        address resolver;
        address arbiter;
        address keeper;
        address scorer;
    }

    function _ok(bool cond, string memory label) internal {
        require(cond, string.concat("VERIFY FAILED: ", label));
        checksPassed++;
        console2.log("  ok:", label);
    }

    function run() external {
        string memory path = vm.envOr(
            "MANIFEST_PATH",
            string.concat("deployments/", vm.toString(block.chainid), ".json")
        );
        string memory json = vm.readFile(path);
        console2.log("manifest:", path);
        console2.log("live block now:", block.number); // manifest deployBlock may be simulated

        _ok(vm.parseJsonUint(json, ".chainId") == block.chainid, "manifest chainId matches RPC chain");

        Addrs memory a = Addrs({
            trackRecord: vm.parseJsonAddress(json, ".addresses.trackRecord"),
            oracle: vm.parseJsonAddress(json, ".addresses.convictionOracle"),
            economy: vm.parseJsonAddress(json, ".addresses.agentEconomyV2"),
            bounties: vm.parseJsonAddress(json, ".addresses.adversarialBounties"),
            hardness: vm.parseJsonAddress(json, ".addresses.hardnessRegistry"),
            agentRegistry: vm.parseJsonAddress(json, ".addresses.agentRegistry"),
            escrow: vm.parseJsonAddress(json, ".addresses.intentEscrow")
        });

        Roles memory r = Roles({
            deployer: vm.parseJsonAddress(json, ".deployer"),
            bobby: vm.parseJsonAddress(json, ".roles.bobby"),
            alpha: vm.parseJsonAddress(json, ".roles.alpha"),
            red: vm.parseJsonAddress(json, ".roles.red"),
            cio: vm.parseJsonAddress(json, ".roles.cio"),
            resolver: vm.parseJsonAddress(json, ".roles.resolver"),
            arbiter: vm.parseJsonAddress(json, ".roles.arbiter"),
            keeper: vm.parseJsonAddress(json, ".roles.keeper"),
            scorer: vm.parseJsonAddress(json, ".roles.hardnessScorer")
        });

        _verifyCode(a);
        _verifyOwnership(a, r.deployer);
        _verifyEconomy(a, r, json);
        _verifyBounties(a, r, json);
        _verifyHardness(a, r, json);
        _verifyEscrow(a, r, json);

        console2.log("");
        console2.log("LIVE VERIFICATION PASSED - checks:", checksPassed);
    }

    function _verifyCode(Addrs memory a) internal {
        _ok(a.trackRecord.code.length > 0, "trackRecord has code");
        _ok(a.oracle.code.length > 0, "convictionOracle has code");
        _ok(a.economy.code.length > 0, "agentEconomyV2 has code");
        _ok(a.bounties.code.length > 0, "adversarialBounties has code");
        _ok(a.hardness.code.length > 0, "hardnessRegistry has code");
        _ok(a.agentRegistry.code.length > 0, "agentRegistry has code");
        _ok(a.escrow.code.length > 0, "intentEscrow has code");
    }

    function _verifyOwnership(Addrs memory a, address deployer) internal {
        _ok(BobbyTrackRecord(a.trackRecord).owner() == deployer, "trackRecord.owner == deployer");
        _ok(BobbyConvictionOracle(a.oracle).owner() == deployer, "oracle.owner == deployer");
        _ok(BobbyAgentEconomyV2(payable(a.economy)).owner() == deployer, "economy.owner == deployer");
        _ok(BobbyAdversarialBounties(payable(a.bounties)).owner() == deployer, "bounties.owner == deployer");
        _ok(HardnessRegistry(payable(a.hardness)).owner() == deployer, "hardness.owner == deployer");
        _ok(BobbyAgentRegistry(a.agentRegistry).owner() == deployer, "agentRegistry.owner == deployer");
        _ok(BobbyIntentEscrow(a.escrow).owner() == deployer, "escrow.owner == deployer");
    }

    function _verifyEconomy(Addrs memory a, Roles memory r, string memory json) internal {
        _ok(BobbyTrackRecord(a.trackRecord).bobby() == r.bobby, "trackRecord.bobby");
        _ok(BobbyConvictionOracle(a.oracle).bobby() == r.bobby, "oracle.bobby");
        BobbyAgentEconomyV2 eco = BobbyAgentEconomyV2(payable(a.economy));
        _ok(eco.alphaHunter() == r.alpha && eco.redTeam() == r.red && eco.cio() == r.cio, "economy agent roles");
        _ok(eco.mcpCallFee() == vm.parseJsonUint(json, ".fees.mcpCallFeeWei"), "economy.mcpCallFee");
        _ok(eco.debateFeePerAgent() == vm.parseJsonUint(json, ".fees.debateFeePerAgentWei"), "economy.debateFeePerAgent");
    }

    function _verifyBounties(Addrs memory a, Roles memory r, string memory json) internal {
        BobbyAdversarialBounties bo = BobbyAdversarialBounties(payable(a.bounties));
        _ok(bo.resolver() == r.resolver, "bounties.resolver");
        _ok(bo.minBounty() == vm.parseJsonUint(json, ".fees.minBountyWei"), "bounties.minBounty");
        _ok(bo.ABSOLUTE_MIN_BOUNTY() == vm.parseJsonUint(json, ".fees.absoluteMinBountyWei"), "bounties.floor");
    }

    function _verifyHardness(Addrs memory a, Roles memory r, string memory json) internal {
        HardnessRegistry hr = HardnessRegistry(payable(a.hardness));
        address[] memory resolverSet = vm.parseJsonAddressArray(json, ".quorum.resolvers");
        _ok(hr.resolverThreshold() == vm.parseJsonUint(json, ".quorum.threshold"), "hardness.threshold");
        _ok(hr.resolverCount() == resolverSet.length, "hardness.resolverCount");
        for (uint256 i = 0; i < resolverSet.length; i++) {
            _ok(hr.resolvers(resolverSet[i]), string.concat("hardness resolver ", vm.toString(resolverSet[i])));
        }
        _ok(hr.REGISTRATION_STAKE() == vm.parseJsonUint(json, ".fees.registrationStakeWei"), "hardness.stake");
        _ok(hr.minBounty() == vm.parseJsonUint(json, ".fees.minBountyWei"), "hardness.minBounty");
        _ok(hr.ABSOLUTE_MIN_BOUNTY() == vm.parseJsonUint(json, ".fees.absoluteMinBountyWei"), "hardness.floor");
        _ok(hr.hardnessScorer() == r.scorer, "hardness.scorer");
    }

    function _verifyEscrow(Addrs memory a, Roles memory r, string memory json) internal {
        BobbyIntentEscrow es = BobbyIntentEscrow(a.escrow);
        _ok(es.chainIdExpected() == block.chainid, "escrow.chainIdExpected");
        _ok(es.cio() == r.cio && es.arbiter() == r.arbiter, "escrow cio/arbiter");
        _ok(es.keeper() == r.keeper && es.resolver() == r.resolver, "escrow keeper/resolver");
        _ok(es.maxSizeUsd() == vm.parseJsonUint(json, ".fees.escrowMaxSizeUsd18dp"), "escrow.maxSizeUsd");
    }
}
