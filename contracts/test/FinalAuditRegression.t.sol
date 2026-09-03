// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/HardnessRegistry.sol";
import "../src/BobbyAdversarialBounties.sol";

/// @title Final audit 2026-09-03 — exploit-to-regression closure.
/// @dev Each test below is the round-1 PoC (`FinalAuditPoC.t.sol` on
///      codex/fable-5-1-audit-r1, which PASSED against e20d2b8 — i.e. the
///      attack worked) with its assertions inverted: the same call sequence
///      must now revert at the first step the fix blocks. Setup and constants
///      are kept identical to the PoC on purpose.
contract FinalAuditRegressionTest is Test {
    address internal constant AGENT = address(0xA11CE);
    address internal constant POSTER = address(0xB0B);
    address internal constant RESOLVER = address(0xBEEF);

    function _registry() internal returns (HardnessRegistry registry) {
        address[] memory resolvers = new address[](1);
        resolvers[0] = RESOLVER;
        registry = new HardnessRegistry(resolvers, 1, 0.0001 ether, 0.01 ether, 0.001 ether);
        vm.deal(AGENT, 1 ether);
        vm.prank(AGENT);
        registry.registerAgent{value: 0.01 ether}("ipfs://attacker");
    }

    function _commitLong(HardnessRegistry registry, bytes32 h) internal {
        // entry 100, target 110, stop 90 → long
        vm.prank(AGENT);
        registry.commitPrediction(h, "BTC-USD", 100, 100e8, 110e8, 90e8);
        vm.warp(block.timestamp + registry.minPredictionAge());
    }

    /// P0-3 (a): the PoC's exact sequence — agent resolves its own prediction.
    function test_P0_agentCannotResolveOwnPrediction() public {
        HardnessRegistry registry = _registry();
        bytes32 h = keccak256("forged-perfect-record");
        _commitLong(registry, h);

        vm.prank(AGENT);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.resolvePrediction(h, 1, HardnessRegistry.PredictionResult.WIN, 1);

        (uint256 wins, uint256 losses, uint256 winRateBps) = registry.getAgentStats(AGENT);
        assertEq(wins, 0); assertEq(losses, 0); assertEq(winRateBps, 0);
    }

    /// P0-3 (b): even an approved resolver cannot stamp WIN on a long whose
    /// exit price is below entry — the outcome is derived, not declared.
    function test_P0_resolverCannotDeclareWinAgainstPrices() public {
        HardnessRegistry registry = _registry();
        bytes32 h = keccak256("impossible-win");
        _commitLong(registry, h);

        vm.prank(RESOLVER);
        vm.expectRevert(HardnessRegistry.InvalidResult.selector);
        registry.resolvePrediction(h, 1, HardnessRegistry.PredictionResult.WIN, 1);
    }

    /// P0-3 (c): the reported pnl must agree with the derived one within tolerance.
    function test_P0_resolverCannotInflatePnl() public {
        HardnessRegistry registry = _registry();
        bytes32 h = keccak256("inflated-pnl");
        _commitLong(registry, h);
        // exit 105 on a 100 entry = +500 bps; reporting +5000 is refused
        vm.prank(RESOLVER);
        vm.expectRevert(HardnessRegistry.InvalidResult.selector);
        registry.resolvePrediction(h, 5000, HardnessRegistry.PredictionResult.WIN, 105e8);
    }

    /// P0-3 (d): the honest path still works and stores the DERIVED figure.
    function test_P0_honestResolutionStoresDerivedPnl() public {
        HardnessRegistry registry = _registry();
        bytes32 h = keccak256("honest");
        _commitLong(registry, h);
        vm.prank(RESOLVER);
        registry.resolvePrediction(h, 480, HardnessRegistry.PredictionResult.WIN, 105e8); // within 100 bps of +500
        HardnessRegistry.Prediction memory p = registry.getPrediction(h);
        assertEq(uint8(p.result), uint8(HardnessRegistry.PredictionResult.WIN));
        assertEq(p.pnlBps, 500);
        (uint256 wins,,) = registry.getAgentStats(AGENT);
        assertEq(wins, 1);
    }

    /// P0-3 (e): a short is judged the other way round.
    function test_P0_shortDirectionDerivedFromLevels() public {
        HardnessRegistry registry = _registry();
        bytes32 h = keccak256("short");
        vm.prank(AGENT);
        registry.commitPrediction(h, "BTC-USD", 100, 100e8, 90e8, 110e8); // target below entry → short
        vm.warp(block.timestamp + registry.minPredictionAge());
        vm.prank(RESOLVER);
        registry.resolvePrediction(h, -1000, HardnessRegistry.PredictionResult.LOSS, 110e8); // price rose → short lost 10%
        HardnessRegistry.Prediction memory p = registry.getPrediction(h);
        assertEq(uint8(p.result), uint8(HardnessRegistry.PredictionResult.LOSS));
        assertEq(p.pnlBps, -1000);
    }

    /// P1-6: the PoC's exact sequence — resolver challenges, awards itself, withdraws.
    function test_P1_resolverCannotChallengeOwnBounties() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        vm.deal(POSTER, 1 ether);
        vm.deal(RESOLVER, 1 ether);
        vm.prank(POSTER);
        uint256 bountyId = bounties.postBounty{value: 0.1 ether}(
            "private-thread-id", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours
        );

        vm.prank(RESOLVER);
        vm.expectRevert("Resolver cannot challenge");
        bounties.submitChallenge(bountyId, keccak256("resolver-evidence"));

        // Nothing changed hands; the poster can still reclaim after expiry.
        assertEq(bounties.pendingWithdrawals(RESOLVER), 0);
        vm.warp(block.timestamp + 5 days);
        uint256 before = POSTER.balance;
        vm.prank(POSTER);
        bounties.withdrawBounty(bountyId);
        vm.prank(POSTER);
        bounties.withdraw();
        assertEq(POSTER.balance - before, 0.1 ether);
    }

    /// P1-6 belt: a legitimate challenge exists, but the resolver still cannot
    /// name itself (or the owner) as the winner.
    function test_P1_resolverCannotBeNamedWinner() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address challenger = makeAddr("challenger");
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 bountyId = bounties.postBounty{value: 0.1 ether}(
            "thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours
        );
        vm.prank(challenger);
        bounties.submitChallenge(bountyId, keccak256("evidence"));

        vm.prank(RESOLVER);
        vm.expectRevert("Resolver cannot win");
        bounties.resolveBounty(bountyId, RESOLVER);
    }
    // ======================= Codex round 2 =======================

    /// #2: the auxiliary-EOA drain. A compromised resolver proposes its shill;
    /// the poster disputes inside the window; the Safe refunds. The shill gets 0.
    function test_R2_auxiliaryEoaCannotDrain_posterDisputes() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address shill = makeAddr("shill");
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(shill);
        bounties.submitChallenge(id, keccak256("junk"));
        vm.prank(RESOLVER);
        bounties.resolveBounty(id, shill);

        // nothing moved yet
        assertEq(bounties.pendingWithdrawals(shill), 0);
        vm.prank(shill);
        vm.expectRevert("Nothing to withdraw");
        bounties.withdraw();
        vm.expectRevert("Dispute window open");
        bounties.finalizeResolution(id);

        vm.prank(POSTER);
        bounties.disputeResolution(id);
        bounties.settleDispute(id, address(0)); // owner = this test contract (the Safe on mainnet)

        assertEq(bounties.pendingWithdrawals(shill), 0);
        assertEq(bounties.pendingWithdrawals(POSTER), 0.1 ether);
        // and the shill can never be finalized afterwards
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert("Not pending");
        bounties.finalizeResolution(id);
    }

    /// #2: a rival challenger can also freeze the proposal, and the Safe can hand
    /// the pot to the honest challenger instead.
    function test_R2_rivalChallengerDisputes_ownerPaysHonestOne() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address shill = makeAddr("shill"); address honest = makeAddr("honest");
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge(id, keccak256("real evidence"));
        vm.prank(shill);  bounties.submitChallenge(id, keccak256("junk"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, shill);
        vm.prank(honest); bounties.disputeResolution(id);
        bounties.settleDispute(id, honest);
        assertEq(bounties.pendingWithdrawals(honest), 0.1 ether);
        assertEq(bounties.pendingWithdrawals(shill), 0);
    }

    /// #2 honest path: no dispute → the winner is paid after the window, by anyone.
    function test_R2_undisputedResolutionPaysAfterWindow() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest");
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge(id, keccak256("real evidence"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        vm.warp(block.timestamp + bounties.disputeWindow());
        vm.prank(makeAddr("anyone"));
        bounties.finalizeResolution(id);
        assertEq(bounties.pendingWithdrawals(honest), 0.1 ether);
        // the poster cannot dispute after the fact
        vm.prank(POSTER);
        vm.expectRevert("Not pending");
        bounties.disputeResolution(id);
    }

    /// #2: the proposed winner cannot dispute (it would only delay its own payout,
    /// but it must not be able to move the bounty into the owner's hands either),
    /// and a stranger cannot dispute.
    function test_R2_onlyPartiesDispute() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest");
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge(id, keccak256("e"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        vm.prank(honest); vm.expectRevert("Winner cannot dispute"); bounties.disputeResolution(id);
        vm.prank(makeAddr("stranger")); vm.expectRevert("Not a party"); bounties.disputeResolution(id);
    }

    /// #2 on HardnessRegistry: resolvers cannot contest, quorum only proposes,
    /// the poster disputes, the owner settles to the honest challenger.
    function test_R2_registryQuorumCannotSelfDeal() public {
        address[] memory resolvers = new address[](2);
        resolvers[0] = RESOLVER; resolvers[1] = makeAddr("resolver2");
        HardnessRegistry registry = new HardnessRegistry(resolvers, 2, 0.0001 ether, 0.01 ether, 0.001 ether);
        address honest = makeAddr("honest"); address shill = makeAddr("shill");
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = registry.postBounty{value: 0.01 ether}("thread", HardnessRegistry.BountyDimension.DATA_INTEGRITY, 1 days);

        // a resolver cannot challenge at all
        vm.prank(RESOLVER);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.submitChallenge(id, keccak256("resolver junk"));

        vm.prank(honest); registry.submitChallenge(id, keccak256("real"));
        vm.prank(shill);  registry.submitChallenge(id, keccak256("junk"));
        vm.prank(resolvers[0]); registry.approveBountyResolution(id, shill);
        vm.prank(resolvers[1]); registry.approveBountyResolution(id, shill);

        HardnessRegistry.Bounty memory b = registry.getBounty(id);
        assertEq(uint8(b.status), uint8(HardnessRegistry.BountyStatus.PENDING_RESOLUTION));
        assertEq(registry.pendingWithdrawals(shill), 0);
        vm.expectRevert(HardnessRegistry.TooSoon.selector);
        registry.finalizeBountyResolution(id);

        vm.prank(POSTER); registry.disputeBountyResolution(id);
        registry.settleBountyDispute(id, honest);
        assertEq(registry.pendingWithdrawals(honest), 0.01 ether);
        assertEq(registry.pendingWithdrawals(shill), 0);
    }

    /// #2 on HardnessRegistry: a resolver cannot be named winner even by a quorum.
    function test_R2_registryResolverCannotBeWinner() public {
        address[] memory resolvers = new address[](1);
        resolvers[0] = RESOLVER;
        HardnessRegistry registry = new HardnessRegistry(resolvers, 1, 0.0001 ether, 0.01 ether, 0.001 ether);
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = registry.postBounty{value: 0.01 ether}("thread", HardnessRegistry.BountyDimension.DATA_INTEGRITY, 1 days);
        vm.prank(makeAddr("honest")); registry.submitChallenge(id, keccak256("real"));
        vm.prank(RESOLVER);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.approveBountyResolution(id, RESOLVER);
    }

    /// #5: the event carries the stored (derived) pnl, never the reported one.
    function test_R2_eventEmitsDerivedPnl() public {
        HardnessRegistry registry = _registry();
        bytes32 h = keccak256("event");
        _commitLong(registry, h);
        // exit 105 on entry 100 = +500; resolver reports 480 (within tolerance)
        vm.expectEmit(true, true, false, true);
        emit HardnessRegistry.PredictionResolved(RESOLVER, AGENT, h, HardnessRegistry.PredictionResult.WIN, 500);
        vm.prank(RESOLVER);
        registry.resolvePrediction(h, 480, HardnessRegistry.PredictionResult.WIN, 105e8);
    }

    /// #6: incoherent geometry is refused at commit.
    function test_R2_commitRejectsIncoherentLevels() public {
        HardnessRegistry registry = _registry();
        vm.startPrank(AGENT);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.commitPrediction(keccak256("g1"), "BTC-USD", 50, 100e8, 110e8, 120e8); // target and stop both above entry
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.commitPrediction(keccak256("g2"), "BTC-USD", 50, 100e8, 90e8, 80e8);   // both below
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.commitPrediction(keccak256("g3"), "BTC-USD", 50, 100e8, 100e8, 90e8);  // target on the entry
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.commitPrediction(keccak256("g4"), "BTC-USD", 50, 100e8, 0, 100e8);     // stop on the entry
        registry.commitPrediction(keccak256("g5"), "BTC-USD", 50, 100e8, 110e8, 0);     // single level, off entry: fine
        registry.commitPrediction(keccak256("g6"), "BTC-USD", 50, 100e8, 0, 110e8);     // stop above entry alone → short: fine
        vm.stopPrank();
    }
}
