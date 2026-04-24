// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BobbyIntentEscrow.sol";

contract Mock1271Signer {
    bytes4 internal constant MAGIC = 0x1626ba7e;
    bool public shouldRevert;
    bool public wrongMagic;
    bool public oneShot;
    bool public consumed;
    BobbyIntentEscrow public reenterTarget;
    bytes public reenterCalldata;

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function setWrongMagic(bool value) external {
        wrongMagic = value;
    }

    function setOneShot(bool value) external {
        oneShot = value;
        consumed = false;
    }

    function setReenter(BobbyIntentEscrow target, bytes calldata data) external {
        reenterTarget = target;
        reenterCalldata = data;
    }

    function isValidSignature(bytes32, bytes memory) external returns (bytes4) {
        if (shouldRevert) revert("1271 revert");
        if (address(reenterTarget) != address(0)) {
            (bool ok,) = address(reenterTarget).call(reenterCalldata);
            ok;
        }
        if (oneShot) {
            if (consumed) return 0xffffffff;
            consumed = true;
        }
        if (wrongMagic) return 0xffffffff;
        return MAGIC;
    }
}

contract BobbyIntentEscrowHandler is Test {
    uint256 internal constant CIO_PK = 0xC10;
    uint256 internal constant ARBITER_PK = 0xA4817E;

    BobbyIntentEscrow public escrow;
    address public owner;
    address public cio;
    address public arbiter;
    address public keeper;
    address public resolver;

    bytes32[] public executedHashes;
    mapping(bytes32 => bool) public seenExecuted;
    mapping(bytes32 => bool) public seenResolved;
    mapping(bytes32 => bytes32) public resolvedHashSnapshot;
    mapping(bytes32 => int128) public resolvedPnlSnapshot;
    mapping(bytes32 => uint40) public resolvedAtSnapshot;
    mapping(uint256 => bool) public successfulNonce;

    constructor(BobbyIntentEscrow _escrow, address _owner, address _cio, address _arbiter, address _keeper, address _resolver) {
        escrow = _escrow;
        owner = _owner;
        cio = _cio;
        arbiter = _arbiter;
        keeper = _keeper;
        resolver = _resolver;
    }

    function executeValid(uint256 rawNonce, uint256 rawSize, uint16 rawSlippage, uint8 rawDirection, uint256 rawExpiry) external {
        if (executedHashes.length >= 64) return;
        uint256 nonce = bound(rawNonce, 1, 1_000_000);
        uint256 sizeUsd = bound(rawSize, 1, escrow.maxSizeUsd());
        uint16 slippage = uint16(bound(uint256(rawSlippage), 1, escrow.MAX_SLIPPAGE_BPS()));
        uint8 direction = uint8(bound(uint256(rawDirection), 0, 1));
        uint256 expiresAt = block.timestamp + bound(rawExpiry, 0, 30 days);

        BobbyIntentEscrow.TradeIntent memory intent = _intent(nonce, sizeUsd, slippage, direction, expiresAt, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);

        bytes memory cioSig = _sig(CIO_PK, _intentDigest(intent));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision));

        vm.prank(keeper);
        try escrow.executeIntent(intent, cioSig, decision, arbiterSig, keccak256(abi.encode("execution", nonce))) {
            if (!seenExecuted[intentHash]) {
                executedHashes.push(intentHash);
                seenExecuted[intentHash] = true;
            }
            successfulNonce[nonce] = true;
        } catch {}
    }

    function executeWithBadCioSig(uint256 rawNonce) external {
        uint256 nonce = bound(rawNonce, 1_000_001, 2_000_000);
        BobbyIntentEscrow.TradeIntent memory intent = _intent(nonce, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory badCioSig = _sig(0xBAD, _intentDigest(intent));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision));

        vm.prank(keeper);
        try escrow.executeIntent(intent, badCioSig, decision, arbiterSig, bytes32("bad")) {
            fail("bad CIO signature executed");
        } catch {}
    }

    function resolveAsResolver(uint256 rawIndex, int128 pnlBps, bytes32 resolveHash) external {
        if (executedHashes.length == 0) return;
        bytes32 intentHash = executedHashes[bound(rawIndex, 0, executedHashes.length - 1)];
        vm.prank(resolver);
        try escrow.resolveIntent(intentHash, pnlBps, resolveHash) {
            seenResolved[intentHash] = true;
            resolvedHashSnapshot[intentHash] = resolveHash;
            resolvedPnlSnapshot[intentHash] = pnlBps;
            (,,,,, uint40 resolvedAt,) = _status(intentHash);
            resolvedAtSnapshot[intentHash] = resolvedAt;
        } catch {}
    }

    function resolveAsNonResolver(uint256 rawIndex, int128 pnlBps, bytes32 resolveHash) external {
        if (executedHashes.length == 0) return;
        bytes32 intentHash = executedHashes[bound(rawIndex, 0, executedHashes.length - 1)];
        vm.prank(address(0xBEEF));
        try escrow.resolveIntent(intentHash, pnlBps, resolveHash) {
            fail("non-resolver resolved");
        } catch {}
    }

    function pauseAndTryExecute(uint256 rawNonce) external {
        vm.prank(owner);
        escrow.setPaused(true);

        uint256 nonce = bound(rawNonce, 2_000_001, 3_000_000);
        BobbyIntentEscrow.TradeIntent memory intent = _intent(nonce, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);

        vm.prank(keeper);
        try escrow.executeIntent(
            intent,
            _sig(CIO_PK, _intentDigest(intent)),
            decision,
            _sig(ARBITER_PK, _verifyDigest(decision)),
            bytes32("paused")
        ) {
            fail("paused execution succeeded");
        } catch {}

        vm.prank(owner);
        escrow.setPaused(false);
    }

    function executedCount() external view returns (uint256) {
        return executedHashes.length;
    }

    function executedHashAt(uint256 index) external view returns (bytes32) {
        return executedHashes[index];
    }

    function _intent(
        uint256 nonce,
        uint256 sizeUsd,
        uint16 slippage,
        uint8 direction,
        uint256 expiresAt,
        address treasury
    ) internal pure returns (BobbyIntentEscrow.TradeIntent memory) {
        return BobbyIntentEscrow.TradeIntent({
            debateHash: keccak256(abi.encode("debate", nonce)),
            trader: address(0xCAFE),
            symbol: "OKB",
            direction: direction,
            sizeUsd: sizeUsd,
            entryRef: 50e8,
            slippageMaxBps: slippage,
            treasury: treasury,
            nonce: nonce,
            expiresAt: expiresAt
        });
    }

    function _decision(bytes32 intentHash, bool approved, uint256 deadline)
        internal
        pure
        returns (BobbyIntentEscrow.VerificationDecision memory)
    {
        return BobbyIntentEscrow.VerificationDecision({
            intentHash: intentHash,
            approved: approved,
            reasonHash: keccak256("ok"),
            deadline: deadline
        });
    }

    function _intentDigest(BobbyIntentEscrow.TradeIntent memory i) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                escrow.INTENT_TYPEHASH(),
                i.debateHash,
                i.trader,
                keccak256(bytes(i.symbol)),
                i.direction,
                i.sizeUsd,
                i.entryRef,
                i.slippageMaxBps,
                i.treasury,
                i.nonce,
                i.expiresAt
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));
    }

    function _verifyDigest(BobbyIntentEscrow.VerificationDecision memory d) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(escrow.VERIFY_TYPEHASH(), d.intentHash, d.approved, d.reasonHash, d.deadline)
        );
        return keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));
    }

    function _sig(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _status(bytes32 intentHash)
        internal
        view
        returns (
            BobbyIntentEscrow.TradeState state,
            address trader,
            bytes32 debateHash,
            bytes32 resolveHash,
            uint40 executedAt,
            uint40 resolvedAt,
            int128 pnlBps
        )
    {
        return escrow.getTradeStatus(intentHash);
    }
}

