// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/HardnessRegistry.sol";

contract HardnessRegistryTest is Test {
    HardnessRegistry public registry;

    address owner = address(this);
    address resolver1 = address(0xA1);
    address resolver2 = address(0xA2);
    address resolver3 = address(0xA3);
    address agent1 = address(0xB1);
    address agent2 = address(0xB2);
    address user = address(0xC1);
    address challenger1 = address(0xD1);
    address challenger2 = address(0xD2);
    address outsider = address(0xE1);

    string constant THREAD_ID = "thread-123";

    function setUp() public {
        address[] memory initialResolvers = new address[](2);
        initialResolvers[0] = resolver1;
        initialResolvers[1] = resolver2;
        registry = new HardnessRegistry(initialResolvers, 2);

        vm.deal(agent1, 10 ether);
        vm.deal(agent2, 10 ether);
        vm.deal(user, 10 ether);
        vm.deal(challenger1, 10 ether);
        vm.deal(challenger2, 10 ether);
        vm.deal(outsider, 10 ether);

        _registerAgent(agent1, "ipfs://agent-1");
        _registerAgent(agent2, "ipfs://agent-2");
    }

    receive() external payable {}

    function _registerAgent(address agent, string memory metadataURI) internal {
        vm.prank(agent);
        registry.registerAgent{value: 0.01 ether}(metadataURI);
    }

    function _predictionHash(string memory label) internal pure returns (bytes32) {
        return keccak256(bytes(label));
    }

    function _evidence(string memory label) internal pure returns (bytes32) {
        return keccak256(bytes(label));
    }

    function _postDefaultBounty() internal returns (uint256) {
        vm.prank(user);
        return registry.postBounty{value: 0.01 ether}(THREAD_ID, HardnessRegistry.BountyDimension.RISK_MANAGEMENT, 1 days);
    }

    function test_constructor_setsOwnershipAndResolvers() public {
        assertEq(registry.owner(), owner);
        assertTrue(registry.resolvers(resolver1));
        assertTrue(registry.resolvers(resolver2));
        assertEq(registry.resolverCount(), 2);
        assertEq(registry.resolverThreshold(), 2);
    }

    function test_constructor_rejectsInvalidThreshold() public {
        address[] memory initialResolvers = new address[](1);
        initialResolvers[0] = resolver1;

        vm.expectRevert(HardnessRegistry.ThresholdTooHigh.selector);
        new HardnessRegistry(initialResolvers, 2);
    }

    function test_registerAgent_createsProfile() public {
        vm.deal(outsider, 10 ether);
        vm.prank(outsider);
        registry.registerAgent{value: 0.01 ether}("ipfs://outsider");

        (bool registered, uint64 registeredAt, uint96 stake, string memory metadataURI) = registry.agentProfiles(outsider);
        assertTrue(registered);
        assertEq(uint256(registeredAt), block.timestamp);
        assertEq(stake, 0.01 ether);
        assertEq(metadataURI, "ipfs://outsider");
    }

    function test_registerAgent_updatesMetadata() public {
        vm.prank(agent1);
        registry.registerAgent{value: 0.01 ether}("ipfs://agent-1b");

        (, , , string memory metadataURI) = registry.agentProfiles(agent1);
        assertEq(metadataURI, "ipfs://agent-1b");
    }

    function test_registerAgent_revertsWhenPaused() public {
        registry.pause();
        vm.deal(outsider, 10 ether);
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.ContractPaused.selector);
        registry.registerAgent{value: 0.01 ether}("ipfs://nope");
    }

    function test_registerService_success() public {
        vm.prank(agent1);
        registry.registerService("judge-mode", 0.001 ether, agent1);

        HardnessRegistry.Service memory service = registry.getService("judge-mode");
        assertEq(service.owner, agent1);
        assertEq(service.recipient, agent1);
        assertEq(service.priceWei, 0.001 ether);
        assertTrue(service.active);
        assertEq(service.totalCalls, 0);
    }

    function test_registerService_requiresRegisteredAgent() public {
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.NotRegistered.selector);
        registry.registerService("judge-mode", 0.001 ether, outsider);
    }

    function test_registerService_rejectsDuplicateOwnerMismatch() public {
        vm.prank(agent1);
        registry.registerService("judge-mode", 0.001 ether, agent1);

        vm.prank(agent2);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.registerService("judge-mode", 0.002 ether, agent2);
    }

    function test_setServiceStatus_togglesService() public {
        vm.prank(agent1);
        registry.registerService("judge-mode", 0.001 ether, agent1);

        vm.prank(agent1);
        registry.setServiceStatus("judge-mode", false);

        HardnessRegistry.Service memory service = registry.getService("judge-mode");
        assertFalse(service.active);
    }

    function test_payForService_success() public {
        vm.prank(agent1);
        registry.registerService("bobby_analyze", 0.001 ether, agent1);

        bytes32 challengeId = keccak256("challenge-1");
        vm.prank(user);
        registry.payForService{value: 0.001 ether}(challengeId, "bobby_analyze");

        HardnessRegistry.Service memory service = registry.getService("bobby_analyze");
        assertEq(service.totalCalls, 1);
        assertEq(service.totalRevenue, 0.001 ether);
        assertEq(registry.pendingWithdrawals(agent1), 0.001 ether);
        assertTrue(registry.challengeConsumed(challengeId));
    }

    function test_payForService_refundsExcess() public {
        vm.prank(agent1);
        registry.registerService("bobby_analyze", 0.001 ether, agent1);

        bytes32 challengeId = keccak256("challenge-2");
        uint256 balBefore = user.balance;

        vm.prank(user);
        registry.payForService{value: 0.005 ether}(challengeId, "bobby_analyze");

        assertEq(balBefore - user.balance, 0.001 ether);
    }

    function test_payForService_revertsForReplay() public {
        vm.prank(agent1);
        registry.registerService("bobby_analyze", 0.001 ether, agent1);

        bytes32 challengeId = keccak256("challenge-3");
        vm.prank(user);
        registry.payForService{value: 0.001 ether}(challengeId, "bobby_analyze");

        vm.prank(user);
        vm.expectRevert(HardnessRegistry.ChallengeConsumed.selector);
        registry.payForService{value: 0.001 ether}(challengeId, "bobby_analyze");
    }

    function test_payForService_revertsForInactiveService() public {
        vm.prank(agent1);
        registry.registerService("bobby_analyze", 0.001 ether, agent1);
        vm.prank(agent1);
        registry.setServiceStatus("bobby_analyze", false);

        vm.prank(user);
        vm.expectRevert(HardnessRegistry.ServiceInactive.selector);
        registry.payForService{value: 0.001 ether}(keccak256("challenge-4"), "bobby_analyze");
    }

    function test_payForService_revertsForInsufficientPayment() public {
        vm.prank(agent1);
        registry.registerService("bobby_analyze", 0.001 ether, agent1);

        vm.prank(user);
        vm.expectRevert(HardnessRegistry.InsufficientPayment.selector);
        registry.payForService{value: 0.0005 ether}(keccak256("challenge-4b"), "bobby_analyze");
    }

    function test_commitPrediction_success() public {
        bytes32 predictionHash = _predictionHash("pred-1");

        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 77, 100_000e8, 110_000e8, 95_000e8);

        HardnessRegistry.Prediction memory prediction = registry.getPrediction(predictionHash);
        assertEq(prediction.agent, agent1);
        assertEq(prediction.conviction, 77);
        assertEq(prediction.entryPrice, 100_000e8);
        assertEq(prediction.targetPrice, 110_000e8);
        assertEq(prediction.stopPrice, 95_000e8);
        assertEq(uint8(prediction.result), uint8(HardnessRegistry.PredictionResult.NONE));
    }

    function test_commitPrediction_requiresRegisteredAgent() public {
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.NotRegistered.selector);
        registry.commitPrediction(_predictionHash("pred-2"), "BTC-USD", 77, 100, 120, 90);
    }

    function test_commitPrediction_revertsOnDuplicateHash() public {
        bytes32 predictionHash = _predictionHash("pred-3");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 70, 100, 120, 90);

        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.AlreadyExists.selector);
        registry.commitPrediction(predictionHash, "BTC-USD", 70, 100, 120, 90);
    }

    function test_resolvePrediction_byAgent_updatesStats() public {
        bytes32 predictionHash = _predictionHash("pred-4");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "ETH-USD", 80, 2_000e8, 2_300e8, 1_850e8);

        vm.warp(block.timestamp + registry.minPredictionAge());
        vm.prank(agent1);
        registry.resolvePrediction(predictionHash, 1250, HardnessRegistry.PredictionResult.WIN, 2_250e8);

        HardnessRegistry.Prediction memory prediction = registry.getPrediction(predictionHash);
        assertEq(uint8(prediction.result), uint8(HardnessRegistry.PredictionResult.WIN));
        assertEq(prediction.exitPrice, 2_250e8);

        (uint256 wins, uint256 losses, uint256 winRateBps) = registry.getAgentStats(agent1);
        assertEq(wins, 1);
        assertEq(losses, 0);
        assertEq(winRateBps, 10000);
    }

    function test_resolvePrediction_byRegisteredOracleAgent() public {
        bytes32 predictionHash = _predictionHash("pred-5");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "SOL-USD", 66, 150e8, 175e8, 130e8);

        vm.warp(block.timestamp + registry.minPredictionAge());
        vm.prank(agent2);
        registry.resolvePrediction(predictionHash, -800, HardnessRegistry.PredictionResult.LOSS, 138e8);

        (uint256 wins, uint256 losses, uint256 winRateBps) = registry.getAgentStats(agent1);
        assertEq(wins, 0);
        assertEq(losses, 1);
        assertEq(winRateBps, 0);
    }

    function test_resolvePrediction_revertsTooSoon() public {
        bytes32 predictionHash = _predictionHash("pred-6");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "SOL-USD", 66, 150e8, 175e8, 130e8);

        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.TooSoon.selector);
        registry.resolvePrediction(predictionHash, 100, HardnessRegistry.PredictionResult.WIN, 160e8);
    }

    function test_resolvePrediction_revertsForUnauthorizedCaller() public {
        bytes32 predictionHash = _predictionHash("pred-7");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "SOL-USD", 66, 150e8, 175e8, 130e8);

        vm.warp(block.timestamp + registry.minPredictionAge());
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.resolvePrediction(predictionHash, 100, HardnessRegistry.PredictionResult.WIN, 160e8);
    }

    function test_resolvePrediction_revertsForInvalidPnlSign() public {
        bytes32 predictionHash = _predictionHash("pred-8");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 66, 100, 120, 90);

        vm.warp(block.timestamp + registry.minPredictionAge());
        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.InvalidResult.selector);
        registry.resolvePrediction(predictionHash, -1, HardnessRegistry.PredictionResult.WIN, 121);
    }

    function test_expirePrediction_permissionless() public {
        bytes32 predictionHash = _predictionHash("pred-9");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 66, 100, 120, 90);

        vm.warp(block.timestamp + registry.predictionTTL() + 1);
        vm.prank(outsider);
        registry.expirePrediction(predictionHash);

        HardnessRegistry.AgentStats memory stats = registry.getAgentStatsFull(agent1);
        assertEq(stats.expired, 1);
        assertEq(stats.totalResolved, 1);
    }

    function test_expirePrediction_revertsBeforeTtl() public {
        bytes32 predictionHash = _predictionHash("pred-10");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 66, 100, 120, 90);

        vm.warp(block.timestamp + registry.predictionTTL());
        vm.expectRevert(HardnessRegistry.TooSoon.selector);
        registry.expirePrediction(predictionHash);
    }

    function test_publishSignal_success() public {
        vm.prank(agent1);
        registry.publishSignal("BTC-USD", 0, uint8(HardnessRegistry.Direction.LONG), 82, keccak256("ctx"));

        HardnessRegistry.Signal memory signal = registry.getSignal(agent1, "BTC-USD");
        assertEq(signal.agent, agent1);
        assertEq(signal.conviction, 82);
        assertEq(uint8(signal.direction), uint8(HardnessRegistry.Direction.LONG));
    }

    function test_publishSignal_requiresRegisteredAgent() public {
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.NotRegistered.selector);
        registry.publishSignal("BTC-USD", 0, uint8(HardnessRegistry.Direction.LONG), 82, keccak256("ctx"));
    }

    function test_publishSignal_revertsForInvalidDirection() public {
        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.publishSignal("BTC-USD", 0, 9, 82, keccak256("ctx"));
    }

    // getConsensus tests removed — function moved to off-chain indexing (EIP-170 size limit)

    function test_postBounty_success() public {
        uint256 bountyId = _postDefaultBounty();

        HardnessRegistry.Bounty memory bounty = registry.getBounty(bountyId);
        assertEq(bounty.poster, user);
        assertEq(bounty.reward, 0.01 ether);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.OPEN));
        assertEq(bounty.approvalThreshold, 2);
    }

    function test_postBounty_revertsBelowMinimum() public {
        vm.prank(user);
        vm.expectRevert(HardnessRegistry.InsufficientPayment.selector);
        registry.postBounty{value: 0.00001 ether}(THREAD_ID, HardnessRegistry.BountyDimension.NOVELTY, 1 days);
    }

    function test_submitChallenge_success() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge(bountyId, _evidence("e1"));

        HardnessRegistry.Bounty memory bounty = registry.getBounty(bountyId);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.CHALLENGED));
        assertEq(bounty.challengeCount, 1);
    }

    function test_submitChallenge_revertsForPoster() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(user);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.submitChallenge(bountyId, _evidence("e1"));
    }

    function test_submitChallenge_revertsAfterWindow() public {
        uint256 bountyId = _postDefaultBounty();
        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(challenger1);
        vm.expectRevert(HardnessRegistry.WindowExpired.selector);
        registry.submitChallenge(bountyId, _evidence("late"));
    }

    function test_approveBountyResolution_requiresThreshold() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge(bountyId, _evidence("e1"));

        vm.prank(resolver1);
        registry.approveBountyResolution(bountyId, challenger1);

        HardnessRegistry.Bounty memory bounty = registry.getBounty(bountyId);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.CHALLENGED));
        assertEq(bounty.approvalCount, 1);
        assertEq(registry.pendingWithdrawals(challenger1), 0);

        vm.prank(resolver2);
        registry.approveBountyResolution(bountyId, challenger1);

        bounty = registry.getBounty(bountyId);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.RESOLVED));
        assertEq(registry.pendingWithdrawals(challenger1), 0.01 ether);
    }

    function test_approveBountyResolution_revertsForNonResolver() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge(bountyId, _evidence("e1"));

        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.approveBountyResolution(bountyId, challenger1);
    }

    function test_approveBountyResolution_revertsForNonChallengerWinner() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge(bountyId, _evidence("e1"));

        vm.prank(resolver1);
        vm.expectRevert(HardnessRegistry.NotFound.selector);
        registry.approveBountyResolution(bountyId, challenger2);
    }

    function test_approveBountyResolution_resetsRoundOnNewWinner() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge(bountyId, _evidence("e1"));
        vm.prank(challenger2);
        registry.submitChallenge(bountyId, _evidence("e2"));

        vm.prank(resolver1);
        registry.approveBountyResolution(bountyId, challenger1);

        vm.prank(resolver2);
        registry.approveBountyResolution(bountyId, challenger2);

        HardnessRegistry.Bounty memory bounty = registry.getBounty(bountyId);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.CHALLENGED));
        assertEq(bounty.approvalCount, 1);
        assertEq(registry.pendingWithdrawals(challenger1), 0);
        assertEq(registry.pendingWithdrawals(challenger2), 0);
    }

    function test_approveBountyResolution_revertsOnDuplicateApproval() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge(bountyId, _evidence("e1"));

        vm.prank(resolver1);
        registry.approveBountyResolution(bountyId, challenger1);

        vm.prank(resolver1);
        vm.expectRevert(HardnessRegistry.AlreadyApproved.selector);
        registry.approveBountyResolution(bountyId, challenger1);
    }

    function test_withdrawBounty_afterExpiry() public {
        uint256 bountyId = _postDefaultBounty();
        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(user);
        registry.withdrawBounty(bountyId);

        assertEq(registry.pendingWithdrawals(user), 0.01 ether);
        HardnessRegistry.Bounty memory bounty = registry.getBounty(bountyId);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.WITHDRAWN));
    }

    function test_withdrawBounty_revertsBeforeExpiry() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(user);
        vm.expectRevert(HardnessRegistry.TooSoon.selector);
        registry.withdrawBounty(bountyId);
    }

    function test_withdrawBounty_afterChallengeGracePeriod() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge(bountyId, _evidence("e1"));

        vm.warp(block.timestamp + 1 days + registry.challengeGracePeriod() + 1);

        vm.prank(user);
        registry.withdrawBounty(bountyId);

        assertEq(registry.pendingWithdrawals(user), 0.01 ether);
    }

    function test_withdraw_success() public {
        vm.prank(agent1);
        registry.registerService("bobby_analyze", 0.001 ether, agent1);

        vm.prank(user);
        registry.payForService{value: 0.001 ether}(keccak256("challenge-withdraw"), "bobby_analyze");

        uint256 balanceBefore = agent1.balance;
        vm.prank(agent1);
        registry.withdraw();

        assertEq(agent1.balance - balanceBefore, 0.001 ether);
        assertEq(registry.pendingWithdrawals(agent1), 0);
    }

    function test_withdraw_revertsWhenNothingPending() public {
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.withdraw();
    }

    function test_updateResolver_addAndRemove() public {
        registry.updateResolver(resolver3, true);
        assertTrue(registry.resolvers(resolver3));
        assertEq(registry.resolverCount(), 3);

        registry.setResolverThreshold(1);
        registry.updateResolver(resolver3, false);
        assertFalse(registry.resolvers(resolver3));
        assertEq(registry.resolverCount(), 2);
    }

    function test_updateResolver_revertsIfThresholdWouldBreak() public {
        vm.expectRevert(HardnessRegistry.ThresholdTooHigh.selector);
        registry.updateResolver(resolver1, false);
    }

    function test_setResolverThreshold_rejectsZero() public {
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setResolverThreshold(0);
    }

    function test_setMinBounty_rejectsBelowAbsoluteFloor() public {
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setMinBounty(0);
    }

    function test_twoStepOwnershipTransfer() public {
        registry.transferOwnership(agent1);
        assertEq(registry.pendingOwner(), agent1);

        vm.prank(agent1);
        registry.acceptOwnership();

        assertEq(registry.owner(), agent1);
        assertEq(registry.pendingOwner(), address(0));
    }

    function test_pause_blocksMutationsButNotWithdraw() public {
        vm.prank(agent1);
        registry.registerService("bobby_analyze", 0.001 ether, agent1);
        vm.prank(user);
        registry.payForService{value: 0.001 ether}(keccak256("challenge-paused"), "bobby_analyze");

        registry.pause();

        vm.prank(agent2);
        vm.expectRevert(HardnessRegistry.ContractPaused.selector);
        registry.publishSignal("BTC-USD", 0, uint8(HardnessRegistry.Direction.LONG), 50, bytes32(0));

        uint256 balanceBefore = agent1.balance;
        vm.prank(agent1);
        registry.withdraw();
        assertEq(agent1.balance - balanceBefore, 0.001 ether);
    }
}
