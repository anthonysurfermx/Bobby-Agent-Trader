// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {StdStorage, stdStorage} from "forge-std/StdStorage.sol";
import "../src/HardnessRegistry.sol";

contract HardnessRegistryTest is Test {
    using stdStorage for StdStorage;

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
    /// @dev the constructor copies the initial minBounty into the challenge bond; a constant keeps vm.prank on the real call
    uint256 internal constant BOND = 0.001 ether;

    string constant THREAD_ID = "thread-123";

    function setUp() public {
        address[] memory initialResolvers = new address[](2);
        initialResolvers[0] = resolver1;
        initialResolvers[1] = resolver2;
        registry = new HardnessRegistry(initialResolvers, 2, 0.0001 ether, 0.01 ether, 0.001 ether);

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
        new HardnessRegistry(initialResolvers, 2, 0.0001 ether, 0.01 ether, 0.001 ether);
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
        registry.registerAgent("ipfs://agent-1b");

        (, , uint96 stake, string memory metadataURI) = registry.agentProfiles(agent1);
        assertEq(stake, registry.REGISTRATION_STAKE());
        assertEq(metadataURI, "ipfs://agent-1b");
    }

    function test_registerAgent_excessAndMetadataValueStayWithdrawable() public {
        vm.prank(outsider);
        registry.registerAgent{value: 0.03 ether}("ipfs://outsider");

        (, , uint96 stake,) = registry.agentProfiles(outsider);
        assertEq(stake, registry.REGISTRATION_STAKE());
        assertEq(registry.pendingWithdrawals(outsider), 0.02 ether);

        vm.prank(outsider);
        registry.registerAgent{value: 0.005 ether}("ipfs://updated");
        string memory metadataURI;
        (, , stake, metadataURI) = registry.agentProfiles(outsider);
        assertEq(stake, registry.REGISTRATION_STAKE());
        assertEq(metadataURI, "ipfs://updated");
        assertEq(registry.pendingWithdrawals(outsider), 0.025 ether);
    }

    function test_unregisterAgent_twoStepExitReturnsStakeExactlyOnce() public {
        _registerAgent(outsider, "ipfs://exit");

        vm.prank(outsider);
        registry.requestUnregister();
        (bool registered,, uint96 stake,) = registry.agentProfiles(outsider);
        assertFalse(registered);
        assertEq(stake, registry.REGISTRATION_STAKE());
        uint64 availableAt = registry.unstakeAvailableAt(outsider);
        assertEq(availableAt, block.timestamp + registry.UNSTAKE_COOLDOWN());

        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.registerAgent{value: 0.01 ether}("ipfs://overwrite");
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.TooSoon.selector);
        registry.unregisterAgent();

        vm.warp(availableAt);
        vm.prank(outsider);
        registry.unregisterAgent();
        (registered,, stake,) = registry.agentProfiles(outsider);
        assertFalse(registered);
        assertEq(stake, 0);
        assertEq(registry.pendingWithdrawals(outsider), registry.REGISTRATION_STAKE());
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.NotFound.selector);
        registry.unregisterAgent();
    }

    function test_unregisterAgent_canCancelBeforeCooldown() public {
        _registerAgent(outsider, "ipfs://stay");
        vm.prank(outsider);
        registry.requestUnregister();
        vm.prank(outsider);
        registry.cancelUnregister();
        (bool registered,, uint96 stake,) = registry.agentProfiles(outsider);
        assertTrue(registered);
        assertEq(stake, registry.REGISTRATION_STAKE());
        assertEq(registry.unstakeAvailableAt(outsider), 0);
    }

    function test_unregisterAgent_requiresInactiveServices() public {
        vm.prank(agent1);
        registry.registerService("judge-mode", 0.001 ether, agent1);
        assertEq(registry.activeServiceCount(agent1), 1);

        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.requestUnregister();
        vm.prank(agent1);
        registry.setServiceStatus("judge-mode", false);
        assertEq(registry.activeServiceCount(agent1), 0);
        vm.prank(agent1);
        registry.requestUnregister();
    }

    function test_unregisterAgent_requiresResolvedPredictions() public {
        bytes32 predictionHash = _predictionHash("exit-pending");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 77, 100, 120, 90);
        assertEq(registry.unresolvedPredictionCount(agent1), 1);

        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.requestUnregister();
        vm.warp(registry.predictionExpiresAt(predictionHash) + 1);
        registry.expirePrediction(predictionHash);
        assertEq(registry.unresolvedPredictionCount(agent1), 0);
        vm.prank(agent1);
        registry.requestUnregister();
    }

    function test_slashAgent_isSafeOnlyAndCannotExceedStake() public {
        registry.setHardnessScorer(outsider);
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.NotOwner.selector);
        registry.slashAgent(agent1, 1, keccak256("hot-key"));

        registry.slashAgent(agent1, type(uint256).max, keccak256("safe-ruling"));
        (bool registered,, uint96 stake,) = registry.agentProfiles(agent1);
        assertFalse(registered);
        assertEq(stake, 0);
        assertEq(registry.pendingWithdrawals(owner), registry.REGISTRATION_STAKE());
    }

    function test_slashAgent_fullSlashStopsExistingServicePayments() public {
        vm.prank(agent1);
        registry.registerService("judge-mode", 0.001 ether, agent1);

        registry.slashAgent(agent1, type(uint256).max, keccak256("safe-ruling"));

        vm.deal(outsider, 1 ether);
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.ServiceInactive.selector);
        registry.payForService{value: 0.001 ether}(keccak256("after-slash"), "judge-mode");

        vm.prank(agent1);
        registry.registerAgent{value: 0.01 ether}("ipfs://agent-1-restaked");
        vm.prank(outsider);
        registry.payForService{value: 0.001 ether}(keccak256("after-restake"), "judge-mode");
        assertEq(registry.pendingWithdrawals(agent1), 0.001 ether);

        vm.prank(agent1);
        registry.setServiceStatus("judge-mode", false);
        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.ServiceInactive.selector);
        registry.payForService{value: 0.001 ether}(keccak256("manually-disabled"), "judge-mode");

        vm.prank(agent1);
        registry.setServiceStatus("judge-mode", true);
        vm.prank(outsider);
        registry.payForService{value: 0.001 ether}(keccak256("manually-restored"), "judge-mode");
        assertEq(registry.pendingWithdrawals(agent1), 0.002 ether);
    }

    function test_slashAgent_partialSlashAndExitConserveWithdrawals() public {
        vm.prank(agent1);
        registry.registerService("judge-mode", 0.001 ether, agent1);

        registry.slashAgent(agent1, 0.004 ether, keccak256("partial-ruling"));
        (bool registered,, uint96 stake,) = registry.agentProfiles(agent1);
        assertTrue(registered);
        assertEq(stake, 0.006 ether);

        vm.prank(outsider);
        registry.payForService{value: 0.001 ether}(keccak256("after-partial-slash"), "judge-mode");
        vm.prank(agent1);
        registry.setServiceStatus("judge-mode", false);
        vm.prank(agent1);
        registry.requestUnregister();

        registry.slashAgent(agent1, 0.002 ether, keccak256("exit-ruling"));
        uint64 availableAt = registry.unstakeAvailableAt(agent1);
        vm.warp(availableAt);
        vm.prank(agent1);
        registry.unregisterAgent();

        assertEq(registry.pendingWithdrawals(owner), 0.006 ether);
        assertEq(registry.pendingWithdrawals(agent1), 0.005 ether);
        assertEq(address(registry).balance, 0.021 ether);

        vm.prank(agent1);
        registry.withdraw();
        registry.withdraw();
        assertEq(address(registry).balance, 0.01 ether);
    }

    function test_slashAgent_fullSlashDuringExitCanCleanAndReregister() public {
        vm.prank(agent1);
        registry.requestUnregister();
        uint64 availableAt = registry.unstakeAvailableAt(agent1);

        registry.slashAgent(agent1, type(uint256).max, keccak256("exit-full-slash"));
        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.InsufficientStake.selector);
        registry.cancelUnregister();
        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.registerAgent{value: 0.01 ether}("ipfs://blocked-before-cleanup");

        vm.warp(availableAt);
        vm.prank(agent1);
        registry.unregisterAgent();
        vm.prank(agent1);
        registry.registerAgent{value: 0.01 ether}("ipfs://agent-1-fresh");

        (bool registered,, uint96 stake,) = registry.agentProfiles(agent1);
        assertTrue(registered);
        assertEq(stake, registry.REGISTRATION_STAKE());
        assertEq(registry.unstakeAvailableAt(agent1), 0);
        assertEq(registry.pendingWithdrawals(owner), registry.REGISTRATION_STAKE());
    }

    function testFuzz_slashExitAndServiceRevenueConserveLiabilities(
        uint96 rawInitialSlash,
        uint96 rawExitSlash,
        uint8 rawCalls,
        bool ownerWithdrawsFirst
    ) public {
        uint256 registrationStake = registry.REGISTRATION_STAKE();
        uint256 initialSlash = bound(uint256(rawInitialSlash), 1, registrationStake - 1);
        uint256 calls = bound(uint256(rawCalls), 1, 5);

        vm.prank(agent1);
        registry.registerService("fuzz-service", 0.001 ether, agent1);
        registry.slashAgent(agent1, initialSlash, keccak256("initial-partial-slash"));

        for (uint256 i = 0; i < calls; i++) {
            vm.prank(outsider);
            registry.payForService{value: 0.001 ether}(
                keccak256(abi.encode("fuzz-service-call", i)), "fuzz-service"
            );
        }

        vm.prank(agent1);
        registry.setServiceStatus("fuzz-service", false);
        vm.prank(agent1);
        registry.requestUnregister();

        uint256 stakeBeforeExitSlash = registrationStake - initialSlash;
        uint256 exitSlash = bound(uint256(rawExitSlash), 1, stakeBeforeExitSlash);
        registry.slashAgent(agent1, exitSlash, keccak256("cooldown-slash"));

        vm.warp(registry.unstakeAvailableAt(agent1));
        vm.prank(agent1);
        registry.unregisterAgent();

        uint256 serviceRevenue = calls * 0.001 ether;
        uint256 returnedStake = stakeBeforeExitSlash - exitSlash;
        assertEq(registry.pendingWithdrawals(owner), initialSlash + exitSlash);
        assertEq(registry.pendingWithdrawals(agent1), serviceRevenue + returnedStake);
        assertEq(address(registry).balance, registrationStake * 2 + serviceRevenue);

        if (ownerWithdrawsFirst) {
            registry.withdraw();
            vm.prank(agent1);
            registry.withdraw();
        } else {
            vm.prank(agent1);
            registry.withdraw();
            registry.withdraw();
        }
        assertEq(registry.pendingWithdrawals(owner), 0);
        assertEq(registry.pendingWithdrawals(agent1), 0);
        assertEq(address(registry).balance, registrationStake);

        vm.prank(agent1);
        registry.registerAgent{value: registrationStake}("ipfs://agent-1-reregistered");
        assertEq(registry.activeServiceCount(agent1), 0);
        vm.prank(agent1);
        registry.setServiceStatus("fuzz-service", true);
        assertEq(registry.activeServiceCount(agent1), 1);
    }

    function testFuzz_activeServiceCountMatchesServiceStates(uint256 rawOperations) public {
        string[3] memory serviceIds = ["svc-a", "svc-b", "svc-c"];
        bool[3] memory active = [true, true, true];
        uint256 registrationStake = registry.REGISTRATION_STAKE();
        for (uint256 i = 0; i < serviceIds.length; i++) {
            vm.prank(agent1);
            registry.registerService(serviceIds[i], 0.001 ether, agent1);
        }

        for (uint256 i = 0; i < 12; i++) {
            uint256 operation = rawOperations >> (i * 5);
            uint256 index = operation % serviceIds.length;
            bool registerAgain = ((operation >> 2) & 1) == 1;
            bool nextActive = ((operation >> 3) & 1) == 1;

            vm.prank(agent1);
            if (registerAgain) {
                registry.registerService(serviceIds[index], 0.001 ether + i + 1, agent1);
                active[index] = true;
            } else {
                registry.setServiceStatus(serviceIds[index], nextActive);
                active[index] = nextActive;
            }

            uint256 expectedActive;
            for (uint256 j = 0; j < active.length; j++) {
                if (active[j]) expectedActive++;
            }
            assertEq(registry.activeServiceCount(agent1), expectedActive);
        }

        registry.slashAgent(agent1, type(uint256).max, keccak256("full-slash"));
        for (uint256 i = 0; i < serviceIds.length; i++) {
            vm.prank(agent1);
            registry.setServiceStatus(serviceIds[i], false);
        }
        assertEq(registry.activeServiceCount(agent1), 0);

        vm.prank(agent1);
        registry.registerAgent{value: registrationStake}("ipfs://agent-1-restaked");
        for (uint256 i = 0; i < serviceIds.length; i++) {
            vm.prank(agent1);
            registry.registerService(serviceIds[i], 0.001 ether, agent1);
        }
        assertEq(registry.activeServiceCount(agent1), serviceIds.length);
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

    /// @dev Final audit P0-3: an agent can no longer resolve its own prediction —
    /// the resolver does, and the outcome is derived from entry/exit
    /// ((2250-2000)/2000 = +1250 bps, which is what the resolver reports here).
    function test_resolvePrediction_byResolver_updatesStats() public {
        bytes32 predictionHash = _predictionHash("pred-4");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "ETH-USD", 80, 2_000e8, 2_300e8, 1_850e8);

        address r = makeAddr("resolver-pred-4");
        registry.updateResolver(r, true);
        vm.warp(block.timestamp + registry.minPredictionAge());
        vm.prank(r);
        registry.resolvePrediction(predictionHash, 1250, HardnessRegistry.PredictionResult.WIN, 2_250e8);

        HardnessRegistry.Prediction memory prediction = registry.getPrediction(predictionHash);
        assertEq(uint8(prediction.result), uint8(HardnessRegistry.PredictionResult.WIN));
        assertEq(prediction.exitPrice, 2_250e8);

        (uint256 wins, uint256 losses, uint256 winRateBps) = registry.getAgentStats(agent1);
        assertEq(wins, 1);
        assertEq(losses, 0);
        assertEq(winRateBps, 10000);
    }

    /// @dev Audit Base r4 (CRITICAL): being a registered agent grants NO authority
    /// over other agents' predictions — the old behavior let anyone register and
    /// stamp LOSS on a competitor's record.
    function test_resolvePrediction_registeredAgentCannotResolveOthers() public {
        bytes32 predictionHash = _predictionHash("pred-5");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "SOL-USD", 66, 150e8, 175e8, 130e8);

        vm.warp(block.timestamp + registry.minPredictionAge());
        vm.prank(agent2);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.resolvePrediction(predictionHash, -800, HardnessRegistry.PredictionResult.LOSS, 138e8);
    }

    function test_resolvePrediction_byApprovedResolver() public {
        bytes32 predictionHash = _predictionHash("pred-5b");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "SOL-USD", 66, 150e8, 175e8, 130e8);

        address approvedResolver = makeAddr("approvedResolver");
        registry.updateResolver(approvedResolver, true);

        vm.warp(block.timestamp + registry.minPredictionAge());
        vm.prank(approvedResolver);
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

        address r = makeAddr("resolver-pred-8");
        registry.updateResolver(r, true);
        vm.warp(block.timestamp + registry.minPredictionAge());
        vm.prank(r);
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

    function test_predictionExpiry_isSnapshottedAtCommit() public {
        bytes32 predictionHash = _predictionHash("ttl-snapshot");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 66, 100, 120, 90);
        uint64 expiry = registry.predictionExpiresAt(predictionHash);

        registry.setPredictionTTL(2 hours);
        vm.warp(block.timestamp + 3 hours);
        vm.expectRevert(HardnessRegistry.TooSoon.selector);
        registry.expirePrediction(predictionHash);

        vm.warp(expiry + 1);
        registry.expirePrediction(predictionHash);
    }

    function test_predictionTimeSettersRejectUint64Truncation() public {
        uint256 largestDelay = uint256(type(uint64).max) - block.timestamp;
        registry.setPredictionTTL(largestDelay);
        registry.setMinPredictionAge(largestDelay - 1);
        assertEq(registry.minPredictionAge(), largestDelay - 1);
        assertEq(registry.predictionTTL(), largestDelay);

        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setMinPredictionAge(largestDelay);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setMinPredictionAge(largestDelay + 1);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setPredictionTTL(largestDelay + 1);

        vm.warp(block.timestamp + 1);
        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.commitPrediction(_predictionHash("stale-time-bound"), "BTC-USD", 66, 100, 120, 90);
    }

    function test_predictionTimeSettersPreserveResolutionWindow() public {
        uint256 currentTTL = registry.predictionTTL();
        uint256 currentMinAge = registry.minPredictionAge();
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setMinPredictionAge(currentTTL);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setPredictionTTL(currentMinAge);

        registry.setPredictionTTL(2 hours);
        registry.setMinPredictionAge(90 minutes);
        bytes32 predictionHash = _predictionHash("valid-resolution-window");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 66, 100, 120, 90);

        HardnessRegistry.Prediction memory prediction = registry.getPrediction(predictionHash);
        assertLt(prediction.minResolveAt, registry.predictionExpiresAt(predictionHash));
    }

    function test_predictionTimeSettersAcceptOneSecondResolutionWindow() public {
        registry.setPredictionTTL(2 hours);
        registry.setMinPredictionAge(2 hours - 1);

        bytes32 predictionHash = _predictionHash("one-second-window");
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 66, 100, 120, 90);

        HardnessRegistry.Prediction memory prediction = registry.getPrediction(predictionHash);
        assertEq(registry.predictionExpiresAt(predictionHash) - prediction.minResolveAt, 1);
    }

    function testFuzz_predictionTimeSetterOrdersPreserveWindow(
        uint256 rawMinAge,
        uint256 rawTTL,
        bool ttlFirst
    ) public {
        uint256 ttl = bound(rawTTL, 1 hours + 1, 30 days);
        uint256 minAge = bound(rawMinAge, 10 minutes, ttl - 1);

        if (ttlFirst) {
            registry.setPredictionTTL(ttl);
            registry.setMinPredictionAge(minAge);
        } else {
            registry.setMinPredictionAge(minAge);
            registry.setPredictionTTL(ttl);
        }

        uint256 committedAt = block.timestamp;
        bytes32 predictionHash = keccak256(abi.encode("fuzz-valid-window", rawMinAge, rawTTL, ttlFirst));
        vm.prank(agent1);
        registry.commitPrediction(predictionHash, "BTC-USD", 66, 100, 120, 90);

        HardnessRegistry.Prediction memory prediction = registry.getPrediction(predictionHash);
        assertEq(prediction.minResolveAt, committedAt + minAge);
        assertEq(registry.predictionExpiresAt(predictionHash), committedAt + ttl);
        assertLt(prediction.minResolveAt, registry.predictionExpiresAt(predictionHash));
    }

    function testFuzz_predictionTimeSettersRejectInvalidRelationship(
        uint256 rawTTL,
        uint256 rawMinAge,
        uint256 rawExcess,
        uint256 rawBadTTL
    ) public {
        uint256 ttl = bound(rawTTL, 1 hours + 2, 30 days);
        uint256 minAge = bound(rawMinAge, 1 hours, ttl - 1);
        registry.setPredictionTTL(ttl);
        registry.setMinPredictionAge(minAge);

        uint256 invalidMinAge = ttl + bound(rawExcess, 0, 30 days);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setMinPredictionAge(invalidMinAge);

        uint256 invalidTTL = bound(rawBadTTL, 1 hours, minAge);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setPredictionTTL(invalidTTL);
    }

    function test_commitPrediction_rejectsInvalidStoredResolutionWindow() public {
        // Simulate a legacy/corrupted pair that bypassed both owner setters.
        stdstore.target(address(registry)).sig("minPredictionAge()").checked_write(2 hours);
        stdstore.target(address(registry)).sig("predictionTTL()").checked_write(1 hours);

        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.commitPrediction(_predictionHash("invalid-stored-window"), "BTC-USD", 66, 100, 120, 90);
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

    function test_signalTimeSetterAndPublishRejectUint64Truncation() public {
        uint256 largestDelay = uint256(type(uint64).max) - block.timestamp;
        registry.setDefaultSignalTTL(largestDelay);
        assertEq(registry.defaultSignalTTL(), largestDelay);

        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.setDefaultSignalTTL(largestDelay + 1);

        vm.warp(block.timestamp + 1);
        vm.prank(agent1);
        vm.expectRevert(HardnessRegistry.InvalidValue.selector);
        registry.publishSignal("BTC-USD", 0, uint8(HardnessRegistry.Direction.LONG), 82, keccak256("stale-time-bound"));
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
        registry.submitChallenge{value: BOND}(bountyId, _evidence("e1"));

        HardnessRegistry.Bounty memory bounty = registry.getBounty(bountyId);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.CHALLENGED));
        assertEq(bounty.challengeCount, 1);
    }

    function test_submitChallenge_revertsForPoster() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(user);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.submitChallenge{value: BOND}(bountyId, _evidence("e1"));
    }

    function test_submitChallenge_revertsAfterWindow() public {
        uint256 bountyId = _postDefaultBounty();
        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(challenger1);
        vm.expectRevert(HardnessRegistry.WindowExpired.selector);
        registry.submitChallenge{value: BOND}(bountyId, _evidence("late"));
    }

    function test_approveBountyResolution_requiresThreshold() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge{value: BOND}(bountyId, _evidence("e1"));

        vm.prank(resolver1);
        registry.approveBountyResolution(bountyId, challenger1);

        HardnessRegistry.Bounty memory bounty = registry.getBounty(bountyId);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.CHALLENGED));
        assertEq(bounty.approvalCount, 1);
        assertEq(registry.pendingWithdrawals(challenger1), 0);

        vm.prank(resolver2);
        registry.approveBountyResolution(bountyId, challenger1);

        // Codex r2 #2: quorum proposes; nothing is owed until the window passes.
        bounty = registry.getBounty(bountyId);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.PENDING_RESOLUTION));
        assertEq(registry.pendingWithdrawals(challenger1), 0);

        vm.warp(block.timestamp + registry.bountyDisputeWindow());
        registry.finalizeBountyResolution(bountyId);
        bounty = registry.getBounty(bountyId);
        assertEq(uint8(bounty.status), uint8(HardnessRegistry.BountyStatus.RESOLVED));
        assertEq(registry.pendingWithdrawals(challenger1), 0.01 ether + registry.bountyChallengeBond()); // reward + own bond back
    }

    function test_approveBountyResolution_revertsForNonResolver() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge{value: BOND}(bountyId, _evidence("e1"));

        vm.prank(outsider);
        vm.expectRevert(HardnessRegistry.NotAuthorized.selector);
        registry.approveBountyResolution(bountyId, challenger1);
    }

    function test_approveBountyResolution_revertsForNonChallengerWinner() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge{value: BOND}(bountyId, _evidence("e1"));

        vm.prank(resolver1);
        vm.expectRevert(HardnessRegistry.NotFound.selector);
        registry.approveBountyResolution(bountyId, challenger2);
    }

    function test_approveBountyResolution_resetsRoundOnNewWinner() public {
        uint256 bountyId = _postDefaultBounty();

        vm.prank(challenger1);
        registry.submitChallenge{value: BOND}(bountyId, _evidence("e1"));
        vm.prank(challenger2);
        registry.submitChallenge{value: BOND}(bountyId, _evidence("e2"));

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
        registry.submitChallenge{value: BOND}(bountyId, _evidence("e1"));

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
        registry.submitChallenge{value: BOND}(bountyId, _evidence("e1"));

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
