// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/HardnessRegistry.sol";
import "../src/BobbyAdversarialBounties.sol";

contract FinalAuditPoCTest is Test {
    address internal constant AGENT = address(0xA11CE);
    address internal constant POSTER = address(0xB0B);
    address internal constant RESOLVER = address(0xBEEF);

    function test_P0_agentCanForgePerfectRecordWithImpossibleExitPrice() public {
        address[] memory resolvers = new address[](1);
        resolvers[0] = RESOLVER;
        HardnessRegistry registry = new HardnessRegistry(
            resolvers,
            1,
            0.0001 ether,
            0.01 ether,
            0.001 ether
        );

        vm.deal(AGENT, 1 ether);
        vm.startPrank(AGENT);
        registry.registerAgent{value: 0.01 ether}("ipfs://attacker");

        bytes32 predictionHash = keccak256("forged-perfect-record");
        registry.commitPrediction(
            predictionHash,
            "BTC-USD",
            100,
            100e8,
            110e8,
            90e8
        );
        vm.warp(block.timestamp + registry.minPredictionAge());
        registry.resolvePrediction(
            predictionHash,
            1,
            HardnessRegistry.PredictionResult.WIN,
            1
        );
        vm.stopPrank();

        (uint256 wins, uint256 losses, uint256 winRateBps) = registry.getAgentStats(AGENT);
        HardnessRegistry.Prediction memory prediction = registry.getPrediction(predictionHash);
        assertEq(wins, 1);
        assertEq(losses, 0);
        assertEq(winRateBps, 10_000);
        assertEq(prediction.exitPrice, 1);
    }

    function test_P1_resolverCanChallengeAwardAndWithdrawPosterBounty() public {
        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(
            RESOLVER,
            0.0001 ether,
            0.001 ether
        );

        vm.deal(POSTER, 1 ether);
        vm.deal(RESOLVER, 1 ether);
        vm.prank(POSTER);
        uint256 bountyId = bounties.postBounty{value: 0.1 ether}(
            "private-thread-id",
            BobbyAdversarialBounties.Dimension.DATA_INTEGRITY,
            1 hours
        );

        vm.startPrank(RESOLVER);
        bounties.submitChallenge(bountyId, keccak256("resolver-evidence"));
        bounties.resolveBounty(bountyId, RESOLVER);
        uint256 balanceBefore = RESOLVER.balance;
        bounties.withdraw();
        vm.stopPrank();

        assertEq(RESOLVER.balance - balanceBefore, 0.1 ether);
        assertEq(bounties.pendingWithdrawals(RESOLVER), 0);

        vm.warp(block.timestamp + 5 days);
        vm.prank(POSTER);
        vm.expectRevert("Already finalized");
        bounties.withdrawBounty(bountyId);
    }
}
