// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../BobbyTrackRecord.sol";

/// @title BobbyTrackRecord Test Suite
/// @notice Full coverage: commit-reveal, auth, pause, invariants, edge cases
/// @dev Run: forge test -vvv
contract BobbyTrackRecordTest is Test {

    // Mirror events for expectEmit
    event TradeCommitted(uint256 indexed commitId, string symbol, BobbyTrackRecord.Agent indexed agent, uint8 conviction, uint256 entryPrice, bytes32 indexed debateHash);
    event TradeResolved(uint256 indexed tradeId, string symbol, BobbyTrackRecord.Agent indexed agent, BobbyTrackRecord.Result result, int256 pnlBps, uint8 conviction, bytes32 indexed debateHash);
    event BobbyUpdated(address indexed oldBobby, address indexed newBobby);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    BobbyTrackRecord public record;

    address owner = address(this);
    address bobby = address(0xB0B);
    address attacker = address(0xDEAD);

    bytes32 constant DEBATE_1 = keccak256("thread-btc-long-2026-03-17");
    bytes32 constant DEBATE_2 = keccak256("thread-eth-short-2026-03-17");
    bytes32 constant DEBATE_3 = keccak256("thread-okb-long-2026-03-18");

    function setUp() public {
        record = new BobbyTrackRecord(bobby);
    }

    // ============================================================
    //  CONSTRUCTOR
    // ============================================================

    function test_constructor() public view {
        assertEq(record.owner(), owner);
        assertEq(record.bobby(), bobby);
        assertFalse(record.paused());
    }

    function test_constructor_rejectsZeroAddress() public {
        vm.expectRevert("Invalid bobby address");
        new BobbyTrackRecord(address(0));
    }

    // ============================================================
    //  PHASE 1: COMMIT
    // ============================================================

    function test_commit_basic() public {
        vm.prank(bobby);
        record.commitTrade(
            DEBATE_1,
            "BTC",
            BobbyTrackRecord.Agent.ALPHA,
            8,              // conviction
            9500000000000,  // entryPrice $95000
            10000000000000, // targetPrice $100000
            9000000000000   // stopPrice $90000
        );

        assertEq(record.totalCommitments(), 1);
        assertTrue(record.commitIndex(DEBATE_1) != 0);
    }

    function test_commit_ownerCanAlsoCommit() public {
        // owner is also authorized via onlyBobby modifier
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.CIO,
            7, 9500000000000, 10000000000000, 9000000000000
        );
        assertEq(record.totalCommitments(), 1);
    }

    function test_commit_rejectsUnauthorized() public {
        vm.prank(attacker);
        vm.expectRevert("Not authorized");
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 9500000000000, 10000000000000, 9000000000000
        );
    }

    function test_commit_rejectsDuplicate() public {
        vm.startPrank(bobby);
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 9500000000000, 10000000000000, 9000000000000
        );
        vm.expectRevert("Already committed");
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 9500000000000, 10000000000000, 9000000000000
        );
        vm.stopPrank();
    }

    function test_commit_rejectsZeroHash() public {
        vm.prank(bobby);
        vm.expectRevert("Invalid debate hash");
        record.commitTrade(
            bytes32(0), "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 9500000000000, 10000000000000, 9000000000000
        );
    }

    function test_commit_rejectsConvictionOver10() public {
        vm.prank(bobby);
        vm.expectRevert("Conviction must be 0-10");
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            11, 9500000000000, 10000000000000, 9000000000000
        );
    }

    function test_commit_rejectsZeroEntryPrice() public {
        vm.prank(bobby);
        vm.expectRevert("Entry price required");
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 0, 10000000000000, 9000000000000
        );
    }

    function test_commit_rejectsNoTargetAndNoStop() public {
        vm.prank(bobby);
        vm.expectRevert("Target or stop required");
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 9500000000000, 0, 0
        );
    }

    function test_commit_acceptsTargetOnlyNoStop() public {
        vm.prank(bobby);
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 9500000000000, 10000000000000, 0
        );
        assertEq(record.totalCommitments(), 1);
    }

    function test_commit_acceptsStopOnlyNoTarget() public {
        vm.prank(bobby);
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 9500000000000, 0, 9000000000000
        );
        assertEq(record.totalCommitments(), 1);
    }

    function test_commit_whenPaused() public {
        record.pause();
        vm.prank(bobby);
        vm.expectRevert("Contract is paused");
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 9500000000000, 10000000000000, 9000000000000
        );
    }

    function test_commit_emitsEvent() public {
        vm.prank(bobby);
        vm.expectEmit(true, true, true, true);
        emit TradeCommitted(
            0, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, DEBATE_1
        );
        record.commitTrade(
            DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA,
            8, 9500000000000, 10000000000000, 9000000000000
        );
    }

    // ============================================================
    //  PHASE 2: RESOLVE
    // ============================================================

    function _commitAndWarp(bytes32 hash, string memory symbol, BobbyTrackRecord.Agent agent) internal {
        vm.prank(bobby);
        record.commitTrade(hash, symbol, agent, 8, 9500000000000, 10000000000000, 9000000000000);
        // Warp past minCommitAge (1 hour)
        vm.warp(block.timestamp + 1 hours + 1);
    }

    function test_resolve_win() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);

        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);

        assertEq(record.totalTrades(), 1);
        assertEq(record.wins(), 1);
        assertEq(record.losses(), 0);
        assertEq(record.totalPnlBps(), 550);
        assertEq(record.getWinRate(), 10000); // 100%
    }

    function test_resolve_loss() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.REDTEAM);

        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, -300, BobbyTrackRecord.Result.LOSS, 9200000000000);

        assertEq(record.totalTrades(), 1);
        assertEq(record.wins(), 0);
        assertEq(record.losses(), 1);
        assertEq(record.totalPnlBps(), -300);
        assertEq(record.getWinRate(), 0);
    }

    function test_resolve_breakEven() public {
        _commitAndWarp(DEBATE_1, "ETH", BobbyTrackRecord.Agent.CIO);

        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 0, BobbyTrackRecord.Result.BREAK_EVEN, 9500000000000);

        assertEq(record.totalTrades(), 1);
        assertEq(record.wins(), 0);
        assertEq(record.losses(), 0);
    }

    function test_resolve_expired() public {
        _commitAndWarp(DEBATE_1, "SOL", BobbyTrackRecord.Agent.ALPHA);

        /// @dev Gemini v2: EXPIRED must have zero PnL
        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 0, BobbyTrackRecord.Result.EXPIRED, 9450000000000);

        assertEq(record.totalTrades(), 1);
        assertEq(record.totalPnlBps(), 0);
    }

    function test_resolve_expiredRejectsNonZeroPnl() public {
        _commitAndWarp(DEBATE_1, "SOL", BobbyTrackRecord.Agent.ALPHA);

        vm.prank(bobby);
        vm.expectRevert("EXPIRED must have zero PnL");
        record.resolveTrade(DEBATE_1, -50, BobbyTrackRecord.Result.EXPIRED, 9450000000000);
    }

    function test_resolve_rejectsTooSoon() public {
        vm.prank(bobby);
        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, 10000000000000, 9000000000000);
        // Don't warp — try to resolve immediately
        vm.prank(bobby);
        vm.expectRevert("Too soon to resolve");
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);
    }

    function test_resolve_rejectsNoCommitment() public {
        vm.prank(bobby);
        vm.expectRevert("No commitment found");
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);
    }

    function test_resolve_rejectsDoubleResolve() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);

        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);

        vm.prank(bobby);
        vm.expectRevert("Already resolved");
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);
    }

    function test_resolve_rejectsPendingResult() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);

        vm.prank(bobby);
        vm.expectRevert("Cannot resolve as pending");
        record.resolveTrade(DEBATE_1, 0, BobbyTrackRecord.Result.PENDING, 9500000000000);
    }

    function test_resolve_rejectsZeroExitPrice() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);

        vm.prank(bobby);
        vm.expectRevert("Exit price required");
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 0);
    }

    // ── Coherence Invariants (Codex Audit) ──

    function test_resolve_winRequiresPositivePnl() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);

        vm.prank(bobby);
        vm.expectRevert("WIN must have positive PnL");
        record.resolveTrade(DEBATE_1, -100, BobbyTrackRecord.Result.WIN, 10000000000000);
    }

    function test_resolve_lossRequiresNegativePnl() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);

        vm.prank(bobby);
        vm.expectRevert("LOSS must have negative PnL");
        record.resolveTrade(DEBATE_1, 100, BobbyTrackRecord.Result.LOSS, 9200000000000);
    }

    function test_resolve_breakEvenRequiresZeroPnl() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.CIO);

        vm.prank(bobby);
        vm.expectRevert("BREAK_EVEN must have zero PnL");
        record.resolveTrade(DEBATE_1, 50, BobbyTrackRecord.Result.BREAK_EVEN, 9500000000000);
    }

    function test_resolve_unauthorized() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);

        vm.prank(attacker);
        vm.expectRevert("Not authorized");
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);
    }

    function test_resolve_whenPaused() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);
        record.pause();

        vm.prank(bobby);
        vm.expectRevert("Contract is paused");
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);
    }

    function test_resolve_emitsEvent() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);

        vm.prank(bobby);
        vm.expectEmit(true, true, true, true);
        emit TradeResolved(
            0, "BTC", BobbyTrackRecord.Agent.ALPHA,
            BobbyTrackRecord.Result.WIN, 550, 8, DEBATE_1
        );
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);
    }

    // ============================================================
    //  AGENT STATS
    // ============================================================

    function test_agentStats_multipleAgents() public {
        // Alpha wins
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);
        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);

        // Red Team loses
        _commitAndWarp(DEBATE_2, "ETH", BobbyTrackRecord.Agent.REDTEAM);
        vm.prank(bobby);
        record.resolveTrade(DEBATE_2, -200, BobbyTrackRecord.Result.LOSS, 300000000000);

        // CIO wins
        _commitAndWarp(DEBATE_3, "OKB", BobbyTrackRecord.Agent.CIO);
        vm.prank(bobby);
        record.resolveTrade(DEBATE_3, 100, BobbyTrackRecord.Result.WIN, 9800000000);

        // Check Alpha
        (uint256 w, uint256 l, uint256 t, uint256 wr) = record.getAgentStats(BobbyTrackRecord.Agent.ALPHA);
        assertEq(w, 1);
        assertEq(l, 0);
        assertEq(t, 1);
        assertEq(wr, 10000); // 100%

        // Check Red Team
        (w, l, t, wr) = record.getAgentStats(BobbyTrackRecord.Agent.REDTEAM);
        assertEq(w, 0);
        assertEq(l, 1);
        assertEq(t, 1);
        assertEq(wr, 0);

        // Global
        assertEq(record.wins(), 2);
        assertEq(record.losses(), 1);
        assertEq(record.totalTrades(), 3);
        assertEq(record.getWinRate(), 6666); // 66.66%
        assertEq(record.totalPnlBps(), 450); // 550 - 200 + 100
    }

    // ============================================================
    //  VIEW FUNCTIONS
    // ============================================================

    function test_getRecentTrades_empty() public view {
        BobbyTrackRecord.Trade[] memory recent = record.getRecentTrades(10);
        assertEq(recent.length, 0);
    }

    function test_getRecentTrades_capped() public {
        // Create 3 trades
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);
        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 100, BobbyTrackRecord.Result.WIN, 9600000000000);

        _commitAndWarp(DEBATE_2, "ETH", BobbyTrackRecord.Agent.CIO);
        vm.prank(bobby);
        record.resolveTrade(DEBATE_2, 200, BobbyTrackRecord.Result.WIN, 350000000000);

        // Request more than exist
        BobbyTrackRecord.Trade[] memory recent = record.getRecentTrades(100);
        assertEq(recent.length, 2);
    }

    function test_getRecentCommitments() public {
        vm.prank(bobby);
        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, 10000000000000, 9000000000000);
        vm.prank(bobby);
        record.commitTrade(DEBATE_2, "ETH", BobbyTrackRecord.Agent.CIO, 6, 350000000000, 400000000000, 320000000000);

        BobbyTrackRecord.Commitment[] memory recent = record.getRecentCommitments(5);
        assertEq(recent.length, 2);
        assertEq(recent[0].conviction, 8);
        assertEq(recent[1].conviction, 6);
    }

    function test_pendingCount() public {
        vm.prank(bobby);
        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, 10000000000000, 9000000000000);
        vm.prank(bobby);
        record.commitTrade(DEBATE_2, "ETH", BobbyTrackRecord.Agent.CIO, 6, 350000000000, 400000000000, 320000000000);

        assertEq(record.pendingCount(), 2);

        // Resolve one
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 100, BobbyTrackRecord.Result.WIN, 9600000000000);

        assertEq(record.pendingCount(), 1);
    }

    function test_winRate_empty() public view {
        assertEq(record.getWinRate(), 0);
    }

    // ============================================================
    //  ADMIN: PAUSE / UNPAUSE
    // ============================================================

    function test_pause_onlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        record.pause();
    }

    function test_pause_unpause() public {
        record.pause();
        assertTrue(record.paused());

        record.unpause();
        assertFalse(record.paused());
    }

    function test_pause_emitsEvents() public {
        vm.expectEmit(true, false, false, false);
        emit Paused(owner);
        record.pause();

        vm.expectEmit(true, false, false, false);
        emit Unpaused(owner);
        record.unpause();
    }

    // ============================================================
    //  ADMIN: SET BOBBY
    // ============================================================

    function test_setBobby() public {
        address newBobby = address(0xB0B2);
        record.setBobby(newBobby);
        assertEq(record.bobby(), newBobby);
    }

    function test_setBobby_rejectsZero() public {
        vm.expectRevert("Invalid address");
        record.setBobby(address(0));
    }

    function test_setBobby_onlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        record.setBobby(address(0xB0B2));
    }

    function test_setBobby_emitsEvent() public {
        address newBobby = address(0xB0B2);
        vm.expectEmit(true, true, false, false);
        emit BobbyUpdated(bobby, newBobby);
        record.setBobby(newBobby);
    }

    // ============================================================
    //  ADMIN: OWNABLE 2-STEP
    // ============================================================

    function test_transferOwnership_twoStep() public {
        address newOwner = address(0x1234);

        // Step 1: initiate
        record.transferOwnership(newOwner);
        assertEq(record.owner(), owner); // Still old owner
        assertEq(record.pendingOwner(), newOwner);

        // Step 2: accept
        vm.prank(newOwner);
        record.acceptOwnership();
        assertEq(record.owner(), newOwner);
        assertEq(record.pendingOwner(), address(0));
    }

    function test_transferOwnership_rejectsZero() public {
        vm.expectRevert("Invalid address");
        record.transferOwnership(address(0));
    }

    function test_acceptOwnership_rejectsNonPending() public {
        record.transferOwnership(address(0x1234));

        vm.prank(attacker);
        vm.expectRevert("Not pending owner");
        record.acceptOwnership();
    }

    function test_transferOwnership_emitsEvents() public {
        address newOwner = address(0x1234);

        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferStarted(owner, newOwner);
        record.transferOwnership(newOwner);

        vm.prank(newOwner);
        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferred(owner, newOwner);
        record.acceptOwnership();
    }

    // ============================================================
    //  ADMIN: MIN COMMIT AGE
    // ============================================================

    function test_setMinCommitAge() public {
        record.setMinCommitAge(2 hours);
        assertEq(record.minCommitAge(), 2 hours);
    }

    function test_setMinCommitAge_onlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        record.setMinCommitAge(10 minutes);
    }

    function test_setMinCommitAge_rejectsBelowFloor() public {
        vm.expectRevert("Below minimum floor");
        record.setMinCommitAge(5 minutes);
    }

    /// @dev Codex v2 [P1]: changing minCommitAge should NOT retroactively
    /// weaken commits that were already made with the old (longer) age
    function test_setMinCommitAge_notRetroactive() public {
        // Set 2 hour min commit age
        record.setMinCommitAge(2 hours);

        // Bobby commits with 2h age — minResolveAt = now + 2h
        vm.prank(bobby);
        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, 10000000000000, 9000000000000);

        // Owner lowers minCommitAge to 10 min
        record.setMinCommitAge(10 minutes);

        // Warp only 30min — new global allows it, but the COMMITMENT was locked at 2h
        vm.warp(block.timestamp + 30 minutes);
        vm.prank(bobby);
        vm.expectRevert("Too soon to resolve");
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);

        // Warp to full 2h — now the per-commit minResolveAt is satisfied
        vm.warp(block.timestamp + 1 hours + 31 minutes);
        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);
        assertEq(record.wins(), 1);
    }

    function test_setMinCommitAge_affectsResolve() public {
        record.setMinCommitAge(2 hours);

        vm.prank(bobby);
        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, 10000000000000, 9000000000000);

        // Warp 1h — should fail (need 2h)
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(bobby);
        vm.expectRevert("Too soon to resolve");
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);

        // Warp another hour — should succeed
        vm.warp(block.timestamp + 1 hours);
        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);
        assertEq(record.wins(), 1);
    }

    // ============================================================
    //  EXPIRE COMMITMENTS (Gemini v2 Q5)
    // ============================================================

    function test_expireCommitment_afterTTL() public {
        vm.prank(bobby);
        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, 10000000000000, 9000000000000);
        assertEq(record.pendingCount(), 1);

        // Warp past MAX_COMMITMENT_TTL (30 days)
        vm.warp(block.timestamp + 31 days);

        // Anyone can expire a stale commitment (permissionless)
        vm.prank(attacker);
        record.expireCommitment(DEBATE_1);

        assertEq(record.pendingCount(), 0);
        /// @dev Codex v3 [P2]: expiry creates a Trade with unified accounting
        assertEq(record.totalTrades(), 1);
        assertEq(record.wins(), 0);
        assertEq(record.losses(), 0);
        assertEq(record.totalPnlBps(), 0);
    }

    /// @dev Codex v3 [P1]: resolveTrade must revert after MAX_COMMITMENT_TTL
    function test_resolve_rejectsAfterTTL() public {
        vm.prank(bobby);
        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, 10000000000000, 9000000000000);

        // Warp past 30 days
        vm.warp(block.timestamp + 31 days);

        vm.prank(bobby);
        vm.expectRevert("Commitment expired, use expireCommitment()");
        record.resolveTrade(DEBATE_1, 550, BobbyTrackRecord.Result.WIN, 10000000000000);
    }

    /// @dev Codex v3 [P2]: expireCommitment increments agentTrades
    function test_expireCommitment_countsInAgentTrades() public {
        vm.prank(bobby);
        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, 10000000000000, 9000000000000);

        vm.warp(block.timestamp + 31 days);
        record.expireCommitment(DEBATE_1);

        (uint256 w, uint256 l, uint256 t, ) = record.getAgentStats(BobbyTrackRecord.Agent.ALPHA);
        assertEq(w, 0);
        assertEq(l, 0);
        assertEq(t, 1); // Expired counts in total trades for agent
    }

    function test_expireCommitment_tooEarly() public {
        vm.prank(bobby);
        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 8, 9500000000000, 10000000000000, 9000000000000);

        // Try to expire after 15 days — should fail (need 30)
        vm.warp(block.timestamp + 15 days);
        vm.expectRevert("Not yet expired");
        record.expireCommitment(DEBATE_1);
    }

    function test_expireCommitment_alreadyResolved() public {
        _commitAndWarp(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA);
        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 100, BobbyTrackRecord.Result.WIN, 9600000000000);

        vm.warp(block.timestamp + 31 days);
        vm.expectRevert("Already resolved");
        record.expireCommitment(DEBATE_1);
    }

    function test_expireCommitment_noCommit() public {
        vm.expectRevert("No commitment found");
        record.expireCommitment(DEBATE_1);
    }

    // ============================================================
    //  E2E: Full flow commit → resolve → stats
    // ============================================================

    function test_e2e_fullFlow() public {
        // Bobby commits 3 predictions
        vm.startPrank(bobby);

        record.commitTrade(DEBATE_1, "BTC", BobbyTrackRecord.Agent.ALPHA, 9, 9500000000000, 10500000000000, 9000000000000);
        record.commitTrade(DEBATE_2, "ETH", BobbyTrackRecord.Agent.REDTEAM, 4, 350000000000, 380000000000, 330000000000);
        record.commitTrade(DEBATE_3, "OKB", BobbyTrackRecord.Agent.CIO, 7, 9500000000, 11000000000, 8500000000);

        vm.stopPrank();

        assertEq(record.totalCommitments(), 3);
        assertEq(record.pendingCount(), 3);
        assertEq(record.totalTrades(), 0);

        // Time passes...
        vm.warp(block.timestamp + 2 hours);

        // Resolve: BTC was a WIN (+10.5%)
        vm.prank(bobby);
        record.resolveTrade(DEBATE_1, 1050, BobbyTrackRecord.Result.WIN, 10500000000000);

        // Resolve: ETH was a LOSS (-5.7%)
        vm.prank(bobby);
        record.resolveTrade(DEBATE_2, -570, BobbyTrackRecord.Result.LOSS, 330000000000);

        // OKB still pending
        assertEq(record.pendingCount(), 1);
        assertEq(record.totalTrades(), 2);
        assertEq(record.wins(), 1);
        assertEq(record.losses(), 1);
        assertEq(record.getWinRate(), 5000); // 50%
        assertEq(record.totalPnlBps(), 480); // 1050 - 570

        // Resolve: OKB was a WIN (+15.8%)
        vm.prank(bobby);
        record.resolveTrade(DEBATE_3, 1580, BobbyTrackRecord.Result.WIN, 11000000000);

        assertEq(record.totalTrades(), 3);
        assertEq(record.wins(), 2);
        assertEq(record.getWinRate(), 6666); // 66.66%
        assertEq(record.totalPnlBps(), 2060); // 1050 - 570 + 1580
        assertEq(record.pendingCount(), 0);

        // Verify recent trades
        BobbyTrackRecord.Trade[] memory recent = record.getRecentTrades(10);
        assertEq(recent.length, 3);
        assertEq(keccak256(bytes(recent[2].symbol)), keccak256(bytes("OKB")));
    }
}
