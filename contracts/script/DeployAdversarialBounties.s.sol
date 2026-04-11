// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/BobbyAdversarialBounties.sol";

/// @title Deploy Bobby Adversarial Bounties to X Layer
/// @dev Run:
///   RESOLVER_ADDRESS=0x... \
///   forge script script/DeployAdversarialBounties.s.sol \
///     --rpc-url https://rpc.xlayer.tech --broadcast --verify
contract DeployAdversarialBounties is Script {
    function run() external {
        address resolver = vm.envAddress("RESOLVER_ADDRESS");
        require(resolver != address(0), "RESOLVER_ADDRESS not set");

        vm.startBroadcast();

        BobbyAdversarialBounties bounties = new BobbyAdversarialBounties(resolver);

        console.log("=== BOBBY ADVERSARIAL BOUNTIES ===");
        console.log("Contract:", address(bounties));
        console.log("Owner (deployer):", msg.sender);
        console.log("Resolver:", resolver);
        console.log("Min bounty:", bounties.minBounty());
        console.log("Absolute floor:", bounties.ABSOLUTE_MIN_BOUNTY());
        console.log("Default claim window (secs):", bounties.defaultClaimWindow());
        console.log("Challenge grace period (secs):", bounties.challengeGracePeriod());
        console.log("Max challenges per bounty:", bounties.maxChallenges());
        console.log("Chain ID:", block.chainid);

        vm.stopBroadcast();
    }
}
