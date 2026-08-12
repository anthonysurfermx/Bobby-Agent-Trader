// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BobbyTrackRecord} from "../src/BobbyTrackRecord.sol";
import {BobbyIntentEscrow} from "../src/BobbyIntentEscrow.sol";
import {BobbyAgentEconomyV2} from "../src/BobbyAgentEconomyV2.sol";
import {BobbyAgentRegistry} from "../src/BobbyAgentRegistry.sol";
import {BobbyConvictionOracle} from "../src/BobbyConvictionOracle.sol";

/// @notice Regression tests for the Base r9 security findings. Each test was
/// born as a PoC that REPRODUCED the vulnerability; after the r10 fixes they
/// assert the exploit path now reverts. If any of these ever passes the
/// exploit again, a fix has been regressed.
contract SecurityAuditPoC is Test {
    address internal constant BOBBY = address(0xB0BB1);
    address internal constant OWNER = address(0x1000);
    address internal constant CIO = address(0x2000);
    address internal constant ARBITER = address(0x3000);
    address internal constant KEEPER = address(0x4000);
    address internal constant RESOLVER = address(0x5000);
    address internal constant SAFE = address(0x5AFE);

    // ── H-01: resolveTrade(EXPIRED) laundered losses before the TTL ──

    function test_H01_resolveTradeRejectsExpired() public {
        BobbyTrackRecord record = new BobbyTrackRecord(BOBBY);
        bytes32 debateHash = keccak256("premature-expiry");

        vm.prank(BOBBY);
        record.commitTrade(debateHash, "BTC", BobbyTrackRecord.Agent.CIO, 8, 100e8, 110e8, 95e8);

        vm.warp(block.timestamp + record.minCommitAge());
        assertLt(block.timestamp, record.MAX_COMMITMENT_TTL());

        // The r9 exploit: declare a losing trade EXPIRED with zero PnL right
        // after minCommitAge, erasing it from the win-rate denominator.
        vm.prank(BOBBY);
        vm.expectRevert(bytes("Use expireCommitment()"));
        record.resolveTrade(debateHash, 0, BobbyTrackRecord.Result.EXPIRED, 100e8);

        // The commitment is still pending and can only expire via the
        // permissionless path after the full TTL.
        assertEq(record.pendingCount(), 1);
        vm.expectRevert(bytes("Not yet expired"));
        record.expireCommitment(debateHash);

        vm.warp(block.timestamp + record.MAX_COMMITMENT_TTL() + 1);
        record.expireCommitment(debateHash);
        assertEq(record.pendingCount(), 0);
        assertEq(record.totalTrades(), 1);
    }

    // ── M-01: ownership transfer could collapse owner/keeper separation ──

    function test_M01_transferOwnershipRejectsKeeper() public {
        BobbyIntentEscrow escrow =
            new BobbyIntentEscrow(block.chainid, 10_000e18, OWNER, CIO, ARBITER, KEEPER, RESOLVER);

        vm.prank(OWNER);
        vm.expectRevert(BobbyIntentEscrow.DuplicateRole.selector);
        escrow.transferOwnership(KEEPER);

        assertEq(escrow.owner(), OWNER);
        assertEq(escrow.keeper(), KEEPER);
    }

    function test_M01_acceptOwnershipRejectsKeeperRotatedInBetween() public {
        BobbyIntentEscrow escrow =
            new BobbyIntentEscrow(block.chainid, 10_000e18, OWNER, CIO, ARBITER, KEEPER, RESOLVER);
        address next = address(0x6000);

        vm.prank(OWNER);
        escrow.transferOwnership(next);

        // Rotating the keeper into the pending owner must fail...
        vm.prank(OWNER);
        vm.expectRevert(BobbyIntentEscrow.DuplicateRole.selector);
        escrow.rotateRole("keeper", next);

        // ...so acceptance can never land on the keeper. Belt-and-suspenders:
        // even if it somehow were the keeper, acceptOwnership re-checks.
        vm.prank(next);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), next);
        assertTrue(escrow.owner() != escrow.keeper());
    }

    // ── H-02: EconomyV2 / AgentRegistry now support the D-4 Safe handoff ──

    function test_H02_economyV2TwoStepOwnershipHandoff() public {
        vm.prank(OWNER);
        BobbyAgentEconomyV2 economy =
            new BobbyAgentEconomyV2(address(0xA1), address(0xA2), CIO, 1e12, 1e11);

        vm.prank(OWNER);
        economy.transferOwnership(SAFE);
        assertEq(economy.owner(), OWNER); // two-step: nothing moved yet

        vm.prank(SAFE);
        economy.acceptOwnership();
        assertEq(economy.owner(), SAFE);
        assertEq(economy.pendingOwner(), address(0));

        // old owner lost control, new owner has it
        vm.prank(OWNER);
        vm.expectRevert(bytes("Not owner"));
        economy.pause();
        vm.prank(SAFE);
        economy.pause();
    }

    function test_H02_agentRegistryTwoStepOwnershipHandoff() public {
        vm.prank(OWNER);
        BobbyAgentRegistry registry = new BobbyAgentRegistry();

        vm.prank(OWNER);
        registry.transferOwnership(SAFE);
        vm.prank(SAFE);
        registry.acceptOwnership();
        assertEq(registry.owner(), SAFE);

        vm.prank(OWNER);
        vm.expectRevert(bytes("Not owner"));
        registry.registerAgent("CIO", BobbyAgentRegistry.AgentRole.CIO, bytes32(0), SAFE);
    }

    function test_H02_acceptOwnershipOnlyPendingOwner() public {
        vm.prank(OWNER);
        BobbyAgentEconomyV2 economy =
            new BobbyAgentEconomyV2(address(0xA1), address(0xA2), CIO, 1e12, 1e11);

        vm.prank(OWNER);
        economy.transferOwnership(SAFE);

        vm.prank(KEEPER);
        vm.expectRevert(bytes("Not pending owner"));
        economy.acceptOwnership();
    }

    // ── L-01: ConvictionOracle TTL bounds ──

    function test_L01_publishSignalRejectsOversizedTTL() public {
        vm.prank(BOBBY);
        BobbyConvictionOracle oracle = new BobbyConvictionOracle(BOBBY);

        BobbyConvictionOracle.SignalInput memory input = BobbyConvictionOracle.SignalInput({
            symbol: "BTC",
            direction: BobbyConvictionOracle.Direction.LONG,
            conviction: 8,
            agent: BobbyConvictionOracle.Agent.CIO,
            entryPrice: 100e8,
            targetPrice: 110e8,
            stopPrice: 95e8,
            debateHash: keccak256("ttl"),
            ttl: uint256(type(uint64).max) // would truncate expiry into the past
        });

        vm.prank(BOBBY);
        vm.expectRevert(bytes("TTL out of range"));
        oracle.publishSignal(input);

        input.ttl = 1; // below MIN_SIGNAL_TTL
        vm.prank(BOBBY);
        vm.expectRevert(bytes("TTL out of range"));
        oracle.publishSignal(input);

        input.ttl = 4 hours; // sane value still works
        vm.prank(BOBBY);
        oracle.publishSignal(input);
    }

    function test_L01_setDefaultTTLBounded() public {
        BobbyConvictionOracle oracle = new BobbyConvictionOracle(BOBBY);
        // owner is the test contract (deployer)
        vm.expectRevert(bytes("TTL out of range"));
        oracle.setDefaultTTL(0);
        vm.expectRevert(bytes("TTL out of range"));
        oracle.setDefaultTTL(365 days);
        oracle.setDefaultTTL(12 hours);
        assertEq(oracle.defaultTTL(), 12 hours);
    }

    // ── L-03: updateFees can no longer zero out the economy ──

    function test_L03_updateFeesRejectsZero() public {
        vm.prank(OWNER);
        BobbyAgentEconomyV2 economy =
            new BobbyAgentEconomyV2(address(0xA1), address(0xA2), CIO, 1e12, 1e11);

        vm.startPrank(OWNER);
        vm.expectRevert(bytes("Zero fee"));
        economy.updateFees(0, 1e11);
        vm.expectRevert(bytes("Zero fee"));
        economy.updateFees(1e12, 0);
        economy.updateFees(2e12, 2e11);
        vm.stopPrank();
        assertEq(economy.mcpCallFee(), 2e12);
    }
}
