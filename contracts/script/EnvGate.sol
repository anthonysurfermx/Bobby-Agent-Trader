// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";

/// @title EnvGate — third round (2026-09-05), BP-03 reopen: `vm.envOr` returns
///        the DEFAULT whenever a variable is SET but does not parse (`3O`, `-5`,
///        `""`, `1e80`, `60.0`), so a typo'd operator value silently deployed the
///        audited default and every downstream check (gate, manifest, verifier)
///        agreed with it. These helpers read an env value ONLY through the strict
///        parsers: unset → default, set-but-malformed → revert.
library EnvGate {
    function uintOr(Vm vm, string memory name, uint256 dflt) internal view returns (uint256) {
        return vm.envExists(name) ? vm.envUint(name) : dflt;
    }

    function addressOr(Vm vm, string memory name, address dflt) internal view returns (address) {
        return vm.envExists(name) ? vm.envAddress(name) : dflt;
    }

    function bytes32Or(Vm vm, string memory name, bytes32 dflt) internal view returns (bytes32) {
        return vm.envExists(name) ? vm.envBytes32(name) : dflt;
    }

    /// @dev Mainnet reads reviewed values, never defaults: the variable must be present.
    function requireSet(Vm vm, string memory name) internal view {
        require(vm.envExists(name), string.concat("EnvGate: ", name, " must be set explicitly on mainnet"));
    }
}
