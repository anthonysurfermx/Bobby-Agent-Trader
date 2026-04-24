// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ============================================================
// BobbyIntentEscrow — V3 core: intent-verification-execution coordinator
//
// STATUS: DRAFT v1 — 2026-04-24 (post audit round 2 — Codex)
// DO NOT DEPLOY to mainnet until 3-round audit complete
// (memory rule: 3-round audit before any .sol deploy).
// Round 1 findings applied. Round 2 findings applied in this file.
//
// Round 1 fixes applied (12 items):
//   F-001/F-002: markFailed() removed. Failures are off-chain only in V3.0.
//   F-003: struct field renamed ownerAddr→trader, TYPEHASH uses `address trader`.
//   F-004: resolveIntent no longer gated by notPaused.
//   F-005: renamed executeTxHash→executionRefHash, documented as attestation.
//   F-006: ECDSA malleability: s<=secp256k1n/2, v∈{27,28} enforced.
//   F-007: nonces scoped per-signer (mapping[signer][nonce]).
//   F-008: intentHash computed on-chain, equality enforced.
//   F-009: direction, sizeUsd, treasury, slippage bounded.
//   F-010: two-step ownership (pending + accept).
//   F-012: PROPOSED/VERIFIED/EXPIRED removed. States: NONE/EXECUTED/RESOLVED.
//   F-013: constructor + rotateRole enforce distinct critical roles.
//   Gemini#9: (off-chain) reason coding handled by UI via indexer;
//             contract emits no FAILED event in V3.0 — revert is the signal.
//
// Round 2 fixes applied (6 items):
//   R2-001: Owner challenge window + overrideResolution for resolver hardening
//           (Pyth migration slated for Round 3; this is the minimal gate).
//   R2-002: computeIntentHash → computeIntentStructHash (clarity rename).
//   R2-003: chainIdExpected is an immutable constructor param (no hardcoded 196).
//   R2-004: maxSizeUsd is mutable (owner-settable) with hard ceiling constant.
//   R2-005: IntentExecuted event now indexes symbolHash for indexer filtering.
//   R2-006: constructor rejects owner==keeper; keeper rotation rejects next==owner.
//
// Flow V3.0 (atomic):
//   1. CIO signs EIP-712 TradeIntent off-chain.
//   2. Arbiter verifies vs debate thesis, signs EIP-712 VerificationDecision.
//   3. Keeper submits both sigs to executeIntent() — contract verifies sigs,
//      nonce freshness, expiry, bounds, then state := EXECUTED.
//   4. Resolver records outcome via resolveIntent(intentHash, pnlBps, resolveHash).
//   5. Owner (Safe) may correct a falsified resolution via overrideResolution()
//      within `challengeWindowSecs` of resolvedAt.
//
// Roles (must be distinct wallets):
//   - owner:    admin (multisig 2-of-3) — MUST NOT equal keeper.
//   - cio:      signer of TradeIntent
//   - arbiter:  signer of VerificationDecision
//   - keeper:   executor (cannot sign intents)
//   - resolver: outcome reporter (Pyth migration P2)
//
/// @dev owner MUST be a multisig (e.g., Safe). Hot EOA owner is unsafe.
/// @dev Off-chain indexers SHOULD wait `challengeWindowSecs` before treating
///      a resolution as canonical — owner may overrideResolution() within window.
// ============================================================

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes memory sig) external view returns (bytes4);
}

