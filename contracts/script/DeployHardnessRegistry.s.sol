// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/HardnessRegistry.sol";

/// @title Deploy HardnessRegistry to X Layer
/// @dev Run:
///   INITIAL_RESOLVERS=0xabc...,0xdef... \
///   RESOLVER_THRESHOLD=2 \
///   forge script script/DeployHardnessRegistry.s.sol \
///     --rpc-url https://rpc.xlayer.tech --broadcast
contract DeployHardnessRegistry is Script {
    function run() external {
        address[] memory initialResolvers = vm.envAddress("INITIAL_RESOLVERS", ",");
        uint256 thresholdRaw = vm.envUint("RESOLVER_THRESHOLD");

        require(initialResolvers.length > 0, "INITIAL_RESOLVERS not set");
        require(thresholdRaw > 0 && thresholdRaw <= type(uint8).max, "Invalid threshold");

        vm.startBroadcast();

        HardnessRegistry registry = new HardnessRegistry(initialResolvers, uint8(thresholdRaw));

        console.log("=== HARDNESS REGISTRY ===");
        console.log("Contract:", address(registry));
        console.log("Owner:", registry.owner());
        console.log("Resolver count:", registry.resolverCount());
        console.log("Resolver threshold:", registry.resolverThreshold());
        console.log("Min bounty:", registry.minBounty());
        console.log("Prediction TTL:", registry.predictionTTL());
        console.log("Signal TTL:", registry.defaultSignalTTL());
        console.log("Chain ID:", block.chainid);

        vm.stopBroadcast();
    }
}
