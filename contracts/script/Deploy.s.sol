// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../BobbyTrackRecord.sol";

/// @title Deploy BobbyTrackRecord to X Layer
/// @dev Run: forge script script/Deploy.s.sol --rpc-url xlayer --broadcast --verify
contract DeployBobbyTrackRecord is Script {

    function run() external {
        // Bobby's recorder wallet (hot wallet on the droplet)
        address bobby = vm.envAddress("BOBBY_ADDRESS");

        vm.startBroadcast();

        BobbyTrackRecord record = new BobbyTrackRecord(bobby);

        console.log("========================================");
        console.log("BobbyTrackRecord deployed!");
        console.log("Contract:", address(record));
        console.log("Owner:", msg.sender);
        console.log("Bobby:", bobby);
        console.log("Chain: X Layer (196)");
        console.log("Explorer: https://www.oklink.com/xlayer/address/", address(record));
        console.log("========================================");

        vm.stopBroadcast();
    }
}
