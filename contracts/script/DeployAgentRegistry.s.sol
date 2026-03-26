// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/BobbyAgentRegistry.sol";

/// @title Deploy Bobby Agent Registry + mint 3 agent identities
/// @dev Run: BOBBY_ADDRESS=0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea forge script script/DeployAgentRegistry.s.sol --rpc-url https://rpc.xlayer.tech --broadcast
contract DeployAgentRegistry is Script {
    function run() external {
        address bobby = vm.envAddress("BOBBY_ADDRESS");

        vm.startBroadcast();

        BobbyAgentRegistry registry = new BobbyAgentRegistry();

        // Mint 3 agent identity NFTs
        // Token #1: Bobby CIO
        registry.registerAgent(
            "Bobby CIO",
            BobbyAgentRegistry.AgentRole.CIO,
            keccak256("sovereign-cio-capital-preservation"),
            bobby
        );

        // Token #2: Alpha Hunter
        registry.registerAgent(
            "Alpha Hunter",
            BobbyAgentRegistry.AgentRole.ALPHA_HUNTER,
            keccak256("momentum-specialist-aggressive"),
            bobby
        );

        // Token #3: Red Team
        registry.registerAgent(
            "Red Team",
            BobbyAgentRegistry.AgentRole.RED_TEAM,
            keccak256("risk-veteran-adversarial"),
            bobby
        );

        console.log("=== BOBBY AGENT REGISTRY ===");
        console.log("Contract:", address(registry));
        console.log("Token #1: Bobby CIO");
        console.log("Token #2: Alpha Hunter");
        console.log("Token #3: Red Team");
        console.log("Owner:", bobby);

        vm.stopBroadcast();
    }
}
