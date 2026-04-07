// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/BobbyAgentEconomyV2.sol";

contract BobbyAgentEconomyV2Test is Test {
    event MCPPayment(address indexed payer, bytes32 indexed challengeId, string toolName, uint256 amount, uint256 timestamp);
    event DebateFee(bytes32 indexed debateHash, address indexed payer, address indexed recipient, uint256 amount, uint256 timestamp);
    event FeesUpdated(uint256 mcpCallFee, uint256 debateFeePerAgent);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event Withdrawal(address indexed to, uint256 amount);

    BobbyAgentEconomyV2 public economy;

    address owner = address(this);
    address alpha = address(0xA1);
    address red = address(0xB2);
    address cioAddr = address(0xC3);
    address agent = address(0xD4);
    address attacker = address(0xDEAD);

    function setUp() public {
        economy = new BobbyAgentEconomyV2(alpha, red, cioAddr);
        // Fund test addresses
        vm.deal(agent, 10 ether);
        vm.deal(cioAddr, 10 ether);
        vm.deal(attacker, 10 ether);
    }

    // Allow this test contract to receive ETH (needed for withdraw test since owner = address(this))
    receive() external payable {}

    // ================================================================
    // Test 1: payMCPCall succeeds with valid challengeId and exact fee
    // ================================================================
    function test_payMCPCall_success() public {
        bytes32 challengeId = keccak256("challenge-1");

        vm.prank(agent);
        vm.expectEmit(true, true, false, true);
        emit MCPPayment(agent, challengeId, "bobby_analyze", 0.001 ether, block.timestamp);
        economy.payMCPCall{value: 0.001 ether}(challengeId, "bobby_analyze");

        assertTrue(economy.challengeConsumed(challengeId));
        assertEq(economy.totalMCPCalls(), 1);
        assertEq(economy.totalVolume(), 0.001 ether);
    }

    // ================================================================
    // Test 2: payMCPCall prevents replay — same challengeId reverts
    // ================================================================
    function test_payMCPCall_replayReverts() public {
        bytes32 challengeId = keccak256("challenge-replay");

        vm.prank(agent);
        economy.payMCPCall{value: 0.001 ether}(challengeId, "bobby_analyze");

        vm.prank(agent);
        vm.expectRevert("Challenge already consumed");
        economy.payMCPCall{value: 0.001 ether}(challengeId, "bobby_analyze");
    }

    // ================================================================
    // Test 3: payMCPCall refunds excess payment
    // ================================================================
    function test_payMCPCall_refundsExcess() public {
        bytes32 challengeId = keccak256("challenge-refund");
        uint256 balBefore = agent.balance;

        vm.prank(agent);
        economy.payMCPCall{value: 0.005 ether}(challengeId, "bobby_analyze");

        // Agent should get 0.004 ether refunded (sent 0.005, fee is 0.001)
        uint256 balAfter = agent.balance;
        assertEq(balBefore - balAfter, 0.001 ether);
        // Contract keeps only mcpCallFee
        assertEq(address(economy).balance, 0.001 ether);
    }

    // ================================================================
    // Test 4: payMCPCall reverts with insufficient fee
    // ================================================================
    function test_payMCPCall_insufficientFee() public {
        bytes32 challengeId = keccak256("challenge-cheap");

        vm.prank(agent);
        vm.expectRevert("Insufficient MCP fee");
        economy.payMCPCall{value: 0.0001 ether}(challengeId, "bobby_analyze");
    }

    // ================================================================
    // Test 5: payMCPCall reverts with zero challengeId
    // ================================================================
    function test_payMCPCall_zeroChallengeId() public {
        vm.prank(agent);
        vm.expectRevert("Invalid challengeId");
        economy.payMCPCall{value: 0.001 ether}(bytes32(0), "bobby_analyze");
    }

    // ================================================================
    // Test 6: payDebateFee restricted to cio/owner only
    // ================================================================
    function test_payDebateFee_restrictedAccess() public {
        bytes32 debateHash = keccak256("debate-1");

        // Attacker cannot call
        vm.prank(attacker);
        vm.expectRevert("Not authorized");
        economy.payDebateFee{value: 0.0002 ether}(debateHash);

        // CIO can call
        vm.prank(cioAddr);
        economy.payDebateFee{value: 0.0002 ether}(debateHash);
        assertEq(economy.totalDebates(), 1);

        // Owner can call
        bytes32 debateHash2 = keccak256("debate-2");
        economy.payDebateFee{value: 0.0002 ether}(debateHash2);
        assertEq(economy.totalDebates(), 2);
    }

    // ================================================================
    // Test 7: pause blocks payMCPCall and payDebateFee
    // ================================================================
    function test_pause_blocksFunctions() public {
        economy.pause();
        assertTrue(economy.paused());

        bytes32 challengeId = keccak256("challenge-paused");
        vm.prank(agent);
        vm.expectRevert("Paused");
        economy.payMCPCall{value: 0.001 ether}(challengeId, "bobby_analyze");

        bytes32 debateHash = keccak256("debate-paused");
        vm.prank(cioAddr);
        vm.expectRevert("Paused");
        economy.payDebateFee{value: 0.0002 ether}(debateHash);

        // Unpause and verify it works again
        economy.unpause();
        vm.prank(agent);
        economy.payMCPCall{value: 0.001 ether}(challengeId, "bobby_analyze");
        assertEq(economy.totalMCPCalls(), 1);
    }

    // ================================================================
    // Test 8: constructor rejects zero addresses
    // ================================================================
    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert("Invalid alpha");
        new BobbyAgentEconomyV2(address(0), red, cioAddr);

        vm.expectRevert("Invalid red");
        new BobbyAgentEconomyV2(alpha, address(0), cioAddr);

        vm.expectRevert("Invalid cio");
        new BobbyAgentEconomyV2(alpha, red, address(0));
    }

    // ================================================================
    // Test 9: updateFees works and emits event, non-owner reverts
    // ================================================================
    function test_updateFees() public {
        vm.expectEmit(false, false, false, true);
        emit FeesUpdated(0.002 ether, 0.0005 ether);
        economy.updateFees(0.002 ether, 0.0005 ether);

        assertEq(economy.mcpCallFee(), 0.002 ether);
        assertEq(economy.debateFeePerAgent(), 0.0005 ether);

        // Non-owner reverts
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        economy.updateFees(0, 0);
    }

    // ================================================================
    // Test 10: withdraw sends balance to owner, getEconomyStats compat
    // ================================================================
    function test_withdraw_and_compatStats() public {
        // Generate some revenue
        bytes32 c1 = keccak256("c1");
        bytes32 c2 = keccak256("c2");
        vm.prank(agent);
        economy.payMCPCall{value: 0.001 ether}(c1, "bobby_analyze");
        vm.prank(agent);
        economy.payMCPCall{value: 0.001 ether}(c2, "bobby_debate");

        // Check getEconomyStats compat
        (uint256 debates, uint256 mcpCalls, uint256 signals, uint256 volume, uint256 payments) = economy.getEconomyStats();
        assertEq(debates, 0);
        assertEq(mcpCalls, 2);
        assertEq(signals, 0); // Always 0 in V2
        assertEq(volume, 0.002 ether);
        assertEq(payments, 2); // 2 MCP calls + 0 debates

        // Withdraw
        uint256 ownerBalBefore = owner.balance;
        economy.withdraw();
        assertEq(owner.balance - ownerBalBefore, 0.002 ether);
        assertEq(address(economy).balance, 0);

        // Non-owner cannot withdraw
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        economy.withdraw();
    }
}
