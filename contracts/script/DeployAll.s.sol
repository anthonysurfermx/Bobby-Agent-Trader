// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../BobbyTrackRecord.sol";
import "../BobbyConvictionOracle.sol";

/// @title Deploy Bobby's full on-chain infrastructure to X Layer
/// @dev Run: forge script script/DeployAll.s.sol --rpc-url xlayer --broadcast
contract DeployAll is Script {

    function run() external {
        address bobby = vm.envAddress("BOBBY_ADDRESS");

        vm.startBroadcast();

        // 1. Deploy Track Record (commit-reveal)
        BobbyTrackRecord trackRecord = new BobbyTrackRecord(bobby);
        console.log("BobbyTrackRecord:", address(trackRecord));

        // 2. Deploy Conviction Oracle
        BobbyConvictionOracle oracle = new BobbyConvictionOracle(bobby);
        console.log("BobbyConvictionOracle:", address(oracle));

        console.log("");
        console.log("=== BOBBY ON-CHAIN INFRASTRUCTURE ===");
        console.log("Chain: X Layer (196)");
        console.log("Bobby recorder:", bobby);
        console.log("Owner:", msg.sender);
        console.log("");
        console.log("Track Record:", address(trackRecord));
        console.log("  -> commitTrade() then resolveTrade()");
        console.log("  -> Audited by Gemini + Codex");
        console.log("");
        console.log("Conviction Oracle:", address(oracle));
        console.log("  -> Other protocols call getConviction('BTC')");
        console.log("  -> The world's first AI conviction feed");
        console.log("");
        console.log("Set in Vercel env:");
        console.log("  BOBBY_CONTRACT_ADDRESS=", address(trackRecord));
        console.log("  BOBBY_ORACLE_ADDRESS=", address(oracle));

        vm.stopBroadcast();
    }
}
