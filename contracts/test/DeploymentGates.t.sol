// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SafeOwnerGate} from "../script/SafeOwnerGate.sol";
import {VerifyBaseDeployment} from "../script/VerifyBaseDeployment.s.sol";
import {BountyEconomicsGate} from "../script/BountyEconomicsGate.sol";
import {BobbyAdversarialBounties} from "../src/BobbyAdversarialBounties.sol";
import {HardnessRegistry} from "../src/HardnessRegistry.sol";

/// @dev Stands in for the audited Safe singleton — the gate only requires it
/// to have code and to match the pinned address.
contract MockSingleton {
    function ping() external pure returns (uint256) {
        return 1;
    }
}

/// @dev Faithful surface of the Safe bits the gate reads: slot 0 holds the
/// singleton (like a real SafeProxy), plus the three getters.
contract MockSafe {
    address internal singleton; // slot 0, mirrors SafeProxy layout
    uint256 internal threshold;
    address[] internal ownersList;
    address[] internal modulesList;

    constructor(address _singleton, uint256 _threshold, uint256 ownerCount) {
        singleton = _singleton;
        threshold = _threshold;
        for (uint256 i = 0; i < ownerCount; i++) {
            ownersList.push(address(uint160(0xAA00 + i)));
        }
    }

    function enableModule(address module) external {
        modulesList.push(module);
    }

    function getThreshold() external view returns (uint256) {
        return threshold;
    }

    function getOwners() external view returns (address[] memory) {
        return ownersList;
    }

    function getModulesPaginated(address, uint256) external view returns (address[] memory, address) {
        return (modulesList, address(0x1));
    }
}

/// @dev The r10.1 [P1] attacker: answers every getter with the right values
/// but is NOT the audited artifact — different bytecode, different codehash.
contract ImpostorSafe {
    address internal singleton; // even copies the slot-0 trick
    uint256 internal constant EXTRA = 42; // bytecode diverges from MockSafe

    constructor(address _singleton) {
        singleton = _singleton;
    }

    function getThreshold() external pure returns (uint256) {
        return 2;
    }

    function getOwners() external pure returns (address[] memory owners) {
        owners = new address[](3);
        owners[0] = address(0x1111);
        owners[1] = address(0x2222);
        owners[2] = address(0x3333);
    }

    function getModulesPaginated(address, uint256) external pure returns (address[] memory array, address) {
        return (array, address(0x1));
    }

    function unrelated() external pure returns (uint256) {
        return EXTRA;
    }
}

/// @dev SafeOwnerGate.validate is internal (inlined) — expectRevert needs an
/// external call frame, so the tests go through this caller.
contract GateCaller {
    function callGate(address safe, address deployer, bytes32 pinnedCodehash, address pinnedSingleton)
        external
        view
    {
        SafeOwnerGate.validate(safe, deployer, pinnedCodehash, pinnedSingleton);
    }
}

/// @dev Exposes the internal branches of the verifier for unit testing.
contract VerifyHarness is VerifyBaseDeployment {
    function checkOwner(address liveOwner, address livePending, address deployer, address expected) external {
        _checkOwner(liveOwner, livePending, deployer, expected, "t");
    }

    function resolveExpectedOwner(string memory json, address deployer) external view returns (address) {
        return _resolveExpectedOwner(json, deployer);
    }
}

/// @dev Codex r5 [P1]: plays the deployer EOA — creates both contracts, runs (or
///      skips) the SAME gate DeployBase runs, and hands ownership to the Safe.
contract DeployerEoa {
    struct Params { address resolver; uint96 absoluteMinBounty; uint96 minBounty; uint96 registrationStake; uint96 challengeBond; address treasury; address expectedOwner; }

    function deployPair(Params memory p, bool configure) external returns (address bountiesAddr, address registryAddr) {
        address[] memory resolvers = new address[](1);
        resolvers[0] = p.resolver;
        bountiesAddr = address(new BobbyAdversarialBounties(p.resolver, p.absoluteMinBounty, p.minBounty));
        registryAddr = address(new HardnessRegistry(resolvers, 1, p.absoluteMinBounty, p.registrationStake, p.minBounty));
        if (configure) BountyEconomicsGate.configure(bountiesAddr, registryAddr, p.treasury, p.challengeBond);
        BobbyAdversarialBounties(payable(bountiesAddr)).transferOwnership(p.expectedOwner);
        HardnessRegistry(payable(registryAddr)).transferOwnership(p.expectedOwner);
    }

    function assertConfigured(address bountiesAddr, address registryAddr, address treasury, uint96 bond) external view {
        BountyEconomicsGate.assertConfigured(bountiesAddr, registryAddr, treasury, bond, address(this));
    }
}

