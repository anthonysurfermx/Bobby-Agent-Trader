// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/BobbyAdversarialBounties.sol";

contract BobbyAdversarialBountiesTest is Test {
    BobbyAdversarialBounties public bounties;

    address owner = address(this);
    address resolver = address(0xBB);
    address poster = address(0xA1);
    address challenger1 = address(0xC1);
    address challenger2 = address(0xC2);
    address attacker = address(0xDEAD);

    string constant THREAD_ID = "4f8bc2d1-a9f3-4e6b-9812-3a4c5d6e7f80";

    function setUp() public {
        bounties = new BobbyAdversarialBounties(resolver);
        vm.deal(poster, 10 ether);
        vm.deal(challenger1, 1 ether);
        vm.deal(challenger2, 1 ether);
        vm.deal(attacker, 5 ether);
    }

    receive() external payable {}

    // ============================================================
    //  postBounty
    // ============================================================

    function test_postBounty_success() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.ADVERSARIAL_QUALITY,
            0
        );

        assertEq(id, 1);
        BobbyAdversarialBounties.Bounty memory b = bounties.getBounty(id);
        assertEq(b.poster, poster);
        assertEq(b.reward, 0.1 ether);
        assertEq(uint8(b.status), uint8(BobbyAdversarialBounties.BountyStatus.OPEN));
        assertEq(b.claimWindowSecs, 7 days);
        assertEq(b.challengeCount, 0);
    }

    function test_postBounty_revertsBelowMinimum() public {
        vm.prank(poster);
        vm.expectRevert("Bounty below minimum");
        bounties.postBounty{value: 0.0005 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DATA_INTEGRITY,
            0
        );
    }

    function test_postBounty_revertsEmptyThread() public {
        vm.prank(poster);
        vm.expectRevert("Empty thread");
        bounties.postBounty{value: 0.01 ether}(
            "",
            BobbyAdversarialBounties.Dimension.NOVELTY,
            0
        );
    }

    function test_postBounty_revertsInvalidWindow() public {
        vm.prank(poster);
        vm.expectRevert("Window out of range");
        bounties.postBounty{value: 0.01 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.RISK_MANAGEMENT,
            30 minutes
        );
    }

    function test_postBounty_revertsWhenPaused() public {
        bounties.pause();
        vm.prank(poster);
        vm.expectRevert("Paused");
        bounties.postBounty{value: 0.01 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DECISION_LOGIC,
            0
        );
    }

    // ============================================================
    //  submitChallenge
    // ============================================================

    function test_submitChallenge_success() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.ADVERSARIAL_QUALITY,
            0
        );

        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence-1"));

        BobbyAdversarialBounties.Bounty memory b = bounties.getBounty(id);
        assertEq(uint8(b.status), uint8(BobbyAdversarialBounties.BountyStatus.CHALLENGED));
        assertEq(b.challengeCount, 1);
        assertEq(bounties.challengeCount(id), 1);
    }

    function test_submitChallenge_multipleChallengers() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.CALIBRATION_ALIGNMENT,
            0
        );

        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence-1"));
        vm.prank(challenger2);
        bounties.submitChallenge(id, keccak256("evidence-2"));

        assertEq(bounties.challengeCount(id), 2);
    }

    function test_submitChallenge_posterCannotChallengeSelf() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.NOVELTY,
            0
        );

        vm.prank(poster);
        vm.expectRevert("Poster cannot challenge own bounty");
        bounties.submitChallenge(id, keccak256("evidence"));
    }

    function test_submitChallenge_revertsAfterWindowExpires() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DATA_INTEGRITY,
            1 hours
        );

        vm.warp(block.timestamp + 2 hours);

        vm.prank(challenger1);
        vm.expectRevert("Claim window expired");
        bounties.submitChallenge(id, keccak256("late-evidence"));
    }

    function test_submitChallenge_revertsNoEvidence() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DECISION_LOGIC,
            0
        );

        vm.prank(challenger1);
        vm.expectRevert("Evidence required");
        bounties.submitChallenge(id, bytes32(0));
    }

    // ============================================================
    //  resolveBounty
    // ============================================================

    function test_resolveBounty_success() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.ADVERSARIAL_QUALITY,
            0
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence-1"));

        vm.prank(resolver);
        bounties.resolveBounty(id, challenger1);

        BobbyAdversarialBounties.Bounty memory b = bounties.getBounty(id);
        assertEq(uint8(b.status), uint8(BobbyAdversarialBounties.BountyStatus.RESOLVED));
        assertEq(b.winner, challenger1);
        assertEq(bounties.pendingWithdrawals(challenger1), 0.1 ether);
    }

    function test_resolveBounty_onlyResolver() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.RISK_MANAGEMENT,
            0
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));

        vm.prank(attacker);
        vm.expectRevert("Not resolver");
        bounties.resolveBounty(id, attacker);
    }

    function test_resolveBounty_rejectsNonChallenger() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.NOVELTY,
            0
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));

        vm.prank(resolver);
        vm.expectRevert("Winner did not challenge");
        bounties.resolveBounty(id, challenger2);
    }

    function test_resolveBounty_rejectsWhenNoChallenges() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DATA_INTEGRITY,
            0
        );

        vm.prank(resolver);
        vm.expectRevert("No challenges to resolve");
        bounties.resolveBounty(id, challenger1);
    }

    // ============================================================
    //  withdraw & withdrawBounty
    // ============================================================

    function test_withdraw_pullPaymentWorks() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.5 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.ADVERSARIAL_QUALITY,
            0
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));
        vm.prank(resolver);
        bounties.resolveBounty(id, challenger1);

        uint256 balBefore = challenger1.balance;
        vm.prank(challenger1);
        bounties.withdraw();
        assertEq(challenger1.balance - balBefore, 0.5 ether);
        assertEq(bounties.pendingWithdrawals(challenger1), 0);
    }

    function test_withdraw_revertsWhenNothing() public {
        vm.prank(attacker);
        vm.expectRevert("Nothing to withdraw");
        bounties.withdraw();
    }

    function test_withdrawBounty_afterWindow() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DECISION_LOGIC,
            1 hours
        );

        vm.warp(block.timestamp + 2 hours);

        vm.prank(poster);
        bounties.withdrawBounty(id);
        assertEq(bounties.pendingWithdrawals(poster), 0.1 ether);

        BobbyAdversarialBounties.Bounty memory b = bounties.getBounty(id);
        assertEq(uint8(b.status), uint8(BobbyAdversarialBounties.BountyStatus.WITHDRAWN));
    }

    function test_withdrawBounty_beforeWindowReverts() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DATA_INTEGRITY,
            1 hours
        );

        vm.prank(poster);
        vm.expectRevert("Window still active");
        bounties.withdrawBounty(id);
    }

    function test_withdrawBounty_onlyPoster() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.NOVELTY,
            1 hours
        );
        vm.warp(block.timestamp + 2 hours);

        vm.prank(attacker);
        vm.expectRevert("Not poster");
        bounties.withdrawBounty(id);
    }

    function test_withdrawBounty_cannotReclaimAfterResolved() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.ADVERSARIAL_QUALITY,
            1 hours
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));
        vm.prank(resolver);
        bounties.resolveBounty(id, challenger1);

        vm.warp(block.timestamp + 5 days);
        vm.prank(poster);
        vm.expectRevert("Already finalized");
        bounties.withdrawBounty(id);
    }

    // ============================================================
    //  Security Round 1 fix: challenge grace period
    // ============================================================

    function test_withdrawBounty_challengedBountyGetsGracePeriod() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.ADVERSARIAL_QUALITY,
            1 hours
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));

        // Window expired (1hr + 1sec) but grace period is active
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(poster);
        vm.expectRevert("Window still active");
        bounties.withdrawBounty(id);

        // Past grace period → withdrawal allowed
        vm.warp(block.timestamp + 3 days);
        vm.prank(poster);
        bounties.withdrawBounty(id);
        assertEq(bounties.pendingWithdrawals(poster), 0.1 ether);
    }

    function test_setMinBounty_rejectsBelowAbsoluteFloor() public {
        vm.expectRevert("Below absolute floor");
        bounties.setMinBounty(0.00001 ether);
    }

    function test_setMinBounty_acceptsAboveFloor() public {
        bounties.setMinBounty(0.005 ether);
        assertEq(bounties.minBounty(), 0.005 ether);
    }

    // ============================================================
    //  Direct transfer rejection
    // ============================================================

    function test_directTransferReverts() public {
        vm.prank(poster);
        (bool ok, ) = address(bounties).call{value: 0.1 ether}("");
        assertEq(ok, false);
    }

    // ============================================================
    //  Ownership
    // ============================================================

    function test_twoStepOwnership() public {
        bounties.transferOwnership(address(0xF00D));
        assertEq(bounties.pendingOwner(), address(0xF00D));
        assertEq(bounties.owner(), owner);

        vm.prank(address(0xF00D));
        bounties.acceptOwnership();
        assertEq(bounties.owner(), address(0xF00D));
        assertEq(bounties.pendingOwner(), address(0));
    }

    // ============================================================
    //  Security Round 2 fix: pause must not trap user funds
    // ============================================================

    function test_withdrawBounty_worksEvenWhenPaused() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DECISION_LOGIC,
            1 hours
        );
        vm.warp(block.timestamp + 2 hours);

        bounties.pause();

        vm.prank(poster);
        bounties.withdrawBounty(id);
        assertEq(bounties.pendingWithdrawals(poster), 0.1 ether);

        vm.prank(poster);
        bounties.withdraw();
    }

    function test_withdraw_winnerCanPullEvenWhenPaused() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.2 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.ADVERSARIAL_QUALITY,
            0
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));
        vm.prank(resolver);
        bounties.resolveBounty(id, challenger1);

        bounties.pause();

        uint256 balBefore = challenger1.balance;
        vm.prank(challenger1);
        bounties.withdraw();
        assertEq(challenger1.balance - balBefore, 0.2 ether);
    }

    // ============================================================
    //  Security Round 3 (Codex) fixes
    // ============================================================

    // R3 P1a: resolveBounty must respect _effectiveExpiry
    function test_resolveBounty_revertsAfterEffectiveExpiry() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.ADVERSARIAL_QUALITY,
            1 hours
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));

        // window=1h + grace=3d → expiry at createdAt + 3d + 1h
        vm.warp(block.timestamp + 1 hours + 3 days + 1);

        vm.prank(resolver);
        vm.expectRevert("Resolution window closed");
        bounties.resolveBounty(id, challenger1);
    }

    // R3 P1a: resolveBounty still works inside the window
    function test_resolveBounty_worksInsideEffectiveExpiry() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.ADVERSARIAL_QUALITY,
            1 hours
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));

        // Past window, inside grace period
        vm.warp(block.timestamp + 1 hours + 1 days);

        vm.prank(resolver);
        bounties.resolveBounty(id, challenger1);
        assertEq(bounties.pendingWithdrawals(challenger1), 0.1 ether);
    }

    // R3 P1b: one address cannot submit two challenges to the same bounty
    function test_submitChallenge_rejectsDuplicateAddress() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.NOVELTY,
            0
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("ev1"));

        vm.prank(challenger1);
        vm.expectRevert("Already challenged");
        bounties.submitChallenge(id, keccak256("ev2"));
    }

    // R3 P1b: hasChallenged mapping is publicly readable
    function test_hasChallenged_trueAfterSubmit() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DATA_INTEGRITY,
            0
        );
        assertFalse(bounties.hasChallenged(id, challenger1));

        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));

        assertTrue(bounties.hasChallenged(id, challenger1));
        assertFalse(bounties.hasChallenged(id, challenger2));
    }

    // R3 P1b: a second distinct challenger still works (not broken by unicity)
    function test_submitChallenge_differentAddressesStillWork() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.CALIBRATION_ALIGNMENT,
            0
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("ev1"));
        vm.prank(challenger2);
        bounties.submitChallenge(id, keccak256("ev2"));

        assertEq(bounties.challengeCount(id), 2);
        assertTrue(bounties.hasChallenged(id, challenger1));
        assertTrue(bounties.hasChallenged(id, challenger2));
    }

    // R3 P2: owner changing challengeGracePeriod does NOT affect existing bounties
    function test_graceSnapshot_existingBountiesUnaffectedByGraceChange() public {
        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.RISK_MANAGEMENT,
            1 hours
        );
        vm.prank(challenger1);
        bounties.submitChallenge(id, keccak256("evidence"));

        // Owner tries to rug by setting grace to 0 after deposit
        bounties.setChallengeGracePeriod(0);

        // Existing bounty still uses original 3-day snapshot
        vm.warp(block.timestamp + 1 hours + 1 days);
        vm.prank(poster);
        vm.expectRevert("Window still active");
        bounties.withdrawBounty(id);

        // Also: resolver can still resolve inside original grace
        vm.prank(resolver);
        bounties.resolveBounty(id, challenger1);
        assertEq(bounties.pendingWithdrawals(challenger1), 0.1 ether);
    }

    // R3 P2: new bounties created after the change use the new grace
    function test_graceSnapshot_newBountyUsesUpdatedGrace() public {
        bounties.setChallengeGracePeriod(1 days);

        vm.prank(poster);
        uint256 id = bounties.postBounty{value: 0.1 ether}(
            THREAD_ID,
            BobbyAdversarialBounties.Dimension.DECISION_LOGIC,
            1 hours
        );
        BobbyAdversarialBounties.Bounty memory b = bounties.getBounty(id);
        assertEq(b.gracePeriodSnapshot, 1 days);
    }
}
