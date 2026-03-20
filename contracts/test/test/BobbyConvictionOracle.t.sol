// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../BobbyConvictionOracle.sol";

contract BobbyConvictionOracleTest is Test {

    event SignalPublished(bytes32 indexed symbolHash, string symbol, BobbyConvictionOracle.Direction direction, uint8 conviction, BobbyConvictionOracle.Agent indexed agent, uint96 entryPrice, bytes32 indexed debateHash);

    BobbyConvictionOracle public oracle;

    address owner = address(this);
    address bobby = address(0xB0B);
    address attacker = address(0xDEAD);
    address protocol = address(0xCAFE);

    bytes32 constant HASH_1 = keccak256("btc-debate-001");
    bytes32 constant HASH_2 = keccak256("eth-debate-001");
    bytes32 constant HASH_3 = keccak256("btc-debate-002");

    function setUp() public {
        oracle = new BobbyConvictionOracle(bobby);
    }

    // Helper to build signal input
    function _sig(
        string memory sym, BobbyConvictionOracle.Direction dir, uint8 conv,
        BobbyConvictionOracle.Agent agent, uint96 entry, uint96 target,
        uint96 stop, bytes32 hash, uint256 ttl
    ) internal pure returns (BobbyConvictionOracle.SignalInput memory) {
        return BobbyConvictionOracle.SignalInput(sym, dir, conv, agent, entry, target, stop, hash, ttl);
    }

    // ── Constructor ──

    function test_constructor() public view {
        assertEq(oracle.owner(), owner);
        assertEq(oracle.bobby(), bobby);
        assertFalse(oracle.paused());
        assertEq(oracle.defaultTTL(), 24 hours);
        assertEq(oracle.signalCooldown(), 10 minutes);
    }

    function test_constructor_rejectsZero() public {
        vm.expectRevert("Invalid bobby");
        new BobbyConvictionOracle(address(0));
    }

    // ── Publish Signal ──

    function test_publish_basic() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));
        assertEq(oracle.symbolCount(), 1);
    }

    function test_publish_emitsEvent() public {
        bytes32 symHash = keccak256(bytes("BTC"));
        vm.prank(bobby);
        vm.expectEmit(true, true, true, true);
        emit SignalPublished(symHash, "BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, HASH_1);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));
    }

    function test_publish_unauthorized() public {
        vm.prank(attacker);
        vm.expectRevert("Not authorized");
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));
    }

    function test_publish_whenPaused() public {
        oracle.pause();
        vm.prank(bobby);
        vm.expectRevert("Paused");
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));
    }

    function test_publish_rejectsConvictionOver10() public {
        vm.prank(bobby);
        vm.expectRevert("Conviction 0-10");
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 11,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));
    }

    function test_publish_rejectsEmptySymbol() public {
        vm.prank(bobby);
        vm.expectRevert("Empty symbol");
        oracle.publishSignal(_sig("", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));
    }

    function test_publish_rejectsZeroEntry() public {
        vm.prank(bobby);
        vm.expectRevert("Entry price required");
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 0, 10500000000000, 9000000000000, HASH_1, 0));
    }

    function test_publish_updatesLatest() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));

        vm.warp(block.timestamp + 11 minutes);

        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.SHORT, 6,
            BobbyConvictionOracle.Agent.REDTEAM, 9500000000000, 8500000000000, 10000000000000, HASH_3, 0));

        (BobbyConvictionOracle.Direction dir, uint8 conv, , ) = oracle.getConviction("BTC");
        assertEq(uint8(dir), uint8(BobbyConvictionOracle.Direction.SHORT));
        assertEq(conv, 6);
        assertEq(oracle.symbolCount(), 1);
    }

    function test_publish_multipleSymbols() public {
        vm.startPrank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));
        oracle.publishSignal(_sig("ETH", BobbyConvictionOracle.Direction.SHORT, 5,
            BobbyConvictionOracle.Agent.REDTEAM, 350000000000, 300000000000, 380000000000, HASH_2, 0));
        vm.stopPrank();
        assertEq(oracle.symbolCount(), 2);
    }

    function test_publish_customTTL() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 9,
            BobbyConvictionOracle.Agent.CIO, 9500000000000, 10500000000000, 9000000000000, HASH_1, 1 hours));

        (, , , bool active) = oracle.getConviction("BTC");
        assertTrue(active);

        vm.warp(block.timestamp + 1 hours + 1);
        (, , , active) = oracle.getConviction("BTC");
        assertFalse(active);
    }

    // ── Cooldown (Gemini v2) ──

    function test_publish_cooldownEnforced() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));

        vm.prank(bobby);
        vm.expectRevert("Signal cooldown active");
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.SHORT, 6,
            BobbyConvictionOracle.Agent.REDTEAM, 9500000000000, 8500000000000, 10000000000000, HASH_3, 0));
    }

    function test_publish_cooldownAllowsAfterWait() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));

        vm.warp(block.timestamp + 11 minutes);

        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.SHORT, 6,
            BobbyConvictionOracle.Agent.REDTEAM, 9500000000000, 8500000000000, 10000000000000, HASH_3, 0));

        (BobbyConvictionOracle.Direction dir, , , ) = oracle.getConviction("BTC");
        assertEq(uint8(dir), uint8(BobbyConvictionOracle.Direction.SHORT));
    }

    function test_publish_cooldownDifferentSymbolsNoWait() public {
        vm.startPrank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));
        oracle.publishSignal(_sig("ETH", BobbyConvictionOracle.Direction.SHORT, 5,
            BobbyConvictionOracle.Agent.REDTEAM, 350000000000, 300000000000, 380000000000, HASH_2, 0));
        vm.stopPrank();
        assertEq(oracle.symbolCount(), 2);
    }

    // ── Read Functions — Defensive (Gemini v2) ──

    function test_getConviction_unknown() public view {
        (BobbyConvictionOracle.Direction dir, uint8 conv, uint96 price, bool active) = oracle.getConviction("DOGE");
        assertEq(uint8(dir), uint8(BobbyConvictionOracle.Direction.NEUTRAL));
        assertEq(conv, 0);
        assertEq(price, 0);
        assertFalse(active);
    }

    function test_getConviction_active() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 9,
            BobbyConvictionOracle.Agent.CIO, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));

        (BobbyConvictionOracle.Direction dir, uint8 conv, uint96 price, bool active) = oracle.getConviction("BTC");
        assertEq(uint8(dir), uint8(BobbyConvictionOracle.Direction.LONG));
        assertEq(conv, 9);
        assertEq(price, 9500000000000);
        assertTrue(active);
    }

    function test_getConviction_expired_returnsNeutral() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 9,
            BobbyConvictionOracle.Agent.CIO, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));

        vm.warp(block.timestamp + 25 hours);

        (BobbyConvictionOracle.Direction dir, uint8 conv, uint96 price, bool active) = oracle.getConviction("BTC");
        assertEq(uint8(dir), uint8(BobbyConvictionOracle.Direction.NEUTRAL));
        assertEq(conv, 0);
        assertEq(price, 0);
        assertFalse(active);
    }

    function test_getSignal_full() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("ETH", BobbyConvictionOracle.Direction.SHORT, 7,
            BobbyConvictionOracle.Agent.REDTEAM, 350000000000, 300000000000, 380000000000, HASH_2, 0));

        BobbyConvictionOracle.Signal memory sig = oracle.getSignal("ETH");
        assertEq(sig.conviction, 7);
        assertEq(sig.targetPrice, 300000000000);
        assertEq(sig.stopPrice, 380000000000);
        assertEq(sig.debateHash, HASH_2);
    }

    // ── Paginated getSignals (Gemini v2) ──

    function test_getSignals_paginated() public {
        vm.startPrank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));
        oracle.publishSignal(_sig("ETH", BobbyConvictionOracle.Direction.SHORT, 5,
            BobbyConvictionOracle.Agent.REDTEAM, 350000000000, 300000000000, 380000000000, HASH_2, 0));
        vm.stopPrank();

        (string[] memory syms, , uint8[] memory convs, bool[] memory actives) = oracle.getSignals(0, 1);
        assertEq(syms.length, 1);
        assertEq(convs[0], 8);
        assertTrue(actives[0]);

        (syms, , convs, ) = oracle.getSignals(1, 1);
        assertEq(syms.length, 1);
        assertEq(convs[0], 5);
    }

    function test_getSignals_outOfRange() public view {
        (string[] memory syms, , , ) = oracle.getSignals(100, 10);
        assertEq(syms.length, 0);
    }

    function test_getSignals_withExpired() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 8,
            BobbyConvictionOracle.Agent.ALPHA, 9500000000000, 10500000000000, 9000000000000, HASH_1, 1 hours));

        vm.warp(block.timestamp + 2 hours);

        (, , , bool[] memory actives) = oracle.getSignals(0, 10);
        assertEq(actives.length, 1);
        assertFalse(actives[0]);
    }

    // ── Protocol Integration ──

    function test_scenario_protocolReadsBeforeTrade() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("OKB", BobbyConvictionOracle.Direction.LONG, 9,
            BobbyConvictionOracle.Agent.CIO, 9500000000, 11000000000, 8500000000, HASH_1, 0));

        vm.prank(protocol);
        (BobbyConvictionOracle.Direction dir, uint8 conv, uint96 entry, bool active) = oracle.getConviction("OKB");
        assertTrue(active);
        assertTrue(conv >= 7);
        assertEq(uint8(dir), uint8(BobbyConvictionOracle.Direction.LONG));
        assertEq(entry, 9500000000);
    }

    function test_scenario_lazyProtocolSafeWithExpired() public {
        vm.prank(bobby);
        oracle.publishSignal(_sig("BTC", BobbyConvictionOracle.Direction.LONG, 9,
            BobbyConvictionOracle.Agent.CIO, 9500000000000, 10500000000000, 9000000000000, HASH_1, 0));

        vm.warp(block.timestamp + 25 hours);

        vm.prank(protocol);
        (BobbyConvictionOracle.Direction dir, , , ) = oracle.getConviction("BTC");
        assertEq(uint8(dir), uint8(BobbyConvictionOracle.Direction.NEUTRAL));
    }

    // ── Admin ──

    function test_setDefaultTTL() public {
        oracle.setDefaultTTL(12 hours);
        assertEq(oracle.defaultTTL(), 12 hours);
    }

    function test_setSignalCooldown() public {
        oracle.setSignalCooldown(5 minutes);
        assertEq(oracle.signalCooldown(), 5 minutes);
    }

    function test_admin_onlyOwner() public {
        vm.startPrank(attacker);
        vm.expectRevert("Not owner");
        oracle.setBobby(attacker);
        vm.expectRevert("Not owner");
        oracle.setDefaultTTL(0);
        vm.expectRevert("Not owner");
        oracle.setSignalCooldown(0);
        vm.expectRevert("Not owner");
        oracle.pause();
        vm.expectRevert("Not owner");
        oracle.transferOwnership(attacker);
        vm.stopPrank();
    }

    function test_ownable2Step() public {
        address newOwner = address(0x1234);
        oracle.transferOwnership(newOwner);
        assertEq(oracle.owner(), owner);
        vm.prank(newOwner);
        oracle.acceptOwnership();
        assertEq(oracle.owner(), newOwner);
    }
}
