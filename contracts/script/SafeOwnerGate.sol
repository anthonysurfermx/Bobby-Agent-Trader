// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";

interface ISafeMinimal {
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
    function getModulesPaginated(address start, uint256 pageSize)
        external
        view
        returns (address[] memory array, address next);
}

/// @title SafeOwnerGate — D-4 owner gate shared by DeployBase and VerifyBaseDeployment
///
/// @dev r10.1 review [P1]: `getThreshold()/getOwners()` alone prove nothing —
/// any contract can mimic those getters, and even a genuine Safe can carry
/// modules or a guard that bypass/deform the signature quorum
/// (execTransactionFromModule). This gate implements the reviewer-blessed
/// alternative: the Safe is created FIRST, audited externally, and its exact
/// on-chain identity is PINNED (proxy codehash + singleton address). The gate
/// then proves, against live state:
///
///   1. codehash(safe) == pinned proxy codehash   — byte-identical to the
///      audited artifact, an impostor with the same getters cannot match it;
///   2. storage slot 0 == pinned singleton, and the singleton has code — the
///      proxy delegates to the implementation that was audited. The runbook
///      step is to cross-check the pinned singleton against the official
///      safe-global/safe-deployments registry for chain 8453;
///   3. getThreshold() >= 2 and getOwners().length >= 3 — the D-4 policy;
///   4. zero enabled modules — no execTransactionFromModule path around the
///      quorum;
///   5. guard storage slot empty — vanilla execution semantics.
///
/// This is NOT a trust-free proof of "Safe authenticity"; it proves the owner
/// is byte-identical to a specific externally-audited Safe deployment with an
/// effective >= 2-of-3 policy and no extra execution paths.
library SafeOwnerGate {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @dev Safe's module linked-list sentinel (ModuleManager.SENTINEL_MODULES)
    address internal constant SENTINEL_MODULES = address(0x1);

    /// @dev GuardManager.GUARD_STORAGE_SLOT — computed, not transcribed
    bytes32 internal constant GUARD_STORAGE_SLOT = keccak256("guard_manager.guard.address");

    function validate(address safe, address deployer, bytes32 pinnedCodehash, address pinnedSingleton)
        internal
        view
    {
        require(safe != deployer, "SafeGate: owner must not be the deployer EOA (D-4)");
        require(pinnedCodehash != bytes32(0), "SafeGate: OWNER_SAFE_CODEHASH not pinned");
        require(pinnedSingleton != address(0), "SafeGate: OWNER_SAFE_SINGLETON not pinned");
        require(safe.code.length > 0, "SafeGate: no code at OWNER_SAFE_ADDRESS");
        require(safe.codehash == pinnedCodehash, "SafeGate: proxy codehash != pinned codehash");

        address singleton = address(uint160(uint256(vm.load(safe, bytes32(uint256(0))))));
        require(singleton == pinnedSingleton, "SafeGate: slot-0 singleton != pinned singleton");
        require(pinnedSingleton.code.length > 0, "SafeGate: pinned singleton has no code");

        require(ISafeMinimal(safe).getThreshold() >= 2, "SafeGate: threshold must be >= 2 (D-4)");
        require(ISafeMinimal(safe).getOwners().length >= 3, "SafeGate: must have >= 3 owners (D-4)");

        (address[] memory mods,) = ISafeMinimal(safe).getModulesPaginated(SENTINEL_MODULES, 10);
        require(mods.length == 0, "SafeGate: modules enabled - module txs bypass the quorum");

        require(
            uint256(vm.load(safe, GUARD_STORAGE_SLOT)) == 0,
            "SafeGate: guard set - must be vanilla or separately audited"
        );
    }
}
