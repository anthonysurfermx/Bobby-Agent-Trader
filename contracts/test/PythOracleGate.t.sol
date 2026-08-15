// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PythOracleGate} from "../script/PythOracleGate.sol";

contract PythGateHarness {
    function canonicalPyths(uint256 chainId) external pure returns (address[] memory) {
        return PythOracleGate.canonicalPyths(chainId);
    }

    function assertCanonical(uint256 chainId, address[] memory pyths) external view {
        PythOracleGate.assertCanonical(chainId, pyths);
    }
}

contract PythOracleGateTest is Test {
    address internal constant BASE_CURRENT = 0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a;
    address internal constant BASE_UPGRADED = 0xbC16aee60f64864882BC6C4E428e148Fc0E272F5;
    address internal constant SEPOLIA_CURRENT = 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729;
    address internal constant SEPOLIA_UPGRADED = 0x5f52e4DBEA21f5b23523B6e20d50c29ae0a4EB83;

    PythGateHarness internal gate;

    function setUp() public {
        gate = new PythGateHarness();
    }

    function test_mainnetUsesUpgradedWithCurrentFallback() public view {
        address[] memory pyths = gate.canonicalPyths(8453);
        assertEq(pyths.length, 2);
        assertEq(pyths[0], BASE_UPGRADED);
        assertEq(pyths[1], BASE_CURRENT);
    }

    function test_sepoliaMirrorsMainnetUpgradePosture() public view {
        address[] memory pyths = gate.canonicalPyths(84532);
        assertEq(pyths.length, 2);
        assertEq(pyths[0], SEPOLIA_UPGRADED);
        assertEq(pyths[1], SEPOLIA_CURRENT);
    }

    function test_assertCanonicalAcceptsExactCodeBearingSet() public {
        address[] memory pyths = gate.canonicalPyths(84532);
        vm.etch(pyths[0], hex"00");
        vm.etch(pyths[1], hex"00");
        gate.assertCanonical(84532, pyths);
    }

    function test_assertCanonicalRejectsWrongOrder() public {
        address[] memory pyths = gate.canonicalPyths(84532);
        (pyths[0], pyths[1]) = (pyths[1], pyths[0]);
        vm.expectRevert("PythOracleGate: pyth address off canonical set");
        gate.assertCanonical(84532, pyths);
    }

    function test_assertCanonicalRejectsAddressWithoutCode() public {
        address[] memory pyths = gate.canonicalPyths(84532);
        vm.expectRevert("PythOracleGate: no code at canonical pyth");
        gate.assertCanonical(84532, pyths);
    }

    function test_unsupportedChainReverts() public {
        vm.expectRevert("PythOracleGate: unsupported chain");
        gate.canonicalPyths(1);
    }
}
