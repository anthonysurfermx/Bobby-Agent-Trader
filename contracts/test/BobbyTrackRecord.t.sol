// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BobbyTrackRecord} from "../src/BobbyTrackRecord.sol";

/// @dev First dedicated suite for the contract at the heart of the "proof" claim.
/// Pins the two Base r4/r5 audit guarantees:
///   1. outcomes are DERIVABLE from committed prices, never merely asserted;
///   2. pause gates new commitments but can never block (or launder) settlement.
contract BobbyTrackRecordTest is Test {
    BobbyTrackRecord internal record;
    address internal bobby = makeAddr("bobby");

    bytes32 internal constant HASH_1 = keccak256("debate-1");

    function setUp() public {
        record = new BobbyTrackRecord(bobby);
    }

    function _commitLong(bytes32 debateHash) internal {
        // target above entry -> long
        vm.prank(bobby);
        record.commitTrade(debateHash, "BTC", BobbyTrackRecord.Agent.CIO, 8, 100e8, 110e8, 95e8);
        vm.warp(block.timestamp + record.minCommitAge());
    }

    // ---- price binding (r4 HIGH) ----

    function test_resolve_winMatchingPrices() public {
        _commitLong(HASH_1);
        vm.prank(bobby);
        record.resolveTrade(HASH_1, 500, BobbyTrackRecord.Result.WIN, 105e8); // +5%
        assertEq(record.getWinRate(), 10000);
    }

    function test_resolve_revertsWinOnLosingExit() public {
        _commitLong(HASH_1);
        vm.prank(bobby);
        vm.expectRevert("Prices imply LOSS");
        record.resolveTrade(HASH_1, 500, BobbyTrackRecord.Result.WIN, 95e8); // exit below entry
    }

    function test_resolve_revertsPnlNotDerivable() public {
        _commitLong(HASH_1);
        vm.prank(bobby);
        // prices say +5% (500bps); reporting +800bps is beyond the 100bps fee band
        vm.expectRevert("PnL not derivable from prices");
        record.resolveTrade(HASH_1, 800, BobbyTrackRecord.Result.WIN, 105e8);
    }

    function test_resolve_shortDirectionInferredFromLevels() public {
        // target below entry -> short: exit below entry is a WIN
        vm.prank(bobby);
        record.commitTrade(keccak256("short-1"), "ETH", BobbyTrackRecord.Agent.ALPHA, 7, 100e8, 90e8, 105e8);
        vm.warp(block.timestamp + record.minCommitAge());
        vm.prank(bobby);
        record.resolveTrade(keccak256("short-1"), 500, BobbyTrackRecord.Result.WIN, 95e8);
        assertEq(record.getWinRate(), 10000);
    }

    // ---- pause asymmetry (r5 HIGH) ----

    function test_pauseBlocksNewCommits() public {
        record.pause();
        vm.prank(bobby);
        vm.expectRevert();
        record.commitTrade(HASH_1, "BTC", BobbyTrackRecord.Agent.CIO, 8, 100e8, 110e8, 95e8);
    }

    function test_resolveWorksWhilePaused() public {
        _commitLong(HASH_1);
        record.pause();
        vm.prank(bobby);
        record.resolveTrade(HASH_1, -500, BobbyTrackRecord.Result.LOSS, 95e8);
        // The loss was recorded — pause could not launder it into an expiry.
        (, uint256 lossCount,,) = record.getAgentStats(BobbyTrackRecord.Agent.CIO);
        assertEq(lossCount, 1);
    }

    // ---- honest denominators (r4/r5 MED) ----

    function test_winRateIgnoresExpired() public {
        _commitLong(HASH_1);
        vm.prank(bobby);
        record.resolveTrade(HASH_1, 500, BobbyTrackRecord.Result.WIN, 105e8);

        // Second commitment expires unresolved
        vm.prank(bobby);
        record.commitTrade(keccak256("expired-1"), "SOL", BobbyTrackRecord.Agent.CIO, 6, 100e8, 110e8, 95e8);
        vm.warp(block.timestamp + record.MAX_COMMITMENT_TTL() + 1);
        record.expireCommitment(keccak256("expired-1"));

        // 1 win / 1 decided — the expiry must not dilute to 50%
        assertEq(record.getWinRate(), 10000);
        assertEq(record.getDecidedCount(), 1);

        (uint256 wins,, uint256 total, uint256 winRate) = record.getAgentStats(BobbyTrackRecord.Agent.CIO);
        assertEq(wins, 1);
        assertEq(total, 2); // coverage: includes the expiry
        assertEq(winRate, 10000); // skill: decided only
    }
}
