// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/BobbyAgentEconomy.sol";

/// @title Deploy Bobby Agent Economy to X Layer
/// @dev Run: BOBBY_ADDRESS=0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea forge script script/DeployAgentEconomy.s.sol --rpc-url https://rpc.xlayer.tech --broadcast
contract DeployAgentEconomy is Script {
    function run() external {
        address bobby = vm.envAddress("BOBBY_ADDRESS");

        // Agent addresses — deterministic from Bobby's wallet for demo
        // In production, each agent would have its own key
        address alphaHunter = address(uint160(uint256(keccak256(abi.encodePacked(bobby, "ALPHA_HUNTER")))));
        address redTeam = address(uint160(uint256(keccak256(abi.encodePacked(bobby, "RED_TEAM")))));
        address cio = bobby; // CIO is Bobby himself

        vm.startBroadcast();

        BobbyAgentEconomy economy = new BobbyAgentEconomy(alphaHunter, redTeam, cio);

        console.log("=== BOBBY AGENT ECONOMY ===");
        console.log("Contract:", address(economy));
        console.log("Alpha Hunter:", alphaHunter);
        console.log("Red Team:", redTeam);
        console.log("CIO (Bobby):", cio);
        console.log("Debate fee per agent: 0.0001 OKB");
        console.log("MCP call fee: 0.001 OKB");
        console.log("Signal access fee: 0.0005 OKB");

        vm.stopBroadcast();
    }
}
