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
    /// @dev the constructor copies the initial minBounty into the challenge bond; a constant keeps vm.prank on the real call
    uint256 internal constant BOND = 0.001 ether;

    function setUp() public {
        vm.deal(AGENT, 1 ether); vm.deal(POSTER, 1 ether); vm.deal(RESOLVER, 1 ether);
    }

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
        bounties.submitChallenge{value: BOND}(bountyId, keccak256("resolver-evidence"));

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
        address challenger = makeAddr("challenger"); vm.deal(challenger, 1 ether);
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 bountyId = bounties.postBounty{value: 0.1 ether}(
            "thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours
        );
        vm.prank(challenger);
        bounties.submitChallenge{value: BOND}(bountyId, keccak256("evidence"));

        vm.prank(RESOLVER);
        vm.expectRevert("Resolver cannot win");
        bounties.resolveBounty(bountyId, RESOLVER);
    }
    // ======================= Codex round 2 =======================

    /// #2: the auxiliary-EOA drain. A compromised resolver proposes its shill;
    /// the poster disputes inside the window; the Safe refunds. The shill gets 0.
    function test_R2_auxiliaryEoaCannotDrain_posterDisputes() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address shill = makeAddr("shill"); vm.deal(shill, 1 ether);
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(shill);
        bounties.submitChallenge{value: BOND}(id, keccak256("junk"));
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
        bounties.disputeResolution{value: BOND}(id);
        bounties.settleDispute(id, address(0)); // owner = this test contract (the Safe on mainnet)

        assertEq(bounties.pendingWithdrawals(shill), bounties.challengeBond(), 'nothing was won: the challenge bond comes back, the reward never does');
        assertEq(bounties.pendingWithdrawals(POSTER), 0.1 ether + bounties.challengeBond(), 'reward refunded + dispute bond back (the dispute was upheld)');
        // and the shill can never be finalized afterwards
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert("Not pending");
        bounties.finalizeResolution(id);
    }

    /// #2: a rival challenger can also freeze the proposal, and the Safe can hand
    /// the pot to the honest challenger instead.
    function test_R2_rivalChallengerDisputes_ownerPaysHonestOne() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address shill = makeAddr("shill"); vm.deal(shill, 1 ether); address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("real evidence"));
        vm.prank(shill);  bounties.submitChallenge{value: BOND}(id, keccak256("junk"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, shill);
        vm.prank(honest); bounties.disputeResolution{value: BOND}(id);
        bounties.settleDispute(id, honest);
        assertEq(bounties.pendingWithdrawals(honest), 0.1 ether + 2 * uint256(bounties.challengeBond()), 'reward + own challenge bond + dispute bond back');
        assertEq(bounties.pendingWithdrawals(shill), 0, 'the shill forfeits its bond');
        assertEq(bounties.pendingWithdrawals(POSTER), 0, 'the poster never receives a forfeited bond (Codex r4)');
        assertEq(bounties.pendingWithdrawals(bounties.treasury()), bounties.challengeBond(), 'it goes to the treasury');
    }

    /// #2 honest path: no dispute → the winner is paid after the window, by anyone.
    function test_R2_undisputedResolutionPaysAfterWindow() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("real evidence"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        vm.warp(block.timestamp + bounties.disputeWindow());
        vm.prank(makeAddr("anyone"));
        bounties.finalizeResolution(id);
        assertEq(bounties.pendingWithdrawals(honest), 0.1 ether + bounties.challengeBond());
        // the poster cannot dispute after the fact
        vm.prank(POSTER);
        vm.expectRevert("Not pending");
        bounties.disputeResolution{value: BOND}(id);
    }

    /// #2: the proposed winner cannot dispute (it would only delay its own payout,
    /// but it must not be able to move the bounty into the owner's hands either),
    /// and a stranger cannot dispute.
    function test_R2_onlyPartiesDispute() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("e"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        vm.prank(honest); vm.expectRevert("Winner cannot dispute"); bounties.disputeResolution{value: BOND}(id);
        address stranger = makeAddr("stranger"); vm.deal(stranger, 1 ether);
        vm.prank(stranger); vm.expectRevert("Not a party"); bounties.disputeResolution{value: BOND}(id);
    }

    /// #2 on HardnessRegistry: resolvers cannot contest, quorum only proposes,
    /// the poster disputes, the owner settles to the honest challenger.
    function test_R2_registryQuorumCannotSelfDeal() public {
        address[] memory resolvers = new address[](2);
        resolvers[0] = RESOLVER; resolvers[1] = makeAddr("resolver2");
        HardnessRegistry registry = new HardnessRegistry(resolvers, 2, 0.0001 ether, 0.01 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether); address shill = makeAddr("shill"); vm.deal(shill, 1 ether);
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = registry.postBounty{value: 0.01 ether}("thread", HardnessRegistry.BountyDimension.DATA_INTEGRITY, 1 days);

        // a resolver cannot challenge at all
        vm.prank(RESOLVER);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.submitChallenge{value: BOND}(id, keccak256("resolver junk"));

        vm.prank(honest); registry.submitChallenge{value: BOND}(id, keccak256("real"));
        vm.prank(shill);  registry.submitChallenge{value: BOND}(id, keccak256("junk"));
        vm.prank(resolvers[0]); registry.approveBountyResolution(id, shill);
        vm.prank(resolvers[1]); registry.approveBountyResolution(id, shill);

        HardnessRegistry.Bounty memory b = registry.getBounty(id);
        assertEq(uint8(b.status), uint8(HardnessRegistry.BountyStatus.PENDING_RESOLUTION));
        assertEq(registry.pendingWithdrawals(shill), 0);
        vm.expectRevert(HardnessRegistry.TooSoon.selector);
        registry.finalizeBountyResolution(id);

        vm.prank(POSTER); registry.disputeBountyResolution{value: BOND}(id);
        registry.settleBountyDispute(id, honest);
        assertEq(registry.pendingWithdrawals(honest), 0.01 ether + registry.bountyChallengeBond());
        assertEq(registry.pendingWithdrawals(shill), 0);
        assertEq(registry.pendingWithdrawals(POSTER), registry.bountyChallengeBond(), 'own dispute bond back (upheld); the shill bond is not the poster\'s');
        assertEq(registry.pendingWithdrawals(registry.treasury()), registry.bountyChallengeBond(), 'the shill bond goes to the treasury');
    }

    /// #2 on HardnessRegistry: a resolver cannot be named winner even by a quorum.
    function test_R2_registryResolverCannotBeWinner() public {
        address[] memory resolvers = new address[](1);
        resolvers[0] = RESOLVER;
        HardnessRegistry registry = new HardnessRegistry(resolvers, 1, 0.0001 ether, 0.01 ether, 0.001 ether);
        vm.deal(POSTER, 1 ether);
        vm.prank(POSTER);
        uint256 id = registry.postBounty{value: 0.01 ether}("thread", HardnessRegistry.BountyDimension.DATA_INTEGRITY, 1 days);
        address honest2 = makeAddr("honest"); vm.deal(honest2, 1 ether); vm.prank(honest2); registry.submitChallenge{value: BOND}(id, keccak256("real"));
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
    // ======================= Codex round 3 =======================

    /// P1: the Safe stops a shill proposal with the poster asleep — no bond, no other party.
    function test_R3_ownerCanDisputeWithoutPoster() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address shill = makeAddr("shill"); vm.deal(shill, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(shill); bounties.submitChallenge{value: BOND}(id, keccak256("junk"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, shill);
        bounties.disputeResolution(id);              // owner = this contract, value 0
        bounties.settleDispute(id, address(0));
        assertEq(bounties.pendingWithdrawals(shill), bounties.challengeBond(), 'bond back, reward never');
        assertEq(bounties.pendingWithdrawals(POSTER), 0.1 ether);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert("Not pending");
        bounties.finalizeResolution(id);
    }

    /// P1: a frivolous dispute costs the disputer its bond, paid to the rightful winner.
    function test_R3_frivolousDisputeForfeitsBond() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("real"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        vm.prank(POSTER); bounties.disputeResolution{value: BOND}(id);
        bounties.settleDispute(id, honest);          // owner confirms the proposal
        assertEq(bounties.pendingWithdrawals(honest), 0.1 ether + bounties.challengeBond(), 'reward + own bond');
        assertEq(bounties.pendingWithdrawals(POSTER), 0, 'the frivolous dispute bond is gone');
        assertEq(bounties.pendingWithdrawals(bounties.treasury()), bounties.challengeBond(), 'and it went to the treasury, not to the winner');
    }

    /// Codex r4: an unsettled dispute is not a permanent lock AND stalling is not free —
    /// the proposal stands and the disputer's bond goes to the treasury.
    function test_R3_stalledDisputeUpholdsProposal() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("real"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        vm.prank(POSTER); bounties.disputeResolution{value: BOND}(id);
        vm.expectRevert("Settlement timeout not reached");
        bounties.resolveStalledDispute(id);
        vm.warp(block.timestamp + bounties.disputeSettlementTimeout());
        vm.prank(makeAddr("anyone"));
        bounties.resolveStalledDispute(id);
        assertEq(bounties.pendingWithdrawals(honest), 0.1 ether + bounties.challengeBond(), 'the proposed winner is paid: stalling achieved nothing');
        assertEq(bounties.pendingWithdrawals(POSTER), 0, 'the staller lost its dispute bond');
        assertEq(bounties.pendingWithdrawals(bounties.treasury()), bounties.challengeBond(), 'to the treasury');
        vm.expectRevert("Not disputed");
        bounties.settleDispute(id, honest);
    }

    /// Codex r4: sybil challengers pay a bond each and forfeit all of them to the TREASURY.
    function test_R3_sybilChallengesForfeitToTreasury() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        for (uint256 i = 0; i < 3; i++) {
            address sybil = makeAddr(string(abi.encodePacked("sybil", i))); vm.deal(sybil, 1 ether);
            vm.prank(sybil); bounties.submitChallenge{value: BOND}(id, keccak256(abi.encodePacked("junk", i)));
        }
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("real"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        vm.warp(block.timestamp + bounties.disputeWindow());
        bounties.finalizeResolution(id);
        assertEq(bounties.pendingWithdrawals(POSTER), 0, 'the poster never collects forfeits');
        assertEq(bounties.pendingWithdrawals(bounties.treasury()), 3 * uint256(bounties.challengeBond()), 'three forfeited bonds to the treasury');
        assertEq(bounties.pendingWithdrawals(honest), 0.1 ether + bounties.challengeBond());
    }

    /// P2: the deadline is snapshotted — shortening the window later does not unlock a pending proposal.
    function test_R3_deadlineSnapshotIgnoresLaterWindowChange() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("real"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        uint64 snapshot = bounties.resolutionFinalizeAfter(id);
        bounties.setDisputeWindow(1 days);          // owner shortens AFTER the proposal
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert("Dispute window open");
        bounties.finalizeResolution(id);
        vm.warp(snapshot);
        bounties.finalizeResolution(id);
    }

    /// Codex r3: pull-payment isolates a receiver that reverts — the poster contract
    /// cannot take its refund, but nothing else is locked.
    function test_R3_revertingPosterDoesNotLockOthers() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        RevertingPoster rp = new RevertingPoster();
        vm.deal(address(rp), 1 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        uint256 id = rp.post{value: 0.1 ether}(bounties);
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("real"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        bounties.disputeResolution(id);              // owner disputes
        bounties.settleDispute(id, address(0));       // refund to the reverting poster
        assertEq(bounties.pendingWithdrawals(address(rp)), 0.1 ether, 'credited, not pushed');
        vm.expectRevert("Transfer failed");
        rp.pull(bounties);
        vm.prank(honest); bounties.withdraw();        // the honest challenger is unaffected
        assertEq(bounties.pendingWithdrawals(honest), 0);
    }

    /// P1 on HardnessRegistry: owner dispute + stalled-dispute timeout.
    function test_R3_registryOwnerDisputeAndTimeout() public {
        address[] memory resolvers = new address[](1);
        resolvers[0] = RESOLVER;
        HardnessRegistry registry = new HardnessRegistry(resolvers, 1, 0.0001 ether, 0.01 ether, 0.001 ether);
        address shill = makeAddr("shill"); vm.deal(shill, 1 ether);
        vm.prank(POSTER);
        uint256 id = registry.postBounty{value: 0.01 ether}("thread", HardnessRegistry.BountyDimension.DATA_INTEGRITY, 1 days);
        vm.prank(shill); registry.submitChallenge{value: BOND}(id, keccak256("junk"));
        vm.prank(RESOLVER); registry.approveBountyResolution(id, shill);
        registry.disputeBountyResolution(id);         // owner, no bond
        vm.expectRevert(HardnessRegistry.TooSoon.selector);
        registry.resolveStalledBountyDispute(id);
        registry.settleBountyDispute(id, address(0)); // the Safe rules: refund
        assertEq(registry.pendingWithdrawals(POSTER), 0.01 ether);
        assertEq(registry.pendingWithdrawals(shill), registry.bountyChallengeBond(), 'bond back, reward never');
    }

    /// Codex r4 on HardnessRegistry: a poster who stalls a legitimate winner loses its bond and the winner is paid.
    function test_R4_registryStalledDisputeUpholdsProposal() public {
        address[] memory resolvers = new address[](1);
        resolvers[0] = RESOLVER;
        HardnessRegistry registry = new HardnessRegistry(resolvers, 1, 0.0001 ether, 0.01 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.prank(POSTER);
        uint256 id = registry.postBounty{value: 0.01 ether}("thread", HardnessRegistry.BountyDimension.DATA_INTEGRITY, 1 days);
        vm.prank(honest); registry.submitChallenge{value: BOND}(id, keccak256("real"));
        vm.prank(RESOLVER); registry.approveBountyResolution(id, honest);
        vm.prank(POSTER); registry.disputeBountyResolution{value: BOND}(id);
        vm.warp(block.timestamp + registry.bountyDisputeSettlementTimeout());
        registry.resolveStalledBountyDispute(id);
        assertEq(registry.pendingWithdrawals(honest), 0.01 ether + BOND);
        assertEq(registry.pendingWithdrawals(POSTER), 0);
        assertEq(registry.pendingWithdrawals(registry.treasury()), BOND);
    }

    /// Codex r4 P1: bond farming. Poster and shill are one actor; three honest challengers
    /// post bonds; a compromised resolver picks the shill. The actor's net is ZERO and the
    /// honest bonds land in the treasury — nothing to farm.
    function test_R4_bondFarmingIsUnprofitable() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address attackerPoster = makeAddr("attackerPoster"); vm.deal(attackerPoster, 1 ether);
        address shill = makeAddr("shill"); vm.deal(shill, 1 ether);
        uint256 reward = BOND; // reward == bond, the cheapest farming setup
        vm.prank(attackerPoster);
        uint256 id = bounties.postBounty{value: reward}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(shill); bounties.submitChallenge{value: BOND}(id, keccak256("junk"));
        for (uint256 i = 0; i < 3; i++) {
            address h = makeAddr(string(abi.encodePacked("honest", i))); vm.deal(h, 1 ether);
            vm.prank(h); bounties.submitChallenge{value: BOND}(id, keccak256(abi.encodePacked("real", i)));
        }
        vm.prank(RESOLVER); bounties.resolveBounty(id, shill);
        vm.warp(block.timestamp + bounties.disputeWindow());
        bounties.finalizeResolution(id);
        uint256 actorIn = reward + BOND;
        uint256 actorOut = bounties.pendingWithdrawals(attackerPoster) + bounties.pendingWithdrawals(shill);
        assertEq(actorOut, actorIn, 'the colluding actor recovers exactly its principal, not a wei more');
        assertEq(bounties.pendingWithdrawals(attackerPoster), 0);
        assertEq(bounties.pendingWithdrawals(bounties.treasury()), 3 * BOND, 'honest bonds go to the treasury, not to the farmer');
    }

    /// Codex r4 P2: the settlement deadline is snapshotted at dispute time.
    function test_R4_settlementDeadlineSnapshot() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("real"));
        vm.prank(RESOLVER); bounties.resolveBounty(id, honest);
        vm.prank(POSTER); bounties.disputeResolution{value: BOND}(id);
        uint64 snapshot = bounties.settlementAfter(id);
        bounties.setDisputeSettlementTimeout(7 days);    // owner shortens AFTER the dispute
        vm.warp(block.timestamp + 7 days + 1);
        vm.expectRevert("Settlement timeout not reached");
        bounties.resolveStalledDispute(id);
        vm.warp(snapshot);
        bounties.resolveStalledDispute(id);
    }

    /// Codex r4 P2: the bond is fixed at post time and capped.
    function test_R4_bondSnapshotAndCap() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(RESOLVER, 0.0001 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.prank(POSTER);
        uint256 id = bounties.postBounty{value: 0.1 ether}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
        bounties.setChallengeBond(0.01 ether);            // raised AFTER the post
        vm.prank(honest); vm.expectRevert("Challenge bond required");
        bounties.submitChallenge{value: 0.01 ether}(id, keccak256("real"));
        vm.prank(honest); bounties.submitChallenge{value: BOND}(id, keccak256("real")); // the snapshot still applies
        vm.expectRevert("Bond above cap");
        bounties.setChallengeBond(1 ether);               // 1000 x 0.0001 = 0.1 max
    }

    /// Codex r4 P2 on HardnessRegistry: a revoked resolver's vote stops counting in an open round.
    function test_R4_revokedResolverVoteDoesNotCount() public {
        address[] memory resolvers = new address[](3);
        resolvers[0] = RESOLVER; resolvers[1] = makeAddr("r2"); resolvers[2] = makeAddr("r3");
        HardnessRegistry registry = new HardnessRegistry(resolvers, 2, 0.0001 ether, 0.01 ether, 0.001 ether);
        address honest = makeAddr("honest"); vm.deal(honest, 1 ether);
        vm.prank(POSTER);
        uint256 id = registry.postBounty{value: 0.01 ether}("thread", HardnessRegistry.BountyDimension.DATA_INTEGRITY, 1 days);
        vm.prank(honest); registry.submitChallenge{value: BOND}(id, keccak256("real"));
        vm.prank(resolvers[0]); registry.approveBountyResolution(id, honest);
        registry.updateResolver(resolvers[0], false);     // revoked with one vote in the round
        vm.prank(resolvers[1]); registry.approveBountyResolution(id, honest);
        HardnessRegistry.Bounty memory b = registry.getBounty(id);
        assertEq(uint8(b.status), uint8(HardnessRegistry.BountyStatus.CHALLENGED), 'one ACTIVE approval is not a quorum of two');
        assertEq(b.approvalCount, 1);
        vm.prank(resolvers[2]); registry.approveBountyResolution(id, honest);
        b = registry.getBounty(id);
        assertEq(uint8(b.status), uint8(HardnessRegistry.BountyStatus.PENDING_RESOLUTION));
    }
}

contract RevertingPoster {
    function post(BobbyAdversarialBounties b) external payable returns (uint256) {
        return b.postBounty{value: msg.value}("thread", BobbyAdversarialBounties.Dimension.DATA_INTEGRITY, 1 hours);
    }
    function pull(BobbyAdversarialBounties b) external { b.withdraw(); }
    receive() external payable { revert("no"); }
}
