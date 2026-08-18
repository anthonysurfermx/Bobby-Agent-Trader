// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title Bobby Agent Trader — On-Chain Track Record v2 (oracle-verified)
/// @notice Commit-reveal track record where, for the VERIFIED universe, entry
///         AND exit prices must be proven with signed Pyth updates inside
///         declared time windows, outcome classification derives from oracle
///         prices (never from reported ones), committed stops are enforceable
///         by anyone via permissionless breach challenges with a finite
///         finality window, and verified/attested statistics are kept in
///         strictly separate ledgers (D-1) with no combined getter.
/// @dev Spec: docs/audit/trackrecord-v2-spec.md v0.6 (design closed 2026-08-12
///      after 3 adversarial design reviews + on-chain PoC). Storage layout is
///      FROZEN per docs/audit/trackrecord-v2-poc.md §5 (forge inspect).
/// @dev Error style (spec §1.10 / C-08): paths inherited from v1 keep their
///      require strings VERBATIM (regression suites pin them); all new v2
///      checks use custom errors.
/// @author Bobby Agent Trader × DeFi México

// ---------------------------------------------------------------------------
// Minimal external interfaces (shapes validated on-chain by the PoC fork test)
// ---------------------------------------------------------------------------

library PythStructs {
    struct Price { int64 price; uint64 conf; int32 expo; uint256 publishTime; }
    struct PriceFeed { bytes32 id; Price price; Price emaPrice; }
}

interface IPyth {
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256);
    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PythStructs.PriceFeed[] memory);
}

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

