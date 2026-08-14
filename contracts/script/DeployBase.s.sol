// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SafeOwnerGate} from "./SafeOwnerGate.sol";
import {PythOracleGate} from "./PythOracleGate.sol";
import {BobbyTrackRecordV2} from "../src/BobbyTrackRecordV2.sol";
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
        address hardnessScorer;
        address expectedOwner;
        bytes32 expectedOwnerCodehash;
        address expectedOwnerSingleton;
    }

    function _config() internal view returns (Config memory c) {
        c.bobby = vm.envAddress("BOBBY_ADDRESS");
        // r6 #2: on MAINNET the economic roles must be explicit and pairwise
        // distinct — three agents paying one wallet is not a three-agent economy.
        // On Sepolia they may collapse into BOBBY_ADDRESS as LOGICAL roles for
        // testing; the run log states this out loud.
        if (block.chainid == 8453) {
            c.alpha = vm.envAddress("ALPHA_ADDRESS");
            c.red = vm.envAddress("RED_ADDRESS");
            c.cio = vm.envAddress("CIO_ADDRESS");
            c.resolver = vm.envAddress("RESOLVER_ADDRESS");
            require(
                c.alpha != c.red && c.alpha != c.cio && c.alpha != c.resolver
                    && c.red != c.cio && c.red != c.resolver && c.cio != c.resolver,
                "Mainnet economic roles must be pairwise distinct"
            );
        } else {
            c.alpha = vm.envOr("ALPHA_ADDRESS", c.bobby);
            c.red = vm.envOr("RED_ADDRESS", c.bobby);
            c.cio = vm.envOr("CIO_ADDRESS", c.bobby);
            c.resolver = vm.envOr("RESOLVER_ADDRESS", c.bobby);
        }
        // IntentEscrow F-013 requires cio/arbiter/keeper/resolver to be four
        // DISTINCT addresses (and owner != keeper). There is no safe default
        // for these — set them explicitly per deploy.
        c.arbiter = vm.envAddress("ARBITER_ADDRESS");
        c.keeper = vm.envAddress("KEEPER_ADDRESS");
        c.mcpCallFee = vm.envOr("FEE_MCP_CALL_WEI", uint256(0.000025 ether));
        c.debateFeePerAgent = vm.envOr("FEE_DEBATE_PER_AGENT_WEI", uint256(0.0000025 ether));
        // r9 L-02: validate every env value at full width BEFORE narrowing — a
        // fat-fingered value must fail loudly, never truncate into a "valid" fee.
        uint256 rawMinBounty = vm.envOr("MIN_BOUNTY_WEI", uint256(0.000025 ether));
        uint256 rawAbsMinBounty = vm.envOr("ABSOLUTE_MIN_BOUNTY_WEI", uint256(0.0000025 ether));
        uint256 rawStake = vm.envOr("REGISTRATION_STAKE_WEI", uint256(0.00025 ether));
        uint256 rawThreshold = vm.envOr("RESOLVER_THRESHOLD", uint256(1));
        require(rawMinBounty <= type(uint96).max, "MIN_BOUNTY_WEI exceeds uint96");
        require(rawAbsMinBounty <= type(uint96).max, "ABSOLUTE_MIN_BOUNTY_WEI exceeds uint96");
        require(rawStake <= type(uint96).max, "REGISTRATION_STAKE_WEI exceeds uint96");
        require(rawThreshold >= 1 && rawThreshold <= type(uint8).max, "RESOLVER_THRESHOLD out of range");
        c.minBounty = uint96(rawMinBounty);
        c.absoluteMinBounty = uint96(rawAbsMinBounty);
        c.registrationStake = uint96(rawStake);
        c.resolverThreshold = uint8(rawThreshold);
        c.maxSizeUsd = vm.envOr("ESCROW_MAX_SIZE_USD", uint256(10_000e18)); // $10k, 18dp encoding
        // r7 integration: judge-mode needs the scorer role; defaults to bobby so
        // hardness certification is never silently dead after a deploy.
        c.hardnessScorer = vm.envOr("HARDNESS_SCORER_ADDRESS", c.bobby);
        // r9 H-02 / D-4: the address that must END UP owning all seven
        // contracts. On mainnet this is the Safe — mandatory, and distinct from
        // the hot deployer EOA. On testnet it defaults to the deployer (no
        // handoff), keeping the canary flow unchanged.
        c.expectedOwner = vm.envOr("OWNER_SAFE_ADDRESS", address(0));
        // r10.1 review [P1]: the Safe's exact on-chain identity, pinned after
        // creating and externally auditing it (runbook: `cast codehash <safe>`
        // and `cast storage <safe> 0`, cross-checked against the official
        // safe-deployments registry). Mandatory on 8453.
        c.expectedOwnerCodehash = vm.envOr("OWNER_SAFE_CODEHASH", bytes32(0));
        c.expectedOwnerSingleton = vm.envOr("OWNER_SAFE_SINGLETON", address(0));
    }

    /// @dev V2 verification params. Defaults are the audited deploy config
    ///      (Anthony's §8 decisions: maxExitLag 600s cap, 7-day challenge
    ///      window, 100 bps tolerances to be tightened from real basis, conf
    ///      50 bps). Overridable per deploy; the constructor re-validates every
    ///      field against its hard bounds, so a bad env value fails loudly.
    function _v2Params() internal view returns (BobbyTrackRecordV2.VerificationParams memory p) {
        p.entryWindowSec = uint16(vm.envOr("V2_ENTRY_WINDOW_SEC", uint256(60)));
        p.exitWindowSec = uint16(vm.envOr("V2_EXIT_WINDOW_SEC", uint256(120)));
        p.maxExitLagSec = uint24(vm.envOr("V2_MAX_EXIT_LAG_SEC", uint256(600)));
        p.challengeWindowSec = uint24(vm.envOr("V2_CHALLENGE_WINDOW_SEC", uint256(7 days)));
        p.entryTolBps = uint16(vm.envOr("V2_ENTRY_TOL_BPS", uint256(100)));
        p.exitTolBps = uint16(vm.envOr("V2_EXIT_TOL_BPS", uint256(100)));
        p.confMaxBps = uint16(vm.envOr("V2_CONF_MAX_BPS", uint256(50)));
    }

    function run() external returns (Deployed memory d) {
        // r6 #1: hard chain gate — a wrong RPC must fail loudly, not deploy
        // seven contracts to whatever network answered.
        require(
            block.chainid == 8453 || block.chainid == 84532,
            "DeployBase: target must be Base (8453) or Base Sepolia (84532)"
        );

        Config memory c = _config();
        address deployer = msg.sender;

        // r9 H-02 / D-4: resolve the final owner. Mainnet REQUIRES a Safe that
        // is not the deployer EOA and actually enforces the D-4 policy.
        if (c.expectedOwner == address(0)) c.expectedOwner = deployer;
        // r10 review [P3]: IntentEscrow.transferOwnership rejects the keeper —
        // catch the collision BEFORE broadcast, not six contracts in.
        require(c.expectedOwner != c.keeper, "OWNER_SAFE_ADDRESS must not be the keeper");
        if (block.chainid == 8453) {
            require(c.expectedOwner != deployer, "Mainnet: OWNER_SAFE_ADDRESS must be set and != deployer (D-4)");
            // r10.1 review [P1]: getters alone are mimicable. The gate proves
            // the owner is byte-identical to the externally-audited Safe
            // (pinned codehash + singleton) with an effective >= 2-of-3
            // policy and no module/guard side doors. See SafeOwnerGate.sol.
            SafeOwnerGate.validate(c.expectedOwner, deployer, c.expectedOwnerCodehash, c.expectedOwnerSingleton);
        }

        // r8 #3: validate every economic parameter BEFORE any chain interaction.
        _validateConfig(c);

        // r7 #2/#3: IntentEscrow (the LAST contract deployed) enforces F-013 —
        // cio/arbiter/keeper/resolver pairwise distinct, owner != keeper. Mirror
        // that check HERE, before vm.startBroadcast(), so a bad role set fails
        // with zero contracts deployed instead of six-of-seven. On Sepolia this
        // means collapsed defaults are NOT enough for the escrow: CIO_ADDRESS
        // and RESOLVER_ADDRESS must still be distinct from each other and from
        // arbiter/keeper.
        require(
            c.cio != c.arbiter && c.cio != c.keeper && c.cio != c.resolver
                && c.arbiter != c.keeper && c.arbiter != c.resolver
                && c.keeper != c.resolver,
            "IntentEscrow roles (cio/arbiter/keeper/resolver) must be pairwise distinct"
        );
        require(msg.sender != c.keeper, "IntentEscrow: deployer (owner) must not be keeper");

        // r7: RESOLVER_ADDRESSES quorum applies to HardnessRegistry ONLY. RESOLVER_ADDRESSES (comma-separated)
        // overrides; otherwise this is honestly a centralized 1-of-1 with
        // c.resolver, and any threshold > 1 fails here, not mid-broadcast.
        address[] memory fallbackResolvers = new address[](1);
        fallbackResolvers[0] = c.resolver;
        address[] memory initialResolvers =
            vm.envOr("RESOLVER_ADDRESSES", ",", fallbackResolvers);
        require(
            c.resolverThreshold >= 1 && c.resolverThreshold <= initialResolvers.length,
            "RESOLVER_THRESHOLD exceeds resolver list"
        );
        // r9 L-02: mainnet must never silently run a 1-of-1 quorum. Forgetting
        // RESOLVER_ADDRESSES / RESOLVER_THRESHOLD fails here, pre-broadcast.
        if (block.chainid == 8453) {
            require(initialResolvers.length >= 3, "Mainnet: RESOLVER_ADDRESSES must list >= 3 resolvers");
            require(c.resolverThreshold >= 2, "Mainnet: RESOLVER_THRESHOLD must be >= 2 (runbook: 2-of-3)");
        }
        for (uint256 i = 0; i < initialResolvers.length; i++) {
            require(initialResolvers[i] != address(0), "resolver list contains zero address");
            for (uint256 j = i + 1; j < initialResolvers.length; j++) {
                require(initialResolvers[i] != initialResolvers[j], "resolver list contains duplicates");
            }
        }

        // TrackRecordV2: oracle-verified. The Pyth set is the chain's CANONICAL
        // set (not raw env) — mainnet gets upgraded-active + current-fallback,
        // asserted distinct and code-bearing. Params default to the audited
        // deploy config (maxExitLag 600s etc.) and are re-validated by the
        // constructor's bounds. Feeds: BTC/ETH/SOL, ids pinned in the gate.
        BobbyTrackRecordV2.VerificationParams memory v2Params = _v2Params();
        address[] memory pyths = PythOracleGate.canonicalPyths(block.chainid);
        PythOracleGate.assertCanonical(block.chainid, pyths);
        (string[] memory v2Symbols, bytes32[] memory v2Feeds) = PythOracleGate.verifiedFeeds();

        vm.startBroadcast();

        d.trackRecord = address(new BobbyTrackRecordV2(c.bobby, v2Params, pyths, v2Symbols, v2Feeds));
        d.convictionOracle = address(new BobbyConvictionOracle(c.bobby));

        // r6 #4: fees enter via constructor — no transient OKB-priced window.
        d.agentEconomyV2 = address(
            new BobbyAgentEconomyV2(c.alpha, c.red, c.cio, c.mcpCallFee, c.debateFeePerAgent)
        );

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

        HardnessRegistry(payable(d.hardnessRegistry)).setHardnessScorer(c.hardnessScorer);

        // r9 H-02: scripted handoff — propose the Safe as pendingOwner on all
        // seven contracts in the SAME broadcast. Two-step everywhere: the Safe
        // must acceptOwnership() (batched in its UI) before it owns anything,
        // so a typo'd address can never take ownership.
        if (c.expectedOwner != deployer) {
            BobbyTrackRecordV2(d.trackRecord).transferOwnership(c.expectedOwner);
            BobbyConvictionOracle(d.convictionOracle).transferOwnership(c.expectedOwner);
            BobbyAgentEconomyV2(payable(d.agentEconomyV2)).transferOwnership(c.expectedOwner);
            BobbyAdversarialBounties(payable(d.adversarialBounties)).transferOwnership(c.expectedOwner);
            HardnessRegistry(payable(d.hardnessRegistry)).transferOwnership(c.expectedOwner);
            BobbyAgentRegistry(d.agentRegistry).transferOwnership(c.expectedOwner);
            BobbyIntentEscrow(d.intentEscrow).transferOwnership(c.expectedOwner);
        }

        vm.stopBroadcast();

        _assertDeployment(d, c, initialResolvers, deployer);
        _writeManifest(d, c, initialResolvers, deployer);

        console2.log("chain id            ", block.chainid);
        console2.log("hardness resolvers  ", initialResolvers.length);
        console2.log("hardness threshold  ", c.resolverThreshold);
        console2.log("bounties+escrow resolver (single, by design)", c.resolver);
        if (block.chainid != 8453 && c.alpha == c.bobby && c.red == c.bobby) {
            console2.log("NOTE: agent roles collapsed into BOBBY_ADDRESS (logical roles, testnet only)");
        }
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

    /// @dev r8 #3: every economic parameter checked before touching the chain.
    function _validateConfig(Config memory c) internal pure {
        require(c.mcpCallFee > 0 && c.debateFeePerAgent > 0, "config: zero fee");
        require(c.absoluteMinBounty > 0, "config: zero bounty floor");
        require(c.minBounty >= c.absoluteMinBounty, "config: minBounty below floor");
        require(c.registrationStake > 0, "config: zero registration stake");
        require(
            c.maxSizeUsd > 0 && c.maxSizeUsd <= 100_000_000e18,
            "config: escrow maxSizeUsd out of bounds (18dp, ceiling 100M)"
        );
    }

    /// @dev r7 integration: post-deploy assertions — the script itself proves
    /// owners, roles, quorum and fees landed as configured before anyone flips
    /// PROTOCOL_CHAIN. All view calls; free on simulation, cheap on broadcast.
    function _assertDeployment(Deployed memory d, Config memory c, address[] memory resolverSet, address deployer) internal view {
        // r8 #1 + r9 H-02: right after deploy the broadcaster still owns all
        // seven (two-step: ownership only moves when the Safe accepts), and if
        // a handoff was requested, every pendingOwner must be the Safe.
        require(BobbyTrackRecordV2(d.trackRecord).owner() == deployer, "assert: trackRecord.owner");
        require(BobbyConvictionOracle(d.convictionOracle).owner() == deployer, "assert: oracle.owner");
        require(BobbyAgentEconomyV2(payable(d.agentEconomyV2)).owner() == deployer, "assert: economy.owner");
        require(BobbyAdversarialBounties(payable(d.adversarialBounties)).owner() == deployer, "assert: bounties.owner");
        require(HardnessRegistry(payable(d.hardnessRegistry)).owner() == deployer, "assert: hardness.owner");
        require(BobbyAgentRegistry(d.agentRegistry).owner() == deployer, "assert: agentRegistry.owner");
        require(BobbyIntentEscrow(d.intentEscrow).owner() == deployer, "assert: escrow.owner");
        if (c.expectedOwner != deployer) {
            require(BobbyTrackRecordV2(d.trackRecord).pendingOwner() == c.expectedOwner, "assert: trackRecord.pendingOwner");
            require(BobbyConvictionOracle(d.convictionOracle).pendingOwner() == c.expectedOwner, "assert: oracle.pendingOwner");
            require(BobbyAgentEconomyV2(payable(d.agentEconomyV2)).pendingOwner() == c.expectedOwner, "assert: economy.pendingOwner");
            require(BobbyAdversarialBounties(payable(d.adversarialBounties)).pendingOwner() == c.expectedOwner, "assert: bounties.pendingOwner");
            require(HardnessRegistry(payable(d.hardnessRegistry)).pendingOwner() == c.expectedOwner, "assert: hardness.pendingOwner");
            require(BobbyAgentRegistry(d.agentRegistry).pendingOwner() == c.expectedOwner, "assert: agentRegistry.pendingOwner");
            require(BobbyIntentEscrow(d.intentEscrow).pendingOwner() == c.expectedOwner, "assert: escrow.pendingOwner");
        }
        require(BobbyIntentEscrow(d.intentEscrow).chainIdExpected() == block.chainid, "assert: escrow.chainIdExpected");

        require(BobbyTrackRecordV2(d.trackRecord).bobby() == c.bobby, "assert: trackRecord.bobby");
        require(BobbyConvictionOracle(d.convictionOracle).bobby() == c.bobby, "assert: oracle.bobby");

        // TrackRecordV2 oracle wiring: the ACTIVE Pyth is the chain's canonical
        // index-0 (mainnet = upgraded), every canonical address is approved (so
        // the V-03 fallback is real), and the three verified feeds are seeded.
        {
            BobbyTrackRecordV2 tr = BobbyTrackRecordV2(d.trackRecord);
            address[] memory want = PythOracleGate.canonicalPyths(block.chainid);
            require(tr.activePyth() == want[0], "assert: trackRecord.activePyth != canonical active");
            for (uint256 i = 0; i < want.length; i++) {
                require(tr.approvedPyth(want[i]), "assert: canonical pyth not approved");
            }
            (string[] memory syms, bytes32[] memory feeds) = PythOracleGate.verifiedFeeds();
            for (uint256 i = 0; i < syms.length; i++) {
                require(tr.feedOf(keccak256(bytes(syms[i]))) == feeds[i], "assert: verified feed not seeded");
            }
        }

        BobbyAgentEconomyV2 economy = BobbyAgentEconomyV2(payable(d.agentEconomyV2));
        require(economy.mcpCallFee() == c.mcpCallFee, "assert: mcpCallFee");
        require(economy.debateFeePerAgent() == c.debateFeePerAgent, "assert: debateFee");
        require(economy.alphaHunter() == c.alpha && economy.redTeam() == c.red && economy.cio() == c.cio, "assert: economy roles");

        BobbyAdversarialBounties bounties = BobbyAdversarialBounties(payable(d.adversarialBounties));
        require(bounties.resolver() == c.resolver, "assert: bounties.resolver");
        require(bounties.minBounty() == c.minBounty, "assert: bounties.minBounty");
        require(bounties.ABSOLUTE_MIN_BOUNTY() == c.absoluteMinBounty, "assert: bounties.floor");

        HardnessRegistry hardness = HardnessRegistry(payable(d.hardnessRegistry));
        require(hardness.resolverThreshold() == c.resolverThreshold, "assert: hardness.threshold");
        require(hardness.resolverCount() == resolverSet.length, "assert: hardness.resolverCount");
        for (uint256 i = 0; i < resolverSet.length; i++) {
            require(hardness.resolvers(resolverSet[i]), "assert: hardness resolver missing");
        }
        require(hardness.REGISTRATION_STAKE() == c.registrationStake, "assert: hardness.stake");
        require(hardness.hardnessScorer() == c.hardnessScorer, "assert: hardness.scorer");
        require(hardness.minBounty() == c.minBounty, "assert: hardness.minBounty");
        require(hardness.ABSOLUTE_MIN_BOUNTY() == c.absoluteMinBounty, "assert: hardness.floor");

        BobbyIntentEscrow escrow = BobbyIntentEscrow(d.intentEscrow);
        require(escrow.cio() == c.cio && escrow.arbiter() == c.arbiter, "assert: escrow cio/arbiter");
        require(escrow.keeper() == c.keeper && escrow.resolver() == c.resolver, "assert: escrow keeper/resolver");
        require(escrow.maxSizeUsd() == c.maxSizeUsd, "assert: escrow.maxSizeUsd");

        console2.log("post-deploy assertions: ALL PASSED");
    }

    /// @dev r8 #5: machine-readable manifest — no hand-copied addresses. Written
    /// to deployments/<chainid>.json (fs_permissions in foundry.toml).
    function _writeManifest(Deployed memory d, Config memory c, address[] memory resolverSet, address deployer) internal {
        string memory m = "manifest";
        vm.serializeUint(m, "chainId", block.chainid);
        // NOTE: on a dry-run this is the SIMULATED block; only trust it after a
        // real broadcast. VerifyBaseDeployment logs the live block on every run.
        vm.serializeUint(m, "deployBlock", block.number);
        vm.serializeAddress(m, "deployer", deployer);
        // r9 H-02: the address that must end up owning all seven contracts.
        vm.serializeAddress(m, "expectedOwner", c.expectedOwner);
        // r10.1 [P1]: pinned Safe identity so the verifier re-proves it live.
        vm.serializeBytes32(m, "expectedOwnerCodehash", c.expectedOwnerCodehash);
        vm.serializeAddress(m, "expectedOwnerSingleton", c.expectedOwnerSingleton);

        string memory a = "addresses";
        vm.serializeAddress(a, "trackRecord", d.trackRecord);
        vm.serializeAddress(a, "convictionOracle", d.convictionOracle);
        vm.serializeAddress(a, "agentEconomyV2", d.agentEconomyV2);
        vm.serializeAddress(a, "adversarialBounties", d.adversarialBounties);
        vm.serializeAddress(a, "hardnessRegistry", d.hardnessRegistry);
        vm.serializeAddress(a, "agentRegistry", d.agentRegistry);
        string memory addressesJson = vm.serializeAddress(a, "intentEscrow", d.intentEscrow);
        vm.serializeString(m, "addresses", addressesJson);

        string memory r = "roles";
        vm.serializeAddress(r, "bobby", c.bobby);
        vm.serializeAddress(r, "alpha", c.alpha);
        vm.serializeAddress(r, "red", c.red);
        vm.serializeAddress(r, "cio", c.cio);
        vm.serializeAddress(r, "resolver", c.resolver);
        vm.serializeAddress(r, "arbiter", c.arbiter);
        vm.serializeAddress(r, "keeper", c.keeper);
        string memory rolesJson = vm.serializeAddress(r, "hardnessScorer", c.hardnessScorer);
        vm.serializeString(m, "roles", rolesJson);

        string memory f = "fees";
        vm.serializeUint(f, "mcpCallFeeWei", c.mcpCallFee);
        vm.serializeUint(f, "debateFeePerAgentWei", c.debateFeePerAgent);
        vm.serializeUint(f, "minBountyWei", c.minBounty);
        vm.serializeUint(f, "absoluteMinBountyWei", c.absoluteMinBounty);
        vm.serializeUint(f, "registrationStakeWei", c.registrationStake);
        string memory feesJson = vm.serializeUint(f, "escrowMaxSizeUsd18dp", c.maxSizeUsd);
        vm.serializeString(m, "fees", feesJson);

        string memory q = "quorum";
        vm.serializeAddress(q, "resolvers", resolverSet);
        string memory quorumJson = vm.serializeUint(q, "threshold", c.resolverThreshold);
        string memory out = vm.serializeString(m, "quorum", quorumJson);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(out, path);
        console2.log("manifest written:", path);
    }
}