contract BobbyIntentEscrow {
    // ── EIP-712 ──
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    // NOTE: intentHash is NOT part of the signed struct (F-008 — derived on-chain).
    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "TradeIntent(bytes32 debateHash,address trader,string symbol,uint8 direction,uint256 sizeUsd,uint256 entryRef,uint16 slippageMaxBps,address treasury,uint256 nonce,uint256 expiresAt)"
    );
    bytes32 public constant VERIFY_TYPEHASH = keccak256(
        "VerificationDecision(bytes32 intentHash,bool approved,bytes32 reasonHash,uint256 deadline)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;

    // ── Bounds (F-009 + R2-003/R2-004) ──
    uint16 public constant MAX_SLIPPAGE_BPS = 2000;                  // 20% hard ceiling
    uint256 public constant MAX_SIZE_USD_CEILING = 100_000_000e18;   // R2-004 hard ceiling on owner-settable maxSizeUsd
    uint256 public maxSizeUsd;                                       // R2-004 mutable, owner-settable
    uint256 public immutable chainIdExpected;                        // R2-003 immutable (was constant 196)

    // ── ECDSA (F-006) ──
    // secp256k1n / 2
    uint256 private constant MAX_SIG_S = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    // ── Roles ──
    address public owner;
    address public pendingOwner;   // F-010 two-step
    address public cio;
    address public arbiter;
    address public keeper;
    address public resolver;

    bool public paused;

    // ── Resolver challenge window (R2-001) ──
    uint32 public challengeWindowSecs;

    // ── State (F-012 simplified) ──
    enum TradeState { NONE, EXECUTED, RESOLVED }

    struct Trade {
        TradeState state;
        address trader;            // F-003 renamed from ownerAddr
        bytes32 debateHash;
        uint40 executedAt;
        uint40 resolvedAt;
        int128 pnlBps;
        bytes32 resolveHash;
    }

    mapping(bytes32 => Trade) public trades;                         // intentHash => Trade
    mapping(address => mapping(uint256 => bool)) public usedNonces;  // F-007 per-signer

    // ── Events ──
    event IntentExecuted(
        bytes32 indexed intentHash,
        address indexed trader,
        bytes32 indexed symbolHash, // R2-005 indexed for indexer filtering
        bytes32 debateHash,
        bytes32 executionRefHash    // F-005 attestation only, untrusted
    );
    event IntentResolved(
        bytes32 indexed intentHash,
        address indexed trader,
        int128 pnlBps,
        bytes32 resolveHash
    );
    // R2-001 owner override of a falsified resolution within challenge window
    event ResolutionOverridden(
        bytes32 indexed intentHash,
        int128 previousPnlBps,
        int128 newPnlBps,
        bytes32 previousResolveHash,
        bytes32 newResolveHash
    );
    event ChallengeWindowChanged(uint32 previous, uint32 next);
    event MaxSizeUsdChanged(uint256 previous, uint256 next); // R2-004

    event OwnershipTransferStarted(address indexed previous, address indexed pending);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event RoleRotated(bytes32 indexed role, address indexed previous, address indexed next);
    event Paused(bool state);

    // ── Errors ──
    error NotOwner();
    error NotPendingOwner();
    error NotKeeper();
    error NotResolver();
    error IsPaused();
    error NonceUsed();
    error BadSig();
    error BadSigMalleable();
    error Expired();
    error WrongState();
    error ZeroAddress();
    error DuplicateRole();
    error BadDirection();
    error BadSize();
    error BadSlippage();
    error BadTreasury();
    error BadChain();
    error BadIntentHash();
    error ChallengeWindowClosed(); // R2-001
    error BadMaxSize();            // R2-004

    // ── Modifiers ──
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyKeeper() { if (msg.sender != keeper) revert NotKeeper(); _; }
    modifier onlyResolver() { if (msg.sender != resolver) revert NotResolver(); _; }
    modifier notPaused() { if (paused) revert IsPaused(); _; }

    constructor(
        uint256 _chainIdExpected,
        uint256 _maxSizeUsd,
        address _owner,
        address _cio,
        address _arbiter,
        address _keeper,
        address _resolver
    ) {
        // R2-003 chain id configurable but non-zero
        if (_chainIdExpected == 0) revert BadChain();
        // R2-004 maxSizeUsd bounded on both sides
        if (_maxSizeUsd == 0 || _maxSizeUsd > MAX_SIZE_USD_CEILING) revert BadMaxSize();

        if (_owner == address(0) || _cio == address(0) || _arbiter == address(0)
            || _keeper == address(0) || _resolver == address(0)) revert ZeroAddress();
        // F-013 distinct roles
        if (_cio == _arbiter || _cio == _keeper || _cio == _resolver
            || _arbiter == _keeper || _arbiter == _resolver
            || _keeper == _resolver) revert DuplicateRole();
        // R2-006 owner != keeper (owner==cio/arbiter/resolver allowed — may be the Safe)
        if (_owner == _keeper) revert DuplicateRole();

        chainIdExpected = _chainIdExpected;
        maxSizeUsd = _maxSizeUsd;

        owner = _owner;
        cio = _cio;
        arbiter = _arbiter;
        keeper = _keeper;
        resolver = _resolver;

        challengeWindowSecs = 3600; // R2-001 default 1h

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256("BobbyIntentEscrow"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    // ── Admin (F-010) ──
    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        pendingOwner = next;
        emit OwnershipTransferStarted(owner, next);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address prev = owner;
        owner = pendingOwner;
        delete pendingOwner;
        emit OwnershipTransferred(prev, owner);
    }

    function rotateRole(bytes32 role, address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        address prev;
        if (role == "cio") {
            if (next == arbiter || next == keeper || next == resolver) revert DuplicateRole();
            prev = cio; cio = next;
        } else if (role == "arbiter") {
            if (next == cio || next == keeper || next == resolver) revert DuplicateRole();
            prev = arbiter; arbiter = next;
        } else if (role == "keeper") {
            if (next == cio || next == arbiter || next == resolver) revert DuplicateRole();
            if (next == owner) revert DuplicateRole(); // R2-006 keeper must not be owner
            prev = keeper; keeper = next;
        } else if (role == "resolver") {
            if (next == cio || next == arbiter || next == keeper) revert DuplicateRole();
            prev = resolver; resolver = next;
        } else {
            revert("bad role");
        }
        emit RoleRotated(role, prev, next);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    // R2-001 owner can tune challenge window (0 disables override path)
    function setChallengeWindow(uint32 secs) external onlyOwner {
        uint32 prev = challengeWindowSecs;
        challengeWindowSecs = secs;
        emit ChallengeWindowChanged(prev, secs);
    }

    // R2-004 owner can re-tune max trade size under the constant ceiling
    function setMaxSizeUsd(uint256 next) external onlyOwner {
        if (next == 0 || next > MAX_SIZE_USD_CEILING) revert BadMaxSize();
        uint256 prev = maxSizeUsd;
        maxSizeUsd = next;
        emit MaxSizeUsdChanged(prev, next);
    }

    // ── Execute (keeper submits both sigs) ──
    struct TradeIntent {
        bytes32 debateHash;
        address trader;             // F-003
        string symbol;
        uint8 direction;            // 0=long, 1=short
        uint256 sizeUsd;
        uint256 entryRef;
        uint16 slippageMaxBps;
        address treasury;
        uint256 nonce;
        uint256 expiresAt;
    }

    struct VerificationDecision {
        bytes32 intentHash;
        bool approved;
        bytes32 reasonHash;
        uint256 deadline;
    }

    function executeIntent(
        TradeIntent calldata intent,
        bytes calldata cioSig,
        VerificationDecision calldata decision,
        bytes calldata arbiterSig,
        bytes32 executionRefHash    // F-005 attestation, not verified
    ) external onlyKeeper notPaused {
        // F-009 + R2-003/R2-004 bounds
        if (block.chainid != chainIdExpected) revert BadChain();
        if (intent.direction > 1) revert BadDirection();
        if (intent.sizeUsd == 0 || intent.sizeUsd > maxSizeUsd) revert BadSize();
        if (intent.slippageMaxBps == 0 || intent.slippageMaxBps > MAX_SLIPPAGE_BPS) revert BadSlippage();
        if (intent.treasury == address(0)) revert BadTreasury();

        // Time checks
        if (block.timestamp > intent.expiresAt) revert Expired();
        if (block.timestamp > decision.deadline) revert Expired();

        // F-008 canonical intentHash
        bytes32 computedHash = _computeIntentStructHash(intent);
        if (decision.intentHash != computedHash) revert BadIntentHash();

        if (!decision.approved) revert BadSig();
        if (usedNonces[cio][intent.nonce]) revert NonceUsed();

        Trade storage t = trades[computedHash];
        if (t.state != TradeState.NONE) revert WrongState();

        // Verify CIO signature (digest uses same struct — intentHash excluded per F-008)
        bytes32 intentDigest = _hashTypedData(_structHashIntent(intent));
        if (!_isValidSig(cio, intentDigest, cioSig)) revert BadSig();

        // Verify Arbiter signature
        bytes32 verifyDigest = _hashTypedData(_structHashVerify(decision));
        if (!_isValidSig(arbiter, verifyDigest, arbiterSig)) revert BadSig();

        // Record state
        usedNonces[cio][intent.nonce] = true;
        t.state = TradeState.EXECUTED;
        t.trader = intent.trader;
        t.debateHash = intent.debateHash;
        t.executedAt = uint40(block.timestamp);

        // R2-005 emit with indexed symbolHash
        bytes32 symbolHash = keccak256(bytes(intent.symbol));
        emit IntentExecuted(computedHash, intent.trader, symbolHash, intent.debateHash, executionRefHash);
    }

    // ── Resolve (F-004: available even when paused) ──
    function resolveIntent(bytes32 intentHash, int128 pnlBps, bytes32 resolveHash) external onlyResolver {
        Trade storage t = trades[intentHash];
        if (t.state != TradeState.EXECUTED) revert WrongState();
        t.state = TradeState.RESOLVED;
        t.pnlBps = pnlBps;
        t.resolveHash = resolveHash;
        t.resolvedAt = uint40(block.timestamp);
        emit IntentResolved(intentHash, t.trader, pnlBps, resolveHash);
    }

    // R2-001 owner correction path for a falsified resolution.
    // - intent must be in RESOLVED state
    // - call must land within challengeWindowSecs of resolvedAt
    // - emits ResolutionOverridden (IntentResolved stays intact for indexer history)
    function overrideResolution(bytes32 intentHash, int128 pnlBps, bytes32 resolveHash) external onlyOwner {
        Trade storage t = trades[intentHash];
        if (t.state != TradeState.RESOLVED) revert WrongState();
        if (block.timestamp - t.resolvedAt > challengeWindowSecs) revert ChallengeWindowClosed();

        int128 previousPnl = t.pnlBps;
        bytes32 previousResolve = t.resolveHash;
        t.pnlBps = pnlBps;
        t.resolveHash = resolveHash;
        emit ResolutionOverridden(intentHash, previousPnl, pnlBps, previousResolve, resolveHash);
    }

    // ── View: timeline surface for /track-record (Gemini FedEx) ──
    function getTradeStatus(bytes32 intentHash) external view returns (
        TradeState state,
        address trader,
        bytes32 debateHash,
        bytes32 resolveHash,
        uint40 executedAt,
        uint40 resolvedAt,
        int128 pnlBps
    ) {
        Trade memory t = trades[intentHash];
        return (t.state, t.trader, t.debateHash, t.resolveHash,
                t.executedAt, t.resolvedAt, t.pnlBps);
    }

    // R2-002 renamed from computeIntentHash. Exposed for off-chain clients.
    function computeIntentStructHash(TradeIntent calldata intent) external pure returns (bytes32) {
        return _computeIntentStructHash(intent);
    }

    // ── Internal ──
    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function _structHashIntent(TradeIntent calldata i) internal pure returns (bytes32) {
        // intentHash excluded (F-008 canonical derivation)
        return keccak256(abi.encode(
            INTENT_TYPEHASH,
            i.debateHash, i.trader,
            keccak256(bytes(i.symbol)),
            i.direction, i.sizeUsd, i.entryRef,
            i.slippageMaxBps, i.treasury, i.nonce, i.expiresAt
        ));
    }

    function _structHashVerify(VerificationDecision calldata d) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            VERIFY_TYPEHASH, d.intentHash, d.approved, d.reasonHash, d.deadline
        ));
    }

    function _computeIntentStructHash(TradeIntent calldata i) internal pure returns (bytes32) {
        return _structHashIntent(i);
    }

    // F-006 ECDSA malleability — no v remap, strict s ceiling
    function _isValidSig(address signer, bytes32 digest, bytes calldata sig) internal view returns (bool) {
        if (signer.code.length > 0) {
            try IERC1271(signer).isValidSignature(digest, sig) returns (bytes4 magic) {
                return magic == 0x1626ba7e;
            } catch { return false; }
        }
        if (sig.length != 65) return false;
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v != 27 && v != 28) return false;
        if (uint256(s) > MAX_SIG_S) revert BadSigMalleable();
        address recovered = ecrecover(digest, v, r, s);
        return recovered == signer && recovered != address(0);
    }
}