contract BobbyIntentEscrowInvariantTest is Test {
    uint256 internal constant CIO_PK = 0xC10;
    uint256 internal constant ARBITER_PK = 0xA4817E;
    uint256 internal constant SECP256K1_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    uint256 internal constant MAX_SIG_S =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;
    uint256 internal constant TEST_CHAIN_ID = 196;
    uint256 internal constant TEST_MAX_SIZE = 5_000_000e18;

    BobbyIntentEscrow internal escrow;
    BobbyIntentEscrowHandler internal handler;

    address internal owner = address(0x1000);
    address internal cio = vm.addr(CIO_PK);
    address internal arbiter = vm.addr(ARBITER_PK);
    address internal keeper = address(0x3000);
    address internal resolver = address(0x4000);

    function setUp() public {
        vm.chainId(196);
        escrow = new BobbyIntentEscrow(TEST_CHAIN_ID, TEST_MAX_SIZE, owner, cio, arbiter, keeper, resolver);
        handler = new BobbyIntentEscrowHandler(escrow, owner, cio, arbiter, keeper, resolver);

        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = BobbyIntentEscrowHandler.executeValid.selector;
        selectors[1] = BobbyIntentEscrowHandler.executeWithBadCioSig.selector;
        selectors[2] = BobbyIntentEscrowHandler.resolveAsResolver.selector;
        selectors[3] = BobbyIntentEscrowHandler.resolveAsNonResolver.selector;
        selectors[4] = BobbyIntentEscrowHandler.pauseAndTryExecute.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariant_resolvedStateNeverChanges() public view {
        uint256 count = handler.executedCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 intentHash = handler.executedHashAt(i);
            if (!handler.seenResolved(intentHash)) continue;

            (
                BobbyIntentEscrow.TradeState state,
                ,
                ,
                bytes32 resolveHash,
                ,
                uint40 resolvedAt,
                int128 pnlBps
            ) = escrow.getTradeStatus(intentHash);

            assertEq(uint256(state), uint256(BobbyIntentEscrow.TradeState.RESOLVED));
            assertEq(resolveHash, handler.resolvedHashSnapshot(intentHash));
            assertEq(pnlBps, handler.resolvedPnlSnapshot(intentHash));
            assertEq(resolvedAt, handler.resolvedAtSnapshot(intentHash));
        }
    }

    function invariant_executedOnlyResolverCanResolve() public view {
        uint256 count = handler.executedCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 intentHash = handler.executedHashAt(i);
            (BobbyIntentEscrow.TradeState state,,,,,,) = escrow.getTradeStatus(intentHash);
            assertTrue(
                state == BobbyIntentEscrow.TradeState.EXECUTED || state == BobbyIntentEscrow.TradeState.RESOLVED,
                "unexpected state"
            );
            if (state == BobbyIntentEscrow.TradeState.RESOLVED) {
                assertTrue(handler.seenResolved(intentHash), "resolved outside resolver path");
            }
        }
    }

    function invariant_successfulNoncesCannotExecuteTwice() public view {
        uint256 count = handler.executedCount();
        assertLe(count, 1_000_000);
    }

    function invariant_roleSeparationHolds() public view {
        assertTrue(escrow.cio() != escrow.arbiter());
        assertTrue(escrow.cio() != escrow.keeper());
        assertTrue(escrow.cio() != escrow.resolver());
        assertTrue(escrow.arbiter() != escrow.keeper());
        assertTrue(escrow.arbiter() != escrow.resolver());
        assertTrue(escrow.keeper() != escrow.resolver());
        assertTrue(escrow.cio() != address(0));
        assertTrue(escrow.arbiter() != address(0));
        assertTrue(escrow.keeper() != address(0));
        assertTrue(escrow.resolver() != address(0));
    }

    function test_keeperCannotCreateTerminalStateWithoutCioAndArbiter(uint256 rawNonce) public {
        uint256 nonce = bound(rawNonce, 10_000_001, 11_000_000);
        BobbyIntentEscrow.TradeIntent memory intent = _intent(nonce, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory badCioSig = _sig(0xBAD, _intentDigest(intent, escrow));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, escrow));

        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSig.selector);
        escrow.executeIntent(intent, badCioSig, decision, arbiterSig, bytes32("bad"));

        (BobbyIntentEscrow.TradeState state,,,,,,) = escrow.getTradeStatus(intentHash);
        assertEq(uint256(state), uint256(BobbyIntentEscrow.TradeState.NONE));
    }

    function test_nonceCannotExecuteTwice(uint256 rawNonce) public {
        uint256 nonce = bound(rawNonce, 11_000_001, 12_000_000);
        BobbyIntentEscrow.TradeIntent memory first = _intent(nonce, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        _execute(first, escrow);

        BobbyIntentEscrow.TradeIntent memory second = _intent(nonce, 2e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 secondHash = escrow.computeIntentStructHash(second);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(secondHash, true, block.timestamp + 1 days);
        bytes memory cioSig = _sig(CIO_PK, _intentDigest(second, escrow));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, escrow));

        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.NonceUsed.selector);
        escrow.executeIntent(
            second,
            cioSig,
            decision,
            arbiterSig,
            bytes32("second")
        );
    }

    function test_highSSignatureRevertsBadSigMalleable() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(12_000_001, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory cioHighS = _highSSig(CIO_PK, _intentDigest(intent, escrow));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, escrow));

        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSigMalleable.selector);
        escrow.executeIntent(
            intent,
            cioHighS,
            decision,
            arbiterSig,
            bytes32("high-s")
        );
    }

    function test_successRequiresDecisionHashEqualsComputedHash(uint256 rawNonce) public {
        uint256 nonce = bound(rawNonce, 12_000_002, 13_000_000);
        BobbyIntentEscrow.TradeIntent memory intent = _intent(nonce, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 computed = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory wrongDecision = _decision(keccak256("wrong"), true, block.timestamp + 1 days);
        bytes memory cioSig = _sig(CIO_PK, _intentDigest(intent, escrow));
        bytes memory wrongArbiterSig = _sig(ARBITER_PK, _verifyDigest(wrongDecision, escrow));

        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadIntentHash.selector);
        escrow.executeIntent(
            intent,
            cioSig,
            wrongDecision,
            wrongArbiterSig,
            bytes32("wrong")
        );

        _execute(intent, escrow);
        (BobbyIntentEscrow.TradeState state,,,,,,) = escrow.getTradeStatus(computed);
        assertEq(uint256(state), uint256(BobbyIntentEscrow.TradeState.EXECUTED));
    }

    function test_pauseBlocksExecutionButNotResolution() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(13_000_001, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory cioSig = _sig(CIO_PK, _intentDigest(intent, escrow));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, escrow));

        vm.prank(owner);
        escrow.setPaused(true);
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.IsPaused.selector);
        escrow.executeIntent(
            intent,
            cioSig,
            decision,
            arbiterSig,
            bytes32("paused")
        );

        vm.prank(owner);
        escrow.setPaused(false);
        _execute(intent, escrow);
        vm.prank(owner);
        escrow.setPaused(true);
        vm.prank(resolver);
        escrow.resolveIntent(intentHash, 10, keccak256("resolve while paused"));
        (BobbyIntentEscrow.TradeState state,,,,,,) = escrow.getTradeStatus(intentHash);
        assertEq(uint256(state), uint256(BobbyIntentEscrow.TradeState.RESOLVED));
    }

    function test_boundsAlwaysHold() public {
        _expectExecuteRevert(_intent(14_000_001, 1e18, 100, 2, block.timestamp + 1 days, address(0x7777)), BobbyIntentEscrow.BadDirection.selector);
        _expectExecuteRevert(_intent(14_000_002, 0, 100, 0, block.timestamp + 1 days, address(0x7777)), BobbyIntentEscrow.BadSize.selector);
        _expectExecuteRevert(_intent(14_000_003, escrow.maxSizeUsd() + 1, 100, 0, block.timestamp + 1 days, address(0x7777)), BobbyIntentEscrow.BadSize.selector);
        _expectExecuteRevert(_intent(14_000_004, 1e18, 0, 0, block.timestamp + 1 days, address(0x7777)), BobbyIntentEscrow.BadSlippage.selector);
        _expectExecuteRevert(_intent(14_000_005, 1e18, escrow.MAX_SLIPPAGE_BPS() + 1, 0, block.timestamp + 1 days, address(0x7777)), BobbyIntentEscrow.BadSlippage.selector);
        _expectExecuteRevert(_intent(14_000_006, 1e18, 100, 0, block.timestamp + 1 days, address(0)), BobbyIntentEscrow.BadTreasury.selector);
    }

    function test_roleRotationRejectsZeroAndDuplicates() public {
        vm.prank(owner);
        vm.expectRevert(BobbyIntentEscrow.ZeroAddress.selector);
        escrow.rotateRole("cio", address(0));

        vm.prank(owner);
        vm.expectRevert(BobbyIntentEscrow.DuplicateRole.selector);
        escrow.rotateRole("cio", arbiter);

        vm.prank(owner);
        escrow.rotateRole("keeper", address(0x9999));
        assertEq(escrow.keeper(), address(0x9999));
    }

    function test_1271RevertWrongMagicAndZeroCodeFallbackNeverExecute() public {
        Mock1271Signer mockCio = new Mock1271Signer();
        Mock1271Signer mockArbiter = new Mock1271Signer();
        BobbyIntentEscrow e = new BobbyIntentEscrow(TEST_CHAIN_ID, TEST_MAX_SIZE, owner, address(mockCio), address(mockArbiter), keeper, resolver);

        BobbyIntentEscrow.TradeIntent memory intent = _intent(15_000_001, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = e.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory arbiterSigForZeroFallback;

        mockCio.setShouldRevert(true);
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSig.selector);
        e.executeIntent(intent, hex"01", decision, hex"02", bytes32("1271-revert"));
        mockCio.setShouldRevert(false);

        mockArbiter.setWrongMagic(true);
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSig.selector);
        e.executeIntent(intent, hex"01", decision, hex"02", bytes32("1271-wrong"));

        BobbyIntentEscrow zeroFallback = new BobbyIntentEscrow(TEST_CHAIN_ID, TEST_MAX_SIZE, owner, address(0x123456), arbiter, keeper, resolver);
        arbiterSigForZeroFallback = _sig(ARBITER_PK, _verifyDigest(decision, zeroFallback));
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSig.selector);
        zeroFallback.executeIntent(
            intent,
            hex"01",
            decision,
            arbiterSigForZeroFallback,
            bytes32("zero-code")
        );
    }

    function test_1271ReenterCannotExecute() public {
        Mock1271Signer mockCio = new Mock1271Signer();
        Mock1271Signer mockArbiter = new Mock1271Signer();
        BobbyIntentEscrow e = new BobbyIntentEscrow(TEST_CHAIN_ID, TEST_MAX_SIZE, owner, address(mockCio), address(mockArbiter), keeper, resolver);

        BobbyIntentEscrow.TradeIntent memory intent = _intent(15_000_002, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = e.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory callData = abi.encodeCall(
            BobbyIntentEscrow.executeIntent,
            (intent, hex"01", decision, hex"02", bytes32("reenter"))
        );
        mockCio.setReenter(e, callData);

        vm.prank(keeper);
        e.executeIntent(intent, hex"01", decision, hex"02", bytes32("outer"));

        (BobbyIntentEscrow.TradeState state,,,,,,) = e.getTradeStatus(intentHash);
        assertEq(uint256(state), uint256(BobbyIntentEscrow.TradeState.EXECUTED));
    }

    function test_1271StateMutationDuringStaticCallFailsSafely() public {
        Mock1271Signer mockCio = new Mock1271Signer();
        Mock1271Signer mockArbiter = new Mock1271Signer();
        mockCio.setOneShot(true);
        BobbyIntentEscrow e = new BobbyIntentEscrow(TEST_CHAIN_ID, TEST_MAX_SIZE, owner, address(mockCio), address(mockArbiter), keeper, resolver);

        BobbyIntentEscrow.TradeIntent memory intent = _intent(15_000_003, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = e.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);

        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSig.selector);
        e.executeIntent(intent, hex"01", decision, hex"02", bytes32("first"));
        assertFalse(e.usedNonces(address(mockCio), 15_000_003));
    }

    function test_domainReplayDifferentContractFails() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(16_000_001, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory cioSig = _sig(CIO_PK, _intentDigest(intent, escrow));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, escrow));

        BobbyIntentEscrow other = new BobbyIntentEscrow(TEST_CHAIN_ID, TEST_MAX_SIZE, owner, cio, arbiter, keeper, resolver);
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSig.selector);
        other.executeIntent(intent, cioSig, decision, arbiterSig, bytes32("replay"));
    }

    function test_domainReplayDifferentChainFailsAtBadChain() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(16_000_002, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory cioSig = _sig(CIO_PK, _intentDigest(intent, escrow));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, escrow));

        vm.chainId(1);
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadChain.selector);
        escrow.executeIntent(intent, cioSig, decision, arbiterSig, bytes32("chain"));
        vm.chainId(196);
    }

    function test_timestampEqualityAllowed() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(17_000_001, 1e18, 100, 0, block.timestamp, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp);
        _executeWithDecision(intent, decision, escrow);
    }

    function test_timestampPastReverts() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(17_000_002, 1e18, 100, 0, block.timestamp - 1, address(0x7777));
        _expectExecuteRevert(intent, BobbyIntentEscrow.Expired.selector);

        BobbyIntentEscrow.TradeIntent memory validIntent = _intent(17_000_003, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(validIntent);
        BobbyIntentEscrow.VerificationDecision memory expiredDecision = _decision(intentHash, true, block.timestamp - 1);
        bytes memory cioSig = _sig(CIO_PK, _intentDigest(validIntent, escrow));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(expiredDecision, escrow));
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.Expired.selector);
        escrow.executeIntent(
            validIntent,
            cioSig,
            expiredDecision,
            arbiterSig,
            bytes32("expired")
        );
    }

    function test_sigSBoundaryAndZeroS() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(18_000_001, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, escrow));

        bytes memory atMaxS = abi.encodePacked(bytes32(uint256(1)), bytes32(MAX_SIG_S), uint8(27));
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSig.selector);
        escrow.executeIntent(intent, atMaxS, decision, arbiterSig, bytes32("max-s-invalid-recovery"));

        bytes memory aboveMaxS = abi.encodePacked(bytes32(uint256(1)), bytes32(MAX_SIG_S + 1), uint8(27));
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSigMalleable.selector);
        escrow.executeIntent(intent, aboveMaxS, decision, arbiterSig, bytes32("above-max-s"));

        bytes memory zeroS = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(0)), uint8(27));
        vm.prank(keeper);
        vm.expectRevert(BobbyIntentEscrow.BadSig.selector);
        escrow.executeIntent(intent, zeroS, decision, arbiterSig, bytes32("zero-s"));
    }

    function test_ecrecoverBadInputPathsReject() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(19_000_001, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, escrow));

        bytes[] memory bad = new bytes[](4);
        bad[0] = hex"01";
        bad[1] = abi.encodePacked(bytes32(0), bytes32(0), uint8(27));
        bad[2] = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(1)), uint8(29));
        bad[3] = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(1)), uint8(0));

        for (uint256 i = 0; i < bad.length; i++) {
            vm.prank(keeper);
            vm.expectRevert(BobbyIntentEscrow.BadSig.selector);
            escrow.executeIntent(intent, bad[i], decision, arbiterSig, bytes32(i));
        }
    }

    function test_counterfactualCodeDeploymentChangesSigBranch() public {
        address futureContract = address(new Mock1271Signer());
        BobbyIntentEscrow e = new BobbyIntentEscrow(TEST_CHAIN_ID, TEST_MAX_SIZE, owner, futureContract, arbiter, keeper, resolver);
        BobbyIntentEscrow.TradeIntent memory intent = _intent(20_000_001, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = e.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);

        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, e));
        vm.prank(keeper);
        e.executeIntent(intent, hex"012345", decision, arbiterSig, bytes32("1271"));
        assertTrue(e.usedNonces(futureContract, 20_000_001));
    }

    function test_resolverCanWriteArbitraryPnlAndResolveHash() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(21_000_001, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        _execute(intent, escrow);

        vm.prank(resolver);
        escrow.resolveIntent(intentHash, 99_999, keccak256("fake resolve"));

        (BobbyIntentEscrow.TradeState state,,,,,, int128 pnlBps) = escrow.getTradeStatus(intentHash);
        assertEq(uint256(state), uint256(BobbyIntentEscrow.TradeState.RESOLVED));
        assertEq(pnlBps, 99_999);
    }

    // R2-001: owner overrides a falsified resolution within the challenge window.
    function test_overrideResolutionCorrectsBogusPnl() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(22_000_001, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        _execute(intent, escrow);

        bytes32 bogusResolve = keccak256("bogus");
        vm.prank(resolver);
        escrow.resolveIntent(intentHash, 99_999, bogusResolve);

        // Still inside the default 1h window.
        bytes32 correctedResolve = keccak256("corrected");
        vm.expectEmit(true, false, false, true);
        emit BobbyIntentEscrow.ResolutionOverridden(intentHash, 99_999, 0, bogusResolve, correctedResolve);
        vm.prank(owner);
        escrow.overrideResolution(intentHash, 0, correctedResolve);

        (BobbyIntentEscrow.TradeState state,,, bytes32 resolveHash,,, int128 pnlBps) = escrow.getTradeStatus(intentHash);
        assertEq(uint256(state), uint256(BobbyIntentEscrow.TradeState.RESOLVED));
        assertEq(pnlBps, int128(0));
        assertEq(resolveHash, correctedResolve);
    }

    // R2-001: override must revert once the challenge window has elapsed.
    function test_overrideResolutionRejectedAfterWindow() public {
        BobbyIntentEscrow.TradeIntent memory intent = _intent(22_000_002, 1e18, 100, 0, block.timestamp + 1 days, address(0x7777));
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        _execute(intent, escrow);

        vm.prank(resolver);
        escrow.resolveIntent(intentHash, 99_999, keccak256("bogus"));

        // Jump past the default 1h window.
        vm.warp(block.timestamp + uint256(escrow.challengeWindowSecs()) + 1);

        vm.prank(owner);
        vm.expectRevert(BobbyIntentEscrow.ChallengeWindowClosed.selector);
        escrow.overrideResolution(intentHash, 0, keccak256("too late"));
    }

    // R2-004: owner-settable maxSizeUsd must respect both bounds and emit.
    function test_setMaxSizeUsdBoundaries() public {
        uint256 ceiling = escrow.MAX_SIZE_USD_CEILING();

        vm.prank(owner);
        vm.expectRevert(BobbyIntentEscrow.BadMaxSize.selector);
        escrow.setMaxSizeUsd(0);

        vm.prank(owner);
        vm.expectRevert(BobbyIntentEscrow.BadMaxSize.selector);
        escrow.setMaxSizeUsd(ceiling + 1);

        uint256 previous = escrow.maxSizeUsd();
        uint256 next = 7_500_000e18;
        vm.expectEmit(false, false, false, true);
        emit BobbyIntentEscrow.MaxSizeUsdChanged(previous, next);
        vm.prank(owner);
        escrow.setMaxSizeUsd(next);

        assertEq(escrow.maxSizeUsd(), next);
    }

    function _execute(BobbyIntentEscrow.TradeIntent memory intent, BobbyIntentEscrow e) internal {
        bytes32 intentHash = e.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        _executeWithDecision(intent, decision, e);
    }

    function _executeWithDecision(
        BobbyIntentEscrow.TradeIntent memory intent,
        BobbyIntentEscrow.VerificationDecision memory decision,
        BobbyIntentEscrow e
    ) internal {
        bytes memory cioSig = _sig(CIO_PK, _intentDigest(intent, e));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, e));
        vm.prank(keeper);
        e.executeIntent(
            intent,
            cioSig,
            decision,
            arbiterSig,
            bytes32("execution")
        );
    }

    function _expectExecuteRevert(BobbyIntentEscrow.TradeIntent memory intent, bytes4 selector) internal {
        bytes32 intentHash = escrow.computeIntentStructHash(intent);
        BobbyIntentEscrow.VerificationDecision memory decision = _decision(intentHash, true, block.timestamp + 1 days);
        bytes memory cioSig = _sig(CIO_PK, _intentDigest(intent, escrow));
        bytes memory arbiterSig = _sig(ARBITER_PK, _verifyDigest(decision, escrow));
        vm.prank(keeper);
        vm.expectRevert(selector);
        escrow.executeIntent(
            intent,
            cioSig,
            decision,
            arbiterSig,
            bytes32("revert")
        );
    }

    function _intent(
        uint256 nonce,
        uint256 sizeUsd,
        uint16 slippage,
        uint8 direction,
        uint256 expiresAt,
        address treasury
    ) internal pure returns (BobbyIntentEscrow.TradeIntent memory) {
        return BobbyIntentEscrow.TradeIntent({
            debateHash: keccak256(abi.encode("debate", nonce)),
            trader: address(0xCAFE),
            symbol: "OKB",
            direction: direction,
            sizeUsd: sizeUsd,
            entryRef: 50e8,
            slippageMaxBps: slippage,
            treasury: treasury,
            nonce: nonce,
            expiresAt: expiresAt
        });
    }

    function _decision(bytes32 intentHash, bool approved, uint256 deadline)
        internal
        pure
        returns (BobbyIntentEscrow.VerificationDecision memory)
    {
        return BobbyIntentEscrow.VerificationDecision({
            intentHash: intentHash,
            approved: approved,
            reasonHash: keccak256("ok"),
            deadline: deadline
        });
    }

    function _intentDigest(BobbyIntentEscrow.TradeIntent memory i, BobbyIntentEscrow e) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                e.INTENT_TYPEHASH(),
                i.debateHash,
                i.trader,
                keccak256(bytes(i.symbol)),
                i.direction,
                i.sizeUsd,
                i.entryRef,
                i.slippageMaxBps,
                i.treasury,
                i.nonce,
                i.expiresAt
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", e.DOMAIN_SEPARATOR(), structHash));
    }

    function _verifyDigest(BobbyIntentEscrow.VerificationDecision memory d, BobbyIntentEscrow e) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(e.VERIFY_TYPEHASH(), d.intentHash, d.approved, d.reasonHash, d.deadline));
        return keccak256(abi.encodePacked("\x19\x01", e.DOMAIN_SEPARATOR(), structHash));
    }

    function _sig(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _highSSig(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        return abi.encodePacked(r, highS, flippedV);
    }
}
