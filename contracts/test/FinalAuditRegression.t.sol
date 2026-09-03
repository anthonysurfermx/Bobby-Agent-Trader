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
}