contract BobbyTrackRecordV2 {

    // ---- Types ----

    enum Result { PENDING, WIN, LOSS, EXPIRED, BREAK_EVEN }
    enum Agent { CIO, ALPHA, REDTEAM }
    /// @dev Spec C-03: storage-zero is the WEAK claim.
    enum PriceMode { ATTESTED, VERIFIED }

    /// @dev Oracle evidence persisted per verified leg (spec 5b.2). 2 slots.
    struct OracleEvidence {
        bytes32 feedId;      // slot A
        int64 price;         // slot B (raw Pyth)
        uint64 conf;         // slot B
        int32 expo;          // slot B
        uint64 publishTime;  // slot B
    }

    /// @dev Verification params — the ACTIVE configuration. Copied field-by-
    ///      field into each commitment at commit time (M-02 lesson: config
    ///      changes never reinterpret pending commitments). Widths sized to
    ///      their hard caps so the snapshot packs into commitment slot 3.
    /// @dev Ranges below MUST match `_validateParams` exactly (audit r2 P2:
    ///      stale comments once tempted a maintainer to re-widen).
    struct VerificationParams {
        uint16 entryWindowSec;      // [10, 600]
        uint16 exitWindowSec;       // [10, 1800]
        uint24 maxExitLagSec;       // [300, 3600]        (V-01: 1h cap, not 24h)
        uint24 challengeWindowSec;  // (2 days, 30 days]  (V-03: strictly > timelock)
        uint16 entryTolBps;         // [10, 500]
        uint16 exitTolBps;          // [10, 500]
        uint16 confMaxBps;          // [10, 200]
    }

    /// @dev FROZEN LAYOUT (poc §5): 7 slots + string. Params are INLINED —
    ///      a nested struct member would open a fresh slot.
    struct Commitment {
        bytes32 debateHash;                                        // slot 0
        uint96 entryPrice; uint96 targetPrice; uint64 committedAt; // slot 1
        uint96 stopPrice; address recorder;                        // slot 2
        // slot 3 (28/32):
        uint64 minResolveAt; Agent agent; uint8 conviction; bool resolved; PriceMode mode;
        uint16 entryWindowSec; uint16 exitWindowSec; uint24 maxExitLagSec; uint24 challengeWindowSec;
        uint16 entryTolBps; uint16 exitTolBps; uint16 confMaxBps;
        OracleEvidence entryEvidence;                              // slots 4-5
        string symbol;                                             // slot 6+
    }

    /// @dev FROZEN LAYOUT (poc §5): 10 slots + string.
    struct Trade {
        bytes32 debateHash;                                        // slot 0
        uint96 entryPrice; uint96 exitPrice; uint64 committedAt;   // slot 1
        // slot 2 (32/32 exact — mode takes v1's free byte):
        uint64 resolvedAt; address recorder; Agent agent; uint8 conviction; Result result; PriceMode mode;
        int256 pnlBps;                                             // slot 3
        // slot 4 (17/32 — new slot, F-06):
        uint64 exitAt; uint64 challengeDeadline; bool stopChallenged;
        OracleEvidence entryEvidence;                              // slots 5-6
        OracleEvidence exitEvidence;                               // slots 7-8
        string symbol;                                             // slot 9+
    }

    // ---- Custom errors (v2 paths only — v1 paths keep require strings) ----

    error ReentrantCall();
    error InvalidSymbol();
    error ModeMismatch();
    error EntryProofRequired();
    error EntryInFuture();
    error EntryTooStale();
    error AttestedNoEntryAnchor();
    error AnnounceRequired();
    error EntryAnchorMismatch();
    error AlreadyCommitted();
    error StopRequiredForVerified();
    error InvalidDirection();
    error AttestedNoEvidence();
    error AttestedNoValue();
    error InsufficientFee();
    error NonPositivePrice();
    error UnexpectedExpo();
    error PriceOutOfBand();
    error ConfTooWide();
    error ExitProofRequired();
    error ProofMustBeSingleUpdate();
    error TimestampOverflow();
    error ExitBeforeMinResolve();
    error ExitInFuture();
    error ExitTooStale();
    error ResultContradictsOracle();
    error PnlSignMismatch();
    error PnlOutOfTolerance();
    error ChallengeNotVerified();
    error ChallengeNotApplicable();
    error ChallengeWindowClosed();
    error ChallengeAnchorOutOfRange();
    error AlreadyChallenged();
    error NoBreach();
    error ParamsOutOfBounds();
    error PythNotApproved();
    error TimelockNotElapsed();
    error NoCodeAtPyth();
    error NoPythActive();
    error SanityFeedBadDecimals();
    error InvalidFeed();
    error ZeroAddress();

    // ---- State (v1-inherited) ----

    address public owner;
    address public pendingOwner;
    address public bobby;
    bool public paused;

    uint256 public minCommitAge = 1 hours;
    uint256 public constant MIN_COMMIT_AGE_FLOOR = 10 minutes;
    uint256 public constant MAX_COMMITMENT_TTL = 30 days;
    /// @dev A4-1: the entry anchor is DERIVED from the announcement as
    ///      announcedAt + MIN_ENTRY_DELAY_SEC — strictly in the announce
    ///      block's future. Same-block announce+commit therefore reverts
    ///      EntryInFuture, and no signed tick for the anchor instant can
    ///      exist (let alone be known) when the anchor is fixed.
    uint64 public constant MIN_ENTRY_DELAY_SEC = 10;
    int256 public constant PNL_TOLERANCE_BPS = 100;
    uint256 public constant MAX_RECENT = 100;

    /// @dev internal + struct getters below: the auto-generated flat getters
    ///      for 19-field structs are stack-too-deep and a worse ABI anyway.
    Commitment[] internal commitments;
    Trade[] internal trades;

    /// @dev commitIndex[hash] = arrayIndex + 1; 0 = "not committed" (v1).
    mapping(bytes32 => uint256) public commitIndex;

    /// @dev A3-1: VERIFIED entries anchor at a PRE-ANNOUNCED instant. The
    ///      announcement fixes the anchor BEFORE its oracle evidence exists,
    ///      so the recorder cannot backdate an entry onto already-observed
    ///      price action. commitTrade then requires entryAt == announcedAt
    ///      (equality, not >=: a range would leave [announcedAt, commit]
    ///      retrospectively selectable). Re-announcing only moves the anchor
    ///      FORWARD (block.timestamp is monotonic), which is harmless.
    mapping(bytes32 => uint64) public announcedAt;
    uint256 public pendingCount;

    /// @dev tradeIndex[hash] = tradesArrayIndex + 1; 0 = "no trade row yet".
    ///      Exactly one Trade per debateHash (resolve/expire/challenge-of-pending
    ///      all gate on !c.resolved), so this is an O(1) replacement for the
    ///      former tail scan (audit r1 fix 2).
    mapping(bytes32 => uint256) public tradeIndex;

    // ---- State (v2) ----

    /// @dev VERIFIED universe: keccak256(bytes(validated symbol)) => Pyth feed id.
    mapping(bytes32 => bytes32) public feedOf;

    /// @dev Pyth allowlist (spec §3.5 / F-05): the allowlist + timelock IS the
    ///      control. Pyth on Base is an ERC-1967 proxy, so no codehash pin can
    ///      detect an implementation upgrade — that residual is an explicit,
    ///      published trust assumption on Pyth governance, monitored off-chain;
    ///      the emergency brake is revokePyth(activePyth) (VERIFIED resolves
    ///      revert until a reviewed oracle is activated), never a settlement
    ///      pause (r5 principle).
    mapping(address => bool) public approvedPyth;
    mapping(address => uint64) public pythActivatableAt;
    address public activePyth;
    uint64 public constant PYTH_ACTIVATION_DELAY = 2 days;

    /// @dev Optional non-blocking Chainlink sanity check (spec 5b.7).
    mapping(bytes32 => address) public sanityFeedOf;
    uint16 public constant SANITY_BAND_BPS = 200;
    uint32 public constant SANITY_MAX_STALENESS = 3600;

    VerificationParams public params;

    /// @dev Per-mode ledgers. D-1: no function in this contract ever combines
    ///      VERIFIED and ATTESTED figures.
    uint256 public winsVerified;
    uint256 public lossesVerified;
    int256 public totalPnlBpsVerified;
    uint256 public winsAttested;
    uint256 public lossesAttested;
    int256 public totalPnlBpsAttested;
    uint256 public resolvedVerified;
    uint256 public resolvedAttested;
    uint256 public expiredVerified;
    uint256 public expiredAttested;
    uint256 public pendingVerified;
    uint256 public pendingAttested;

    mapping(Agent => mapping(PriceMode => uint256)) public agentWinsByMode;
    mapping(Agent => mapping(PriceMode => uint256)) public agentLossesByMode;
    mapping(Agent => mapping(PriceMode => uint256)) public agentTradesByMode;

    /// @dev Refunds whose `call` failed are retained here (never revert the
    ///      flow) and swept by the owner. By construction the contract balance
    ///      only ever holds retained refunds.
    uint256 public retainedFees;

    uint256 private _lock = 1;

    // ---- Events (spec §3.7) ----

    event TradeCommitted(
        uint256 indexed commitId, string symbol, Agent indexed agent, uint8 conviction,
        uint256 entryPrice, bytes32 indexed debateHash,
        PriceMode mode, bytes32 feedId, uint256 entryOraclePrice1e8, uint64 entryPublishTime,
        uint64 entryAt
    );
    event TradeResolved(
        uint256 indexed tradeId, string symbol, Agent indexed agent, Result result,
        int256 pnlBps, uint8 conviction, bytes32 indexed debateHash,
        PriceMode mode, uint64 exitAt, uint256 exitOraclePrice1e8, uint64 exitPublishTime
    );
    event TradeReclassified(
        uint256 indexed tradeId, bytes32 indexed debateHash,
        Result oldResult, Result newResult, int256 oldPnlBps, int256 newPnlBps, string reason
    );
    event StopBreachChallenged(
        bytes32 indexed debateHash, address indexed challenger,
        uint64 breachPublishTime, uint256 breachPrice1e8, bool wasResolved
    );
    event CommitmentExpired(uint256 indexed commitId, bytes32 indexed debateHash, string symbol);
    event CommitAnnounced(bytes32 indexed debateHash, uint64 announcedAt);
    event FeedSet(bytes32 indexed symbolHash, string symbol, bytes32 feedId);
    event SanityFeedSet(bytes32 indexed symbolHash, string symbol, address aggregator);
    event PythApproved(address indexed pyth, uint64 activatableAt);
    event PythRevoked(address indexed pyth);
    event PythActivated(address indexed pyth);
    event ParamsUpdated(VerificationParams newParams);
    event OracleDiscrepancy(bytes32 indexed debateHash, uint256 oracle1e8, uint256 chainlink1e8);
    event RefundRetained(address indexed to, uint256 amount);
    event StuckFeesWithdrawn(address indexed to, uint256 amount);
    event BobbyUpdated(address indexed oldBobby, address indexed newBobby);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event MinCommitAgeUpdated(uint256 oldAge, uint256 newAge);

    // ---- Modifiers ----

    modifier onlyBobby() {
        require(msg.sender == bobby || msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert ReentrantCall();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ---- Constructor (spec §3.6) ----

    /// @param _bobby recorder address
    /// @param _params initial verification params (validated against bounds —
    ///        zeroed defaults would brick the first VERIFIED commit)
    /// @param _symbols canonical verified symbols (e.g. ["BTC","ETH","SOL"])
    /// @param _feedIds Pyth feed ids, 1:1 with _symbols
    /// @param _pyths deploy-vetted Pyth oracles. `_pyths[0]` becomes active;
    ///        the rest are PRE-APPROVED alternates (V-03): they are instantly
    ///        activatable in an emergency (activatableAt = now, no timelock)
    ///        because they were audited as part of THIS deployment. Post-deploy
    ///        additions via approvePyth still serve the 2-day timelock. So a
    ///        `revokePyth(active)` can be recovered in one tx by activating a
    ///        pre-approved alternate — the challenge valve is never stuck.
    constructor(
        address _bobby,
        VerificationParams memory _params,
        address[] memory _pyths,
        string[] memory _symbols,
        bytes32[] memory _feedIds
    ) {
        require(_bobby != address(0), "Invalid bobby address");
        if (_pyths.length == 0) revert NoCodeAtPyth();
        if (_symbols.length != _feedIds.length) revert InvalidFeed();

        owner = msg.sender;
        bobby = _bobby;
        emit OwnershipTransferred(address(0), msg.sender);
        emit BobbyUpdated(address(0), _bobby);

        _validateParams(_params);
        params = _params;
        emit ParamsUpdated(_params);

        for (uint256 i = 0; i < _pyths.length; i++) {
            address p = _pyths[i];
            if (p == address(0)) revert ZeroAddress();
            if (p.code.length == 0) revert NoCodeAtPyth();
            approvedPyth[p] = true;
            pythActivatableAt[p] = uint64(block.timestamp); // deploy-vetted: instant
            emit PythApproved(p, uint64(block.timestamp));
        }
        activePyth = _pyths[0];
        emit PythActivated(_pyths[0]);

        for (uint256 i = 0; i < _symbols.length; i++) {
            bytes32 h = _validSymbolHash(_symbols[i]);
            if (_feedIds[i] == bytes32(0)) revert InvalidFeed();
            feedOf[h] = _feedIds[i];
            emit FeedSet(h, _symbols[i], _feedIds[i]);
        }
    }

    // ============================================================
    //  PHASE 1: COMMIT
    // ============================================================

    /// @dev Memory bundle keeping every frame under the 16-slot limit.
    struct CommitArgs {
        bytes32 debateHash;
        string symbol;
        Agent agent;
        uint8 conviction;
        uint96 entryPrice;
        uint96 targetPrice;
        uint96 stopPrice;
        uint64 entryAt;
    }

    /// @notice A3-1/A4-1: fix the entry anchor for a future VERIFIED commit.
    ///         The anchor is DERIVED, strictly future: announcedAt +
    ///         MIN_ENTRY_DELAY_SEC. Announcing in the same block as (or after
    ///         observing) the anchor's tick is impossible — the tick does not
    ///         exist yet when the anchor is fixed. Commit must land in
    ///         [entryAt, entryAt + entryWindowSec]; re-announcing simply
    ///         moves the anchor forward.
    function announceCommit(bytes32 _debateHash) external onlyBobby whenNotPaused {
        require(_debateHash != bytes32(0), "Invalid debate hash");
        if (commitIndex[_debateHash] != 0) revert AlreadyCommitted();
        uint64 ts = uint64(block.timestamp);
        announcedAt[_debateHash] = ts;
        emit CommitAnnounced(_debateHash, ts);
    }

    function commitTrade(
        bytes32 _debateHash,
        string calldata _symbol,
        Agent _agent,
        uint8 _conviction,
        uint96 _entryPrice,
        uint96 _targetPrice,
        uint96 _stopPrice,
        PriceMode _declaredMode,
        uint64 _entryAt,
        bytes[] calldata _entryUpdateData
    ) external payable onlyBobby whenNotPaused nonReentrant {
        // Stack discipline (A2-1 param growth): pack the flat calldata into
        // the args struct IMMEDIATELY so the 10 scalars stop occupying the
        // frame, then dispatch. Flat external signature is kept on purpose —
        // a tuple parameter would reshape the ABI for every consumer.
        _commitDispatch(
            CommitArgs(_debateHash, _symbol, _agent, _conviction, _entryPrice, _targetPrice, _stopPrice, _entryAt),
            _declaredMode,
            _entryUpdateData
        );
    }

    function _commitDispatch(
        CommitArgs memory a,
        PriceMode _declaredMode,
        bytes[] calldata _entryUpdateData
    ) internal {
        require(a.debateHash != bytes32(0), "Invalid debate hash");
        require(commitIndex[a.debateHash] == 0, "Already committed");
        require(a.conviction <= 10, "Conviction must be 0-10");
        require(a.entryPrice > 0, "Entry price required");
        require(a.targetPrice > 0 || a.stopPrice > 0, "Target or stop required");

        bytes32 feedId = feedOf[_validSymbolHash(a.symbol)];
        // B-03: misclassification-by-naming is a loud revert, never a silent
        // downgrade. The mapping decides the mode; the caller must agree.
        if (feedId != bytes32(0)) {
            if (_declaredMode != PriceMode.VERIFIED) revert ModeMismatch();
            _commitVerified(a, feedId, _entryUpdateData);
        } else {
            if (_declaredMode != PriceMode.ATTESTED) revert ModeMismatch();
            // A-02: attested trades carry no decorative evidence or value.
            if (_entryUpdateData.length != 0) revert AttestedNoEvidence();
            if (msg.value != 0) revert AttestedNoValue();
            if (a.entryAt != 0) revert AttestedNoEntryAnchor();
            OracleEvidence memory emptyEv;
            _storeCommitment(a, PriceMode.ATTESTED, bytes32(0), emptyEv);
        }
    }

    function _commitVerified(
        CommitArgs memory a,
        bytes32 feedId,
        bytes[] calldata _entryUpdateData
    ) internal {
        // S-01 closure: without a stop there is nothing to challenge and the
        // thesis carries no provable invalidation.
        if (a.stopPrice == 0) revert StopRequiredForVerified();
        // F-02: direction is anchored to the stop; target, if present, must
        // sit strictly on the opposite side. No silent precedence.
        if (a.stopPrice == a.entryPrice) revert InvalidDirection();
        if (a.targetPrice > 0) {
            bool isLong = a.stopPrice < a.entryPrice;
            if (isLong ? a.targetPrice <= a.entryPrice : a.targetPrice >= a.entryPrice) {
                revert InvalidDirection();
            }
        }
        if (_entryUpdateData.length == 0) revert EntryProofRequired();

        // A2-1/A3-1/A4-1: the entry anchors to the instant DERIVED from the
        // announcement: announcedAt + MIN_ENTRY_DELAY_SEC. Exact equality (not
        // >=) leaves no temporal choice, and the future offset means the
        // anchor's tick cannot exist — let alone be known — when the anchor
        // is fixed, killing the same-block announce+commit bypass. The commit
        // must then land inside [entryAt, entryAt + entryWindowSec]:
        // EntryInFuture until the anchor instant arrives, EntryTooStale after
        // the window — an announcement can never be aged into observed price
        // action. Unique semantics pin the evidence to the FIRST tick
        // at/after the anchor.
        {
            uint64 ann = announcedAt[a.debateHash];
            if (ann == 0) revert AnnounceRequired();
            if (a.entryAt != ann + MIN_ENTRY_DELAY_SEC) revert EntryAnchorMismatch();
        }
        if (a.entryAt > block.timestamp) revert EntryInFuture();
        if (block.timestamp - a.entryAt > params.entryWindowSec) revert EntryTooStale();
        (OracleEvidence memory entryEv, uint256 refund) = _verifyAndPay(
            _entryUpdateData, feedId, a.entryAt, a.entryAt + params.entryWindowSec, params.confMaxBps
        );
        uint256 entryOracle1e8 = _toE8(entryEv.price, entryEv.expo);
        _requireWithinBand(a.entryPrice, entryOracle1e8, params.entryTolBps);

        // Fix (audit r2 external, Codex P1): the stop and target must sit on
        // the correct side of the ORACLE entry too, not just the reported one.
        // Otherwise a stop inside the entry tolerance band (above the oracle
        // entry, long) lets a challenger "prove" a stop-breach with a tick that
        // is still a GAIN against the verified entry — a fabricated LOSS.
        // With this gate, any tick crossing the stop is a genuine oracle-loss.
        {
            bool isLong = a.stopPrice < a.entryPrice;
            if (isLong ? uint256(a.stopPrice) >= entryOracle1e8 : uint256(a.stopPrice) <= entryOracle1e8) {
                revert InvalidDirection();
            }
            if (a.targetPrice > 0) {
                if (isLong ? uint256(a.targetPrice) <= entryOracle1e8 : uint256(a.targetPrice) >= entryOracle1e8) {
                    revert InvalidDirection();
                }
            }
        }

        delete announcedAt[a.debateHash]; // consumed — gas refund + hygiene
        _storeCommitment(a, PriceMode.VERIFIED, feedId, entryEv);
        _refund(refund);
    }

    function _storeCommitment(
        CommitArgs memory a,
        PriceMode mode,
        bytes32 feedId,
        OracleEvidence memory entryEv
    ) internal {
        uint256 commitId = commitments.length;
        commitments.push();
        Commitment storage c = commitments[commitId];
        c.debateHash = a.debateHash;
        c.entryPrice = a.entryPrice;
        c.targetPrice = a.targetPrice;
        c.committedAt = uint64(block.timestamp);
        c.stopPrice = a.stopPrice;
        c.recorder = msg.sender;
        c.minResolveAt = uint64(block.timestamp + minCommitAge);
        c.agent = a.agent;
        c.conviction = a.conviction;
        c.resolved = false;
        c.mode = mode;
        // Params snapshot (M-02 lesson, contract-wide). `params` cannot change
        // within this tx, so reading storage here equals the values validated
        // by the verified path above.
        c.entryWindowSec = params.entryWindowSec;
        c.exitWindowSec = params.exitWindowSec;
        c.maxExitLagSec = params.maxExitLagSec;
        c.challengeWindowSec = params.challengeWindowSec;
        c.entryTolBps = params.entryTolBps;
        c.exitTolBps = params.exitTolBps;
        c.confMaxBps = params.confMaxBps;
        c.entryEvidence = entryEv;
        c.symbol = a.symbol;

        commitIndex[a.debateHash] = commitId + 1;
        pendingCount++;
        if (mode == PriceMode.VERIFIED) pendingVerified++; else pendingAttested++;

        _emitCommitted(commitId, feedId, a.entryAt);
    }

    // ============================================================
    //  PHASE 2: RESOLVE
    // ============================================================

    /// @dev Intentionally NOT `whenNotPaused` (audit Base r5): settlement of
    ///      commitments already made is never pausable.
    function resolveTrade(
        bytes32 _debateHash,
        int256 _pnlBps,
        Result _result,
        uint96 _exitPrice,
        uint64 _exitAt,
        bytes[] calldata _exitUpdateData
    ) external payable onlyBobby nonReentrant {
        uint256 stored = commitIndex[_debateHash];
        require(stored != 0, "No commitment found");
        require(_result != Result.PENDING, "Cannot resolve as pending");
        require(_result != Result.EXPIRED, "Use expireCommitment()");
        require(_exitPrice > 0, "Exit price required");

        Commitment storage c = commitments[stored - 1];
        require(!c.resolved, "Already resolved");
        require(block.timestamp >= c.minResolveAt, "Too soon to resolve");
        require(block.timestamp <= c.committedAt + MAX_COMMITMENT_TTL, "Commitment expired, use expireCommitment()");

        OracleEvidence memory exitEv;
        uint256 refund;
        // V-05: for VERIFIED trades the STORED PnL is the oracle-derived value,
        // not the recorder-reported one — otherwise the ±PNL_TOLERANCE_BPS band
        // becomes a systematic bias knob on totalPnlBpsVerified. The reported
        // _pnlBps is only checked (sign + tolerance) inside _resolveVerified,
        // never stored. ATTESTED keeps the reported value (v1 semantics).
        int256 recordedPnl = _pnlBps;
        uint64 challengeDeadline;

        if (c.mode == PriceMode.VERIFIED) {
            (exitEv, refund, recordedPnl) = _resolveVerified(c, _pnlBps, _result, _exitPrice, _exitAt, _exitUpdateData);
            challengeDeadline = uint64(block.timestamp) + c.challengeWindowSec;
        } else {
            if (_exitUpdateData.length != 0) revert AttestedNoEvidence();
            if (msg.value != 0) revert AttestedNoValue();
            _checkAttestedCoherence(c, _pnlBps, _result, _exitPrice);
        }

        c.resolved = true;
        pendingCount--;

        uint256 tradeId = trades.length;
        trades.push();
        tradeIndex[_debateHash] = tradeId + 1;
        Trade storage t = trades[tradeId];
        t.debateHash = _debateHash;
        t.entryPrice = c.entryPrice;
        t.exitPrice = _exitPrice;
        t.committedAt = c.committedAt;
        t.resolvedAt = uint64(block.timestamp);
        t.recorder = msg.sender;
        t.agent = c.agent;
        t.conviction = c.conviction;
        t.result = _result;
        t.mode = c.mode;
        t.pnlBps = recordedPnl;
        t.exitAt = c.mode == PriceMode.VERIFIED ? _exitAt : uint64(block.timestamp);
        t.challengeDeadline = challengeDeadline;
        t.stopChallenged = false;
        t.entryEvidence = c.entryEvidence;
        t.exitEvidence = exitEv;
        t.symbol = c.symbol;

        _applyResolutionStats(c.mode, c.agent, _result, recordedPnl);
        _emitResolved(tradeId);

        if (c.mode == PriceMode.VERIFIED) {
            _sanityCheck(_debateHash, keccak256(bytes(c.symbol)), _ev1e8(t.exitEvidence));
        }

        _refund(refund);
    }

    /// @dev Verified-leg validation, isolated to keep resolveTrade's stack flat.
    function _resolveVerified(
        Commitment storage c,
        int256 _pnlBps,
        Result _result,
        uint96 _exitPrice,
        uint64 _exitAt,
        bytes[] calldata _exitUpdateData
    ) internal returns (OracleEvidence memory exitEv, uint256 refund, int256 verifiedPnlBps) {
        if (_exitUpdateData.length == 0) revert ExitProofRequired();
        // S-01a: the declared exit must be recent — no retroactive cherry-pick.
        if (_exitAt < c.minResolveAt) revert ExitBeforeMinResolve();
        if (_exitAt > block.timestamp) revert ExitInFuture();
        if (block.timestamp - _exitAt > c.maxExitLagSec) revert ExitTooStale();

        // M-02 / A1-1: the exit verifies against the feed snapshotted at
        // commit, as the FIRST tick at/after the declared _exitAt (canonical
        // Pyth benchmark pattern — same shape the challenge already uses with
        // its declared anchor). Unique semantics stay deterministic here
        // because minT is the caller-declared instant, not derived from
        // block.timestamp. Causality: minResolveAt > committedAt ≥ entry
        // publishTime, so pt ≥ _exitAt ≥ minResolveAt is always post-entry.
        (exitEv, refund) = _verifyAndPay(
            _exitUpdateData, c.entryEvidence.feedId, _exitAt, _exitAt + c.exitWindowSec, c.confMaxBps
        );
        _requireWithinBand(_exitPrice, _toE8(exitEv.price, exitEv.expo), c.exitTolBps);

        // S-02: classification derives from oracle-vs-oracle. Tolerances never
        // decide the sign. Isolated in a helper to keep this frame flat.
        verifiedPnlBps = _classifyVerified(
            c.stopPrice < c.entryPrice,
            _toE8(c.entryEvidence.price, c.entryEvidence.expo),
            _toE8(exitEv.price, exitEv.expo),
            _result,
            _pnlBps
        );
    }

    /// @dev Oracle-derived classification + reported-PnL coherence, returning
    ///      the oracle PnL that will be STORED (V-05).
    function _classifyVerified(
        bool isLong,
        uint256 entry1e8,
        uint256 exit1e8,
        Result _result,
        int256 _pnlBps
    ) internal pure returns (int256 verifiedPnlBps) {
        verifiedPnlBps = _pnlFromOracle(isLong, entry1e8, exit1e8);

        if (verifiedPnlBps > 0) {
            if (_result != Result.WIN) revert ResultContradictsOracle();
            if (_pnlBps <= 0) revert PnlSignMismatch();
        } else if (verifiedPnlBps < 0) {
            if (_result != Result.LOSS) revert ResultContradictsOracle();
            if (_pnlBps >= 0) revert PnlSignMismatch();
        } else {
            if (_result != Result.BREAK_EVEN) revert ResultContradictsOracle();
            if (_pnlBps != 0) revert PnlSignMismatch();
        }

        int256 deviation = _pnlBps - verifiedPnlBps;
        if (deviation < 0) deviation = -deviation;
        if (deviation > PNL_TOLERANCE_BPS) revert PnlOutOfTolerance();
    }

    /// @dev v1 coherence + derivation, VERBATIM strings (regression-pinned).
    function _checkAttestedCoherence(
        Commitment storage c,
        int256 _pnlBps,
        Result _result,
        uint96 _exitPrice
    ) internal view {
        if (_result == Result.WIN) {
            require(_pnlBps > 0, "WIN must have positive PnL");
        } else if (_result == Result.LOSS) {
            require(_pnlBps < 0, "LOSS must have negative PnL");
        } else if (_result == Result.BREAK_EVEN) {
            require(_pnlBps == 0, "BREAK_EVEN must have zero PnL");
        }

        bool isLong = c.targetPrice > 0
            ? c.targetPrice > c.entryPrice
            : c.stopPrice < c.entryPrice;
        int256 entry = int256(uint256(c.entryPrice));
        int256 exitP = int256(uint256(_exitPrice));
        int256 computedPnlBps = isLong
            ? ((exitP - entry) * 10000) / entry
            : ((entry - exitP) * 10000) / entry;

        if (computedPnlBps > 0) {
            require(_result == Result.WIN, "Prices imply WIN");
        } else if (computedPnlBps < 0) {
            require(_result == Result.LOSS, "Prices imply LOSS");
        } else {
            require(_result == Result.BREAK_EVEN, "Prices imply BREAK_EVEN");
        }

        int256 deviation = _pnlBps - computedPnlBps;
        if (deviation < 0) deviation = -deviation;
        require(deviation <= PNL_TOLERANCE_BPS, "PnL not derivable from prices");
    }

    // ============================================================
    //  EXPIRE — permissionless, no oracle (v1 semantics + mode ledgers)
    // ============================================================

    /// @dev V-04: nonReentrant. The shared lock is per-contract, so guarding
    ///      this closes the TTL-boundary window where a compromised Pyth could
    ///      reenter here mid-resolve and double-count a commitment.
    function expireCommitment(bytes32 _debateHash) external nonReentrant {
        uint256 stored = commitIndex[_debateHash];
        require(stored != 0, "No commitment found");

        uint256 cIdx = stored - 1;
        Commitment storage c = commitments[cIdx];
        require(!c.resolved, "Already resolved");
        // A1-2: STRICTLY greater — at exactly TTL the pending-challenge branch
        // is still open (it uses >), so an expiry tx can no longer front-run
        // an in-flight challenge in the boundary block.
        require(block.timestamp > c.committedAt + MAX_COMMITMENT_TTL, "Not yet expired");

        c.resolved = true;
        pendingCount--;

        uint256 tradeId = trades.length;
        trades.push();
        tradeIndex[_debateHash] = tradeId + 1;
        Trade storage t = trades[tradeId];
        t.debateHash = _debateHash;
        t.entryPrice = c.entryPrice;
        t.exitPrice = c.entryPrice; // No price change on expiry (v1)
        t.committedAt = c.committedAt;
        t.resolvedAt = uint64(block.timestamp);
        t.recorder = msg.sender;
        t.agent = c.agent;
        t.conviction = c.conviction;
        t.result = Result.EXPIRED;
        t.mode = c.mode;
        // M-06: evidence stays zeroed on the permissionless path — the
        // commitment row (with its entry evidence) persists on-chain and the
        // manifest reconstructs coverage from there. exitAt/deadline zero.
        t.symbol = c.symbol;

        if (c.mode == PriceMode.VERIFIED) {
            expiredVerified++;
            pendingVerified--;
        } else {
            expiredAttested++;
            pendingAttested--;
        }
        agentTradesByMode[c.agent][c.mode]++;

        emit TradeResolved(
            tradeId, c.symbol, c.agent, Result.EXPIRED, 0, c.conviction, _debateHash,
            c.mode, 0, 0, 0
        );
        emit CommitmentExpired(cIdx, _debateHash, c.symbol);
    }

    // ============================================================
    //  CHALLENGE — permissionless stop-breach proof (spec §3.4)
    // ============================================================

    /// @notice Prove, with a signed oracle update, that the committed stop was
    ///         crossed during the trade's life. A pending trade resolves as
    ///         LOSS at the stop; a resolved WIN/BREAK_EVEN inside its finality
    ///         window is reclassified to LOSS at the stop. These semantics are
    ///         safe against fabricated losses because commit-time validation
    ///         (audit r2 external, Codex P1) requires the stop to sit strictly
    ///         on the loss side of the ORACLE entry as well as the reported
    ///         one — any tick that crosses the stop is therefore a genuine
    ///         loss against the verified entry, and the loss magnitude is
    ///         derived from the oracle entry (never the reported one).
    /// @param _anchorTs the challenger's search anchor: the update must be the
    ///        first tick at/after it (Unique semantics make that tick
    ///        deterministic — the challenger picks WHERE to look, never WHAT
    ///        is found).
    function challengeStopBreach(
        bytes32 _debateHash,
        uint64 _anchorTs,
        bytes[] calldata _breachUpdateData
    ) external payable nonReentrant {
        uint256 stored = commitIndex[_debateHash];
        require(stored != 0, "No commitment found");
        Commitment storage c = commitments[stored - 1];
        if (c.mode != PriceMode.VERIFIED) revert ChallengeNotVerified();

        bool isLong = c.stopPrice < c.entryPrice;
        uint64 maxT;
        uint256 tradeId;
        bool wasResolved = c.resolved;

        if (!wasResolved) {
            // Pending: challengeable until the TTL (then expiry takes over).
            if (block.timestamp > c.committedAt + MAX_COMMITMENT_TTL) revert ChallengeWindowClosed();
            maxT = uint64(block.timestamp);
        } else {
            tradeId = tradeIndex[_debateHash] - 1; // O(1) (audit r1 fix 2)
            Trade storage t = trades[tradeId];
            // AlreadyChallenged first: a reclassified trade is LOSS, which
            // would otherwise mask the more precise error.
            if (t.stopChallenged) revert AlreadyChallenged();
            if (t.result != Result.WIN && t.result != Result.BREAK_EVEN) revert ChallengeNotApplicable();
            if (block.timestamp > t.challengeDeadline) revert ChallengeWindowClosed();
            maxT = t.exitAt;
        }

        // A2-1: the breach must have happened AFTER the position opened — and
        // with the entry now Unique-anchored at a declared _entryAt, "opened"
        // is the entry evidence's publishTime, not committedAt. Flooring at
        // committedAt (audit r1) left the [entry tick, committedAt] interval
        // unchallengeable; a genuine stop-cross there is a real oracle-loss
        // because the commit gate already forces the stop onto the loss side
        // of the ORACLE entry.
        if (_anchorTs < c.entryEvidence.publishTime || _anchorTs > maxT) {
            revert ChallengeAnchorOutOfRange();
        }

        (OracleEvidence memory breachEv, uint256 refund) =
            _verifyAndPay(_breachUpdateData, c.entryEvidence.feedId, _anchorTs, maxT, c.confMaxBps);

        uint256 breach1e8 = _toE8(breachEv.price, breachEv.expo);
        if (isLong ? breach1e8 > uint256(c.stopPrice) : breach1e8 < uint256(c.stopPrice)) {
            revert NoBreach();
        }

        if (!wasResolved) {
            _challengeResolvePending(c, _debateHash, breachEv);
        } else {
            _reclassifyToStopLoss(tradeId, _debateHash, _stopLossBps(c), breachEv);
        }

        emit StopBreachChallenged(
            _debateHash, msg.sender, breachEv.publishTime, breach1e8, wasResolved
        );

        _refund(refund);
    }

    /// @dev Loss magnitude at the stop, derived from the ORACLE entry (audit
    ///      r2 external, Codex P1 — never the reported entry, which could
    ///      shrink the loss by the tolerance band). Commit-time validation
    ///      guarantees the stop sits strictly on the loss side of the oracle
    ///      entry, so the sign is structurally negative; the −1 bp floor only
    ///      covers integer truncation on ultra-tight stops (V-06).
    function _stopLossBps(Commitment storage c) internal view returns (int256) {
        uint256 entryOracle1e8 = _toE8(c.entryEvidence.price, c.entryEvidence.expo);
        int256 entry = int256(entryOracle1e8);
        int256 stopP = int256(uint256(c.stopPrice));
        int256 bps = c.stopPrice < c.entryPrice
            ? ((stopP - entry) * 10000) / entry
            : ((entry - stopP) * 10000) / entry;
        return bps < 0 ? bps : int256(-1);
    }

    /// @dev Challenge of a PENDING commitment: resolves it as LOSS at the stop
    ///      with the breach tick as exit evidence. Final immediately.
    function _challengeResolvePending(
        Commitment storage c,
        bytes32 _debateHash,
        OracleEvidence memory breachEv
    ) internal {
        int256 lossBps = _stopLossBps(c);
        c.resolved = true;
        pendingCount--;

        uint256 tradeId = trades.length;
        trades.push();
        tradeIndex[_debateHash] = tradeId + 1;
        Trade storage tn = trades[tradeId];
        tn.debateHash = _debateHash;
        tn.entryPrice = c.entryPrice;
        tn.exitPrice = c.stopPrice;
        tn.committedAt = c.committedAt;
        tn.resolvedAt = uint64(block.timestamp);
        tn.recorder = msg.sender;
        tn.agent = c.agent;
        tn.conviction = c.conviction;
        tn.result = Result.LOSS;
        tn.mode = PriceMode.VERIFIED;
        tn.pnlBps = lossBps;
        tn.exitAt = breachEv.publishTime;
        tn.challengeDeadline = 0; // a proven stop-out is final
        tn.stopChallenged = true;
        tn.entryEvidence = c.entryEvidence;
        tn.exitEvidence = breachEv;
        tn.symbol = c.symbol;

        _applyResolutionStats(PriceMode.VERIFIED, c.agent, Result.LOSS, lossBps);
        _emitResolved(tradeId);
    }

    /// @dev Challenge of a resolved WIN/BREAK_EVEN inside its finality window:
    ///      reclassifies to LOSS at the stop, adjusting the verified ledgers.
    function _reclassifyToStopLoss(
        uint256 tradeId,
        bytes32 _debateHash,
        int256 lossBps,
        OracleEvidence memory breachEv
    ) internal {
        Trade storage t = trades[tradeId];
        Result oldResult = t.result;
        int256 oldPnl = t.pnlBps;

        if (oldResult == Result.WIN) {
            winsVerified--;
            agentWinsByMode[t.agent][PriceMode.VERIFIED]--;
        }
        // BREAK_EVEN sat in neither ledger — only losses grows in both cases.
        lossesVerified++;
        agentLossesByMode[t.agent][PriceMode.VERIFIED]++;
        totalPnlBpsVerified += lossBps - oldPnl;

        t.result = Result.LOSS;
        t.pnlBps = lossBps;
        t.stopChallenged = true;
        // Fix (audit r2 P2): a proven stop-out is FINAL — it can never be
        // re-challenged (stopChallenged latch). Zero the deadline so isFinal()
        // reports it final immediately, consistent with _challengeResolvePending.
        t.challengeDeadline = 0;
        // Fix (audit r1): the reclassified row must carry COHERENT exit
        // evidence — the stop-breach tick and the stop price, not the stale WIN
        // exit. Otherwise a reader sees a LOSS whose exitPrice/exitEvidence
        // still describe the favorable tick that was just invalidated.
        t.exitPrice = commitments[commitIndex[_debateHash] - 1].stopPrice;
        t.exitEvidence = breachEv;
        t.exitAt = breachEv.publishTime;

        emit TradeReclassified(
            tradeId, _debateHash, oldResult, Result.LOSS, oldPnl, lossBps, "stop-breach"
        );
    }

    // ============================================================
    //  Shared internals
    // ============================================================

    /// @dev Spec §3.0 normalization — validated against real Pyth data in the
    ///      PoC. Reverts on non-positive price or out-of-range expo; never
    ///      assumes expo == -8.
    function _toE8(int64 price, int32 expo) internal pure returns (uint256 oracle1e8) {
        if (price <= 0) revert NonPositivePrice();
        if (expo < -18 || expo > 0) revert UnexpectedExpo();
        int32 shift = expo + 8;
        oracle1e8 = shift >= 0
            ? uint256(uint64(price)) * 10 ** uint32(shift)
            : uint256(uint64(price)) / 10 ** uint32(uint32(-shift));
        if (oracle1e8 == 0) revert NonPositivePrice();
    }

    function _requireWithinBand(uint256 reported, uint256 oracle1e8, uint16 tolBps) internal pure {
        uint256 diff = reported > oracle1e8 ? reported - oracle1e8 : oracle1e8 - reported;
        if (diff * 10_000 / oracle1e8 > tolBps) revert PriceOutOfBand();
    }

    function _pnlFromOracle(bool isLong, uint256 entry1e8, uint256 exit1e8)
        internal
        pure
        returns (int256)
    {
        int256 e = int256(entry1e8);
        int256 x = int256(exit1e8);
        return isLong ? ((x - e) * 10_000) / e : ((e - x) * 10_000) / e;
    }

    /// @dev Parse exactly ONE update through the active Pyth, charge the exact
    ///      fee, enforce conf gate, and return the evidence + refund owed.
    ///
    ///      A1-1/A2-1: ALWAYS Unique semantics — "the first tick at/after
    ///      minT" (prevPublishTime < minT). That is only satisfiable when minT
    ///      is a CALLER-DECLARED anchor, which is exactly what the Hermes
    ///      benchmark endpoint returns; deriving minT from block.timestamp is
    ///      unsatisfiable on ~1 Hz feeds (prev ≈ pt-1s). All three surfaces
    ///      now anchor this way: entry at _entryAt, exit at _exitAt, challenge
    ///      at _anchorTs — deterministic evidence given the declared instant.
    function _verifyAndPay(
        bytes[] calldata updateData,
        bytes32 feedId,
        uint64 minT,
        uint64 maxT,
        uint16 confMaxBps
    ) internal returns (OracleEvidence memory ev, uint256 refund) {
        address pyth = activePyth;
        if (pyth == address(0)) revert NoPythActive();
        // A-03: exactly one update — narrows any within-window ambiguity to
        // the single deterministic tick Unique semantics can prove.
        if (updateData.length != 1) revert ProofMustBeSingleUpdate();

        uint256 fee = IPyth(pyth).getUpdateFee(updateData);
        if (msg.value < fee) revert InsufficientFee();
        refund = msg.value - fee;

        bytes32[] memory ids = new bytes32[](1);
        ids[0] = feedId;
        PythStructs.PriceFeed[] memory feeds =
            IPyth(pyth).parsePriceFeedUpdatesUnique{value: fee}(updateData, ids, minT, maxT);

        // V-07: assert the returned feed is the requested one. An honest Pyth
        // guarantees this; a compromised one (the reason for the allowlist) is
        // one substitution short of returning another asset's price for a
        // matching id. Cheap defense-in-depth.
        if (feeds[0].id != feedId) revert InvalidFeed();

        PythStructs.Price memory pr = feeds[0].price;
        if (pr.publishTime > type(uint64).max) revert TimestampOverflow(); // C-02c defensive downcast
        if (pr.price <= 0) revert NonPositivePrice();
        if (uint256(pr.conf) * 10_000 / uint256(uint64(pr.price)) > confMaxBps) revert ConfTooWide();

        ev = OracleEvidence({
            feedId: feeds[0].id,
            price: pr.price,
            conf: pr.conf,
            expo: pr.expo,
            publishTime: uint64(pr.publishTime)
        });
    }

    /// @dev Oracle price of an evidence row, or 0 when the leg carries none
    ///      (attested / expired). Never reverts on empty evidence.
    function _ev1e8(OracleEvidence storage ev) internal view returns (uint256) {
        return ev.price > 0 ? _toE8(ev.price, ev.expo) : 0;
    }

    /// @dev Emits from storage to keep caller frames flat (stack discipline —
    ///      the 11-arg event plus live locals exceeds 16 slots otherwise).
    function _emitResolved(uint256 tradeId) internal {
        Trade storage t = trades[tradeId];
        emit TradeResolved(
            tradeId, t.symbol, t.agent, t.result, t.pnlBps, t.conviction, t.debateHash,
            t.mode, t.exitAt, _ev1e8(t.exitEvidence), t.exitEvidence.publishTime
        );
    }

    function _emitCommitted(uint256 commitId, bytes32 feedId, uint64 entryAt) internal {
        Commitment storage c = commitments[commitId];
        emit TradeCommitted(
            commitId, c.symbol, c.agent, c.conviction, c.entryPrice, c.debateHash,
            c.mode, feedId, _ev1e8(c.entryEvidence), c.entryEvidence.publishTime,
            entryAt
        );
    }

    function _applyResolutionStats(PriceMode mode, Agent agent, Result result, int256 pnl) internal {
        if (mode == PriceMode.VERIFIED) {
            resolvedVerified++;
            pendingVerified--;
            totalPnlBpsVerified += pnl;
            if (result == Result.WIN) { winsVerified++; agentWinsByMode[agent][mode]++; }
            else if (result == Result.LOSS) { lossesVerified++; agentLossesByMode[agent][mode]++; }
        } else {
            resolvedAttested++;
            pendingAttested--;
            totalPnlBpsAttested += pnl;
            if (result == Result.WIN) { winsAttested++; agentWinsByMode[agent][mode]++; }
            else if (result == Result.LOSS) { lossesAttested++; agentLossesByMode[agent][mode]++; }
        }
        agentTradesByMode[agent][mode]++;
    }

    /// @dev Non-blocking Chainlink cross-check (spec 5b.7 / C-06). Fix (audit
    ///      r1): TRULY fail-open. The whole comparison — external call AND its
    ///      arithmetic — runs inside `_sanityProbe`, called via try/catch, so
    ///      ANY revert (aggregator revert, `updatedAt`/`diff` overflow from a
    ///      malicious feed, division edge) is swallowed and can never take the
    ///      resolve down. A bare inline try only catches the call, not the math
    ///      after it — that was the gap.
    function _sanityCheck(bytes32 debateHash, bytes32 symbolHash, uint256 oracle1e8) internal {
        address agg = sanityFeedOf[symbolHash];
        if (agg == address(0)) return;
        try this._sanityProbe(agg, oracle1e8) returns (bool discrepant, uint256 cl) {
            if (discrepant) emit OracleDiscrepancy(debateHash, oracle1e8, cl);
        } catch {}
    }

    /// @dev External so the try/catch above covers its full body. Self-call
    ///      only (view; the guard blocks any external caller from spoofing it).
    function _sanityProbe(address agg, uint256 oracle1e8)
        external
        view
        returns (bool discrepant, uint256 cl)
    {
        require(msg.sender == address(this), "self-only");
        (, int256 answer, , uint256 updatedAt, ) = IAggregatorV3(agg).latestRoundData();
        if (answer <= 0) return (false, 0);
        if (block.timestamp > updatedAt + SANITY_MAX_STALENESS) return (false, 0);
        cl = uint256(answer); // decimals()==8 asserted at setSanityFeed
        uint256 diff = oracle1e8 > cl ? oracle1e8 - cl : cl - oracle1e8;
        discrepant = diff * 10_000 / cl > SANITY_BAND_BPS;
    }

    /// @dev Refund excess msg.value LAST (CEI). A failed refund is retained
    ///      and swept by the owner — never a revert (S-08 / spec §6.3).
    function _refund(uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) {
            retainedFees += amount;
            emit RefundRetained(msg.sender, amount);
        }
    }

    /// @dev Symbol charset gate (spec §3.0): ASCII [A-Z0-9], 2..10 bytes.
    function _validSymbolHash(string memory s) internal pure returns (bytes32) {
        bytes memory b = bytes(s);
        if (b.length < 2 || b.length > 10) revert InvalidSymbol();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 ch = b[i];
            bool ok = (ch >= 0x30 && ch <= 0x39) || (ch >= 0x41 && ch <= 0x5A);
            if (!ok) revert InvalidSymbol();
        }
        return keccak256(b);
    }

    // ============================================================
    //  Views
    // ============================================================

    function totalTrades() external view returns (uint256) { return trades.length; }
    function totalCommitments() external view returns (uint256) { return commitments.length; }

    function getCommitment(uint256 _id) external view returns (Commitment memory) {
        return commitments[_id];
    }

    function getTrade(uint256 _id) external view returns (Trade memory) {
        return trades[_id];
    }

    /// @dev D-1: headline rates exist ONLY per mode. There is deliberately no
    ///      function that combines them.
    function getVerifiedWinRate() external view returns (uint256) {
        uint256 decided = winsVerified + lossesVerified;
        return decided == 0 ? 0 : (winsVerified * 10000) / decided;
    }

    function getAttestedWinRate() external view returns (uint256) {
        uint256 decided = winsAttested + lossesAttested;
        return decided == 0 ? 0 : (winsAttested * 10000) / decided;
    }

    function getVerifiedDecidedCount() external view returns (uint256) {
        return winsVerified + lossesVerified;
    }

    function getAttestedDecidedCount() external view returns (uint256) {
        return winsAttested + lossesAttested;
    }

    /// @dev S-04: coverage is a first-class stat — expiry ratios are published
    ///      next to the win rate, never buried.
    function getCoverage(PriceMode mode)
        external
        view
        returns (uint256 resolved_, uint256 expired_, uint256 pending_)
    {
        if (mode == PriceMode.VERIFIED) return (resolvedVerified, expiredVerified, pendingVerified);
        return (resolvedAttested, expiredAttested, pendingAttested);
    }

    function getAgentStats(Agent _agent, PriceMode _mode)
        external
        view
        returns (uint256 _wins, uint256 _losses, uint256 _total, uint256 _winRate)
    {
        _wins = agentWinsByMode[_agent][_mode];
        _losses = agentLossesByMode[_agent][_mode];
        _total = agentTradesByMode[_agent][_mode];
        uint256 decided = _wins + _losses;
        _winRate = decided > 0 ? (_wins * 10000) / decided : 0;
    }

    /// @dev V-02 (Anthony's decision B): the win rate is NEVER exposed without
    ///      its coverage. A single call returns both, so a consumer physically
    ///      cannot render a headline rate while hiding a poor resolution/expiry
    ///      ratio. `resolutionBps` = resolved / (resolved+expired+pending) — a
    ///      low value is the on-chain red flag that off-chain reputation scoring
    ///      MUST penalize (it never auto-converts EXPIRED to LOSS).
    function getVerifiedScorecard()
        external
        view
        returns (
            uint256 winRateBps,
            uint256 decided,
            uint256 resolved_,
            uint256 expired_,
            uint256 pending_,
            uint256 resolutionBps
        )
    {
        decided = winsVerified + lossesVerified;
        winRateBps = decided == 0 ? 0 : (winsVerified * 10000) / decided;
        resolved_ = resolvedVerified;
        expired_ = expiredVerified;
        pending_ = pendingVerified;
        uint256 universe = resolved_ + expired_ + pending_;
        resolutionBps = universe == 0 ? 0 : (resolved_ * 10000) / universe;
    }

    /// @dev F-04: a result is final once its challenge window has elapsed
    ///      (or immediately, for outcomes that carry no window). O(1) lookup.
    function isFinal(bytes32 _debateHash) external view returns (bool) {
        uint256 tIdx = tradeIndex[_debateHash];
        if (tIdx == 0) return false;
        Trade storage t = trades[tIdx - 1];
        return t.challengeDeadline == 0 || block.timestamp > t.challengeDeadline;
    }

    function getRecentTrades(uint256 _count) external view returns (Trade[] memory) {
        uint256 len = trades.length;
        uint256 count = _count > len ? len : _count;
        if (count > MAX_RECENT) count = MAX_RECENT;
        Trade[] memory recent = new Trade[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = trades[len - count + i];
        }
        return recent;
    }

    function getRecentCommitments(uint256 _count) external view returns (Commitment[] memory) {
        uint256 len = commitments.length;
        uint256 count = _count > len ? len : _count;
        if (count > MAX_RECENT) count = MAX_RECENT;
        Commitment[] memory recent = new Commitment[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = commitments[len - count + i];
        }
        return recent;
    }

    // ============================================================
    //  Admin (owner = Safe on 8453)
    // ============================================================

    function setBobby(address _newBobby) external onlyOwner {
        require(_newBobby != address(0), "Invalid address");
        emit BobbyUpdated(bobby, _newBobby);
        bobby = _newBobby;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        pendingOwner = _newOwner;
        emit OwnershipTransferStarted(owner, _newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function setMinCommitAge(uint256 _newAge) external onlyOwner {
        require(_newAge >= MIN_COMMIT_AGE_FLOOR, "Below minimum floor");
        // Fix (audit r1): cap minCommitAge so `uint64(block.timestamp + minCommitAge)`
        // can never overflow, and so a commitment always stays resolvable
        // (minResolveAt must fall before committedAt + TTL).
        if (_newAge >= MAX_COMMITMENT_TTL) revert ParamsOutOfBounds();
        // A-08: the exit window may never cover pre-commit time.
        if (_newAge <= params.exitWindowSec) revert ParamsOutOfBounds();
        emit MinCommitAgeUpdated(minCommitAge, _newAge);
        minCommitAge = _newAge;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @dev Effect on FUTURE commitments only (M-02 lesson).
    function setParams(VerificationParams calldata _params) external onlyOwner {
        _validateParams(_params);
        params = _params;
        emit ParamsUpdated(_params);
    }

    function _validateParams(VerificationParams memory p) internal view {
        if (p.entryWindowSec < 10 || p.entryWindowSec > 600) revert ParamsOutOfBounds();
        if (p.exitWindowSec < 10 || p.exitWindowSec > 1800) revert ParamsOutOfBounds();
        // V-01: cap maxExitLag at 1h so the recorder's exit-tick sweep is at
        // most the last hour of real price action, not 24h. Deploy default 600s.
        if (p.maxExitLagSec < 300 || p.maxExitLagSec > 3600) revert ParamsOutOfBounds();
        // V-03: the challenge window MUST outlast the Pyth activation timelock,
        // so a revoke can always be recovered (activate a reviewed oracle within
        // 2 days) with challenge time to spare — the oracle "fallback" is the
        // re-activation path, not a second live oracle.
        if (p.challengeWindowSec <= PYTH_ACTIVATION_DELAY) revert ParamsOutOfBounds();
        if (p.challengeWindowSec > 30 days) revert ParamsOutOfBounds();
        if (p.entryTolBps < 10 || p.entryTolBps > 500) revert ParamsOutOfBounds();
        if (p.exitTolBps < 10 || p.exitTolBps > 500) revert ParamsOutOfBounds();
        if (p.confMaxBps < 10 || p.confMaxBps > 200) revert ParamsOutOfBounds();
        if (minCommitAge <= p.exitWindowSec) revert ParamsOutOfBounds(); // A-08
    }

    /// @dev Effect on FUTURE commitments only — pending ones hold their
    ///      snapshotted feed (M-02).
    function setFeed(string calldata _symbol, bytes32 _feedId) external onlyOwner {
        bytes32 h = _validSymbolHash(_symbol);
        feedOf[h] = _feedId;
        emit FeedSet(h, _symbol, _feedId);
    }

    function setSanityFeed(string calldata _symbol, address _aggregator) external onlyOwner {
        bytes32 h = _validSymbolHash(_symbol);
        if (_aggregator != address(0)) {
            // C-06c: assert once here, not per resolve. Unreachable/misbehaving
            // aggregators are rejected at configuration time.
            try IAggregatorV3(_aggregator).decimals() returns (uint8 d) {
                if (d != 8) revert SanityFeedBadDecimals();
            } catch {
                revert SanityFeedBadDecimals();
            }
        }
        sanityFeedOf[h] = _aggregator;
        emit SanityFeedSet(h, _symbol, _aggregator);
    }

    /// @dev F-05/S-07: approve only SCHEDULES — activation waits out a public
    ///      2-day timelock. A compromised owner needs two transactions and 48
    ///      monitored hours, not one tx.
    function approvePyth(address _pyth) external onlyOwner {
        if (_pyth == address(0)) revert ZeroAddress();
        if (_pyth.code.length == 0) revert NoCodeAtPyth();
        approvedPyth[_pyth] = true;
        uint64 at = uint64(block.timestamp) + PYTH_ACTIVATION_DELAY;
        pythActivatableAt[_pyth] = at;
        emit PythApproved(_pyth, at);
    }

    function activatePyth(address _pyth) external onlyOwner {
        if (!approvedPyth[_pyth]) revert PythNotApproved();
        if (block.timestamp < pythActivatableAt[_pyth]) revert TimelockNotElapsed();
        if (_pyth.code.length == 0) revert NoCodeAtPyth();
        activePyth = _pyth;
        emit PythActivated(_pyth);
    }

    /// @dev The VERIFIED "pause": revoking the active oracle makes verified
    ///      resolves revert until a reviewed oracle is activated. Settlement
    ///      itself is never pausable (r5).
    function revokePyth(address _pyth) external onlyOwner {
        approvedPyth[_pyth] = false;
        pythActivatableAt[_pyth] = 0;
        if (activePyth == _pyth) activePyth = address(0);
        emit PythRevoked(_pyth);
    }

    /// @dev M-08: sweeps the full balance — by construction it only ever holds
    ///      refunds whose delivery failed.
    function withdrawStuckFees(address payable _to) external onlyOwner {
        if (_to == address(0)) revert ZeroAddress();
        uint256 amount = address(this).balance;
        retainedFees = 0;
        (bool ok, ) = _to.call{value: amount}("");
        require(ok, "Withdraw failed");
        emit StuckFeesWithdrawn(_to, amount);
    }
}