contract DeploymentGatesTest is Test {
    address internal constant DEPLOYER = address(0xDE9);
    address internal constant OTHER = address(0x07E4);
    bytes32 internal constant GUARD_SLOT = keccak256("guard_manager.guard.address");

    MockSingleton internal singleton;
    MockSafe internal safe;
    GateCaller internal gate;
    VerifyHarness internal verify;

    function setUp() public {
        singleton = new MockSingleton();
        safe = new MockSafe(address(singleton), 2, 3);
        gate = new GateCaller();
        verify = new VerifyHarness();
    }

    function _pin() internal view returns (bytes32) {
        return address(safe).codehash;
    }

    // ── SafeOwnerGate: the audited-artifact pin ──

    function test_gate_happyPathPasses() public view {
        gate.callGate(address(safe), DEPLOYER, _pin(), address(singleton));
    }

    function test_gate_rejectsImpostorWithRightGetters() public {
        ImpostorSafe impostor = new ImpostorSafe(address(singleton));
        // right threshold, right owner count, right slot-0 singleton — but not
        // the audited bytecode.
        vm.expectRevert(bytes("SafeGate: proxy codehash != pinned codehash"));
        gate.callGate(address(impostor), DEPLOYER, _pin(), address(singleton));
    }

    function test_gate_rejectsWrongSingleton() public {
        vm.store(address(safe), bytes32(uint256(0)), bytes32(uint256(uint160(address(0xDEAD)))));
        vm.expectRevert(bytes("SafeGate: slot-0 singleton != pinned singleton"));
        gate.callGate(address(safe), DEPLOYER, _pin(), address(singleton));
    }

    function test_gate_rejectsSingletonWithoutCode() public {
        MockSafe eoaSingleton = new MockSafe(address(0xBEEF), 2, 3);
        vm.expectRevert(bytes("SafeGate: pinned singleton has no code"));
        gate.callGate(address(eoaSingleton), DEPLOYER, address(eoaSingleton).codehash, address(0xBEEF));
    }

    function test_gate_rejectsThresholdOne() public {
        MockSafe weak = new MockSafe(address(singleton), 1, 3);
        vm.expectRevert(bytes("SafeGate: threshold must be >= 2 (D-4)"));
        gate.callGate(address(weak), DEPLOYER, address(weak).codehash, address(singleton));
    }

    function test_gate_rejectsTwoOwners() public {
        MockSafe weak = new MockSafe(address(singleton), 2, 2);
        vm.expectRevert(bytes("SafeGate: must have >= 3 owners (D-4)"));
        gate.callGate(address(weak), DEPLOYER, address(weak).codehash, address(singleton));
    }

    function test_gate_rejectsEnabledModule() public {
        safe.enableModule(address(0x1234));
        vm.expectRevert(bytes("SafeGate: modules enabled - module txs bypass the quorum"));
        gate.callGate(address(safe), DEPLOYER, _pin(), address(singleton));
    }

    function test_gate_rejectsGuard() public {
        vm.store(address(safe), GUARD_SLOT, bytes32(uint256(uint160(address(0x6A4D))))); // any nonzero
        vm.expectRevert(bytes("SafeGate: guard set - must be vanilla or separately audited"));
        gate.callGate(address(safe), DEPLOYER, _pin(), address(singleton));
    }

    function test_gate_rejectsUnpinnedIdentity() public {
        vm.expectRevert(bytes("SafeGate: OWNER_SAFE_CODEHASH not pinned"));
        gate.callGate(address(safe), DEPLOYER, bytes32(0), address(singleton));

        vm.expectRevert(bytes("SafeGate: OWNER_SAFE_SINGLETON not pinned"));
        gate.callGate(address(safe), DEPLOYER, _pin(), address(0));
    }

    function test_gate_rejectsDeployerAsOwner() public {
        vm.expectRevert(bytes("SafeGate: owner must not be the deployer EOA (D-4)"));
        gate.callGate(DEPLOYER, DEPLOYER, _pin(), address(singleton));
    }

    // ── VerifyBaseDeployment._checkOwner: chain-aware final-state gate ──

    function test_checkOwner_mainnetRejectsPendingHandoff() public {
        vm.chainId(8453);
        // owner still deployer, Safe only proposed — the state r10.1 [P1]
        // said must NOT pass on mainnet.
        vm.expectRevert();
        verify.checkOwner(DEPLOYER, address(safe), DEPLOYER, address(safe));
    }

    function test_checkOwner_mainnetRequiresClearedPending() public {
        vm.chainId(8453);
        // accepted, but a NEW pending proposal exists — still not a clean
        // final state.
        vm.expectRevert();
        verify.checkOwner(address(safe), OTHER, DEPLOYER, address(safe));
    }

    function test_checkOwner_mainnetAcceptedAndClearedPasses() public {
        vm.chainId(8453);
        verify.checkOwner(address(safe), address(0), DEPLOYER, address(safe));
    }

    function test_checkOwner_testnetToleratesPendingHandoff() public {
        vm.chainId(84532);
        verify.checkOwner(DEPLOYER, address(safe), DEPLOYER, address(safe));
    }

    function test_checkOwner_testnetRejectsForeignOwner() public {
        vm.chainId(84532);
        vm.expectRevert();
        verify.checkOwner(OTHER, address(0), DEPLOYER, address(safe));
    }

    // ── VerifyBaseDeployment._resolveExpectedOwner: manifest branches ──

    function test_resolveExpectedOwner_readsField() public {
        vm.chainId(8453);
        string memory json = '{"expectedOwner":"0x00000000000000000000000000000000000005Af"}';
        assertEq(verify.resolveExpectedOwner(json, DEPLOYER), address(0x5Af));
    }

    function test_resolveExpectedOwner_mainnetRejectsLegacyManifest() public {
        vm.chainId(8453);
        vm.expectRevert(bytes("VERIFY FAILED: mainnet manifest missing expectedOwner (redeploy with r10 DeployBase)"));
        verify.resolveExpectedOwner("{}", DEPLOYER);
    }

    function test_resolveExpectedOwner_testnetFallsBackToDeployer() public {
        vm.chainId(84532);
        assertEq(verify.resolveExpectedOwner("{}", DEPLOYER), DEPLOYER);
    }
    // ── Codex r5 [P1]: the treasury must follow the Safe, not stay with the deployer ──

    function _economicsConfig(address safeAddr) internal pure returns (DeployerEoa.Params memory c) {
        c.resolver = address(0xBEEF);
        c.absoluteMinBounty = 0.0000025 ether;
        c.minBounty = 0.000025 ether;
        c.registrationStake = 0.00025 ether;
        c.challengeBond = 0.000025 ether; // = MIN_BOUNTY_WEI, the recommended value
        c.treasury = safeAddr;
        c.expectedOwner = safeAddr;
    }

    /// The exact state Codex reproduced on 8bb2d2d: owner() is the Safe, treasury() is the deployer EOA.
    function test_treasury_withoutConfigureStaysWithDeployer() public {
        DeployerEoa deployerEoa = new DeployerEoa();
        (address b, address h) = deployerEoa.deployPair(_economicsConfig(address(safe)), false);
        vm.prank(address(safe)); BobbyAdversarialBounties(payable(b)).acceptOwnership();
        vm.prank(address(safe)); HardnessRegistry(payable(h)).acceptOwnership();
        assertEq(BobbyAdversarialBounties(payable(b)).owner(), address(safe));
        assertEq(BobbyAdversarialBounties(payable(b)).treasury(), address(deployerEoa), "reproduction: treasury stuck with the deployer");
        assertEq(HardnessRegistry(payable(h)).treasury(), address(deployerEoa));
    }

    /// With the r5 step the treasury and both bonds land BEFORE the handoff, and survive it.
    function test_treasury_configuredBeforeHandoffFollowsSafe() public {
        DeployerEoa deployerEoa = new DeployerEoa();
        DeployerEoa.Params memory c = _economicsConfig(address(safe));
        (address b, address h) = deployerEoa.deployPair(c, true);
        vm.prank(address(safe)); BobbyAdversarialBounties(payable(b)).acceptOwnership();
        vm.prank(address(safe)); HardnessRegistry(payable(h)).acceptOwnership();
        BobbyAdversarialBounties bo = BobbyAdversarialBounties(payable(b));
        HardnessRegistry hr = HardnessRegistry(payable(h));
        assertEq(bo.owner(), address(safe)); assertEq(hr.owner(), address(safe));
        assertEq(bo.treasury(), address(safe), "bounties treasury is the Safe");
        assertEq(hr.treasury(), address(safe), "registry treasury is the Safe");
        assertTrue(bo.treasury() != address(deployerEoa) && hr.treasury() != address(deployerEoa));
        assertEq(bo.challengeBond(), c.challengeBond); assertEq(hr.bountyChallengeBond(), c.challengeBond);
        deployerEoa.assertConfigured(b, h, address(safe), c.challengeBond); // the gate's own live proof
        // and the deployer, no longer owner, cannot move the treasury back
        vm.prank(address(deployerEoa)); vm.expectRevert("Not owner");
        bo.setTreasury(address(deployerEoa));
    }
}
