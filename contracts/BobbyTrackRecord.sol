// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title Bobby Agent Trader — On-Chain Track Record (Audited v4)
/// @notice Commit-reveal track record: predictions committed BEFORE outcomes known
/// @dev Deployed on X Layer (Chain ID 196) — the first verifiable AI trader
/// @dev Audit v2: Gemini (2026-03-17) — duplicates, gas, events, pause
/// @dev Audit v3: Codex (2026-03-17) — commit-reveal, invariants, Ownable2Step
/// @dev Audit v4: Gemini+Codex (2026-03-17) — struct packing, O(1) pending,
///      minCommitAge floor, EXPIRED invariant, commitment expiry, storage consolidation
/// @author Bobby Agent Trader × DeFi México

contract BobbyTrackRecord {

    // ---- Types ----

    enum Result { PENDING, WIN, LOSS, EXPIRED, BREAK_EVEN }
    enum Agent { CIO, ALPHA, REDTEAM }

    /// @dev Phase 1: Commitment — struct-packed for gas efficiency (Gemini v2)
    /// Slot 1: debateHash (32 bytes)
    /// Slot 2: entryPrice (12) + targetPrice (12) + committedAt (8) = 32
    /// Slot 3: stopPrice (12) + recorder (20) = 32
    /// Slot 4: minResolveAt (8) + agent (1) + conviction (1) + resolved (1) = 11 bytes
    /// Slot 5+: symbol (dynamic string pointer)
    struct Commitment {
        bytes32 debateHash;      // Slot 1
        uint96 entryPrice;       // Slot 2: price × 1e8 (max ~79B USD)
        uint96 targetPrice;      // Slot 2
        uint64 committedAt;      // Slot 2 (until year 584,942)
        uint96 stopPrice;        // Slot 3
        address recorder;        // Slot 3
        uint64 minResolveAt;     // Slot 4: Codex v2 — locks anti-backfill per commit
        Agent agent;             // Slot 4 (1 byte)
        uint8 conviction;        // Slot 4 (1 byte)
        bool resolved;           // Slot 4 (1 byte)
        string symbol;           // Slot 5+ (dynamic)
    }

    /// @dev Phase 2: Resolution — struct-packed
    /// Slot 1: debateHash (32)
    /// Slot 2: entryPrice (12) + exitPrice (12) + committedAt (8) = 32
    /// Slot 3: resolvedAt (8) + recorder (20) + agent (1) + conviction (1) + result (1) = 31
    /// Slot 4: pnlBps (32) — int256 needs full slot
    /// Slot 5+: symbol (dynamic)
    struct Trade {
        bytes32 debateHash;      // Slot 1
        uint96 entryPrice;       // Slot 2
        uint96 exitPrice;        // Slot 2
        uint64 committedAt;      // Slot 2
        uint64 resolvedAt;       // Slot 3
        address recorder;        // Slot 3
        Agent agent;             // Slot 3
        uint8 conviction;        // Slot 3
        Result result;           // Slot 3
        int256 pnlBps;           // Slot 4
        string symbol;           // Slot 5+
    }

    // ---- State ----

    address public owner;
    address public pendingOwner;
    address public bobby;
    bool public paused;

    /// @dev Anti-backfill: minimum time between commit and resolve
    uint256 public minCommitAge = 1 hours;

    /// @dev Gemini v2: enforce a floor so owner can't disable anti-backfill
    uint256 public constant MIN_COMMIT_AGE_FLOOR = 10 minutes;

    /// @dev Maximum time a commitment can stay unresolved before expiry
    uint256 public constant MAX_COMMITMENT_TTL = 30 days;

    Commitment[] public commitments;
    Trade[] public trades;
    uint256 public wins;
    uint256 public losses;
    int256 public totalPnlBps;

    /// @dev Gemini v2: consolidated — commitIndex[hash] = arrayIndex + 1
    /// Value 0 means "not committed". Eliminates commitExists mapping.
    mapping(bytes32 => uint256) public commitIndex;

    /// @dev Gemini v2: O(1) pending count instead of loop
    uint256 public pendingCount;

    mapping(Agent => uint256) public agentWins;
    mapping(Agent => uint256) public agentLosses;
    mapping(Agent => uint256) public agentTrades;

    uint256 public constant MAX_RECENT = 100;

    // ---- Events ----

    event TradeCommitted(
        uint256 indexed commitId,
        string symbol,
        Agent indexed agent,
        uint8 conviction,
        uint256 entryPrice,
        bytes32 indexed debateHash
    );

    event TradeResolved(
        uint256 indexed tradeId,
        string symbol,
        Agent indexed agent,
        Result result,
        int256 pnlBps,
        uint8 conviction,
        bytes32 indexed debateHash
    );

    event CommitmentExpired(
        uint256 indexed commitId,
        bytes32 indexed debateHash,
        string symbol
    );

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

    // ---- Constructor ----

    constructor(address _bobby) {
        require(_bobby != address(0), "Invalid bobby address");
        owner = msg.sender;
        bobby = _bobby;
        emit OwnershipTransferred(address(0), msg.sender);
        emit BobbyUpdated(address(0), _bobby);
    }

    // ============================================================
    //  PHASE 1: COMMIT — Before the outcome is known
    // ============================================================

    function commitTrade(
        bytes32 _debateHash,
        string calldata _symbol,
        Agent _agent,
        uint8 _conviction,
        uint96 _entryPrice,
        uint96 _targetPrice,
        uint96 _stopPrice
    ) external onlyBobby whenNotPaused {
        require(_debateHash != bytes32(0), "Invalid debate hash");
        /// @dev Gemini v2: consolidated check — 0 means not committed
        require(commitIndex[_debateHash] == 0, "Already committed");
        require(_conviction <= 10, "Conviction must be 0-10");
        require(_entryPrice > 0, "Entry price required");
        require(_targetPrice > 0 || _stopPrice > 0, "Target or stop required");

        /// @dev Codex v2 [P1]: lock minResolveAt per commitment so future
        /// changes to minCommitAge don't retroactively weaken older commits
        uint64 resolveAfter = uint64(block.timestamp + minCommitAge);

        commitments.push(Commitment({
            debateHash: _debateHash,
            symbol: _symbol,
            agent: _agent,
            conviction: _conviction,
            entryPrice: _entryPrice,
            targetPrice: _targetPrice,
            stopPrice: _stopPrice,
            committedAt: uint64(block.timestamp),
            minResolveAt: resolveAfter,
            recorder: msg.sender,
            resolved: false
        }));

        /// @dev Store index + 1 so that 0 remains the sentinel for "not found"
        uint256 commitId = commitments.length - 1;
        commitIndex[_debateHash] = commitId + 1;

        /// @dev Gemini v2: O(1) pending tracking
        pendingCount++;

        emit TradeCommitted(commitId, _symbol, _agent, _conviction, _entryPrice, _debateHash);
    }

    // ============================================================
    //  PHASE 2: RESOLVE — After the outcome is known
    // ============================================================

    function resolveTrade(
        bytes32 _debateHash,
        int256 _pnlBps,
        Result _result,
        uint96 _exitPrice
    ) external onlyBobby whenNotPaused {
        uint256 stored = commitIndex[_debateHash];
        require(stored != 0, "No commitment found");
        require(_result != Result.PENDING, "Cannot resolve as pending");
        require(_exitPrice > 0, "Exit price required");

        uint256 cIdx = stored - 1;
        Commitment storage c = commitments[cIdx];

        require(!c.resolved, "Already resolved");
        /// @dev Codex v2 [P1]: use per-commitment minResolveAt, not global
        require(block.timestamp >= c.minResolveAt, "Too soon to resolve");
        /// @dev Codex v3 [P1]: enforce hard TTL — no late resolutions
        require(block.timestamp <= c.committedAt + MAX_COMMITMENT_TTL, "Commitment expired, use expireCommitment()");

        /// @dev Coherence invariants (Codex Audit)
        if (_result == Result.WIN) {
            require(_pnlBps > 0, "WIN must have positive PnL");
        } else if (_result == Result.LOSS) {
            require(_pnlBps < 0, "LOSS must have negative PnL");
        } else if (_result == Result.BREAK_EVEN) {
            require(_pnlBps == 0, "BREAK_EVEN must have zero PnL");
        } else if (_result == Result.EXPIRED) {
            /// @dev Gemini v2: EXPIRED must have zero PnL
            require(_pnlBps == 0, "EXPIRED must have zero PnL");
        }

        c.resolved = true;
        pendingCount--;

        uint256 tradeId = trades.length;

        trades.push(Trade({
            debateHash: _debateHash,
            symbol: c.symbol,
            agent: c.agent,
            pnlBps: _pnlBps,
            conviction: c.conviction,
            result: _result,
            entryPrice: c.entryPrice,
            exitPrice: _exitPrice,
            committedAt: c.committedAt,
            resolvedAt: uint64(block.timestamp),
            recorder: msg.sender
        }));

        totalPnlBps += _pnlBps;

        if (_result == Result.WIN) {
            wins++;
            agentWins[c.agent]++;
        } else if (_result == Result.LOSS) {
            losses++;
            agentLosses[c.agent]++;
        }
        agentTrades[c.agent]++;

        emit TradeResolved(tradeId, c.symbol, c.agent, _result, _pnlBps, c.conviction, _debateHash);
    }

    // ============================================================
    //  EXPIRE — Clean up stale commitments (Gemini v2 Q5)
    // ============================================================

    /// @notice Expire a commitment that has been pending longer than MAX_COMMITMENT_TTL
    /// @dev Anyone can call this — permissionless cleanup of toxic state
    /// @dev Codex v3 [P2]: unified accounting — creates a Trade like resolveTrade does
    function expireCommitment(bytes32 _debateHash) external {
        uint256 stored = commitIndex[_debateHash];
        require(stored != 0, "No commitment found");

        uint256 cIdx = stored - 1;
        Commitment storage c = commitments[cIdx];

        require(!c.resolved, "Already resolved");
        require(block.timestamp >= c.committedAt + MAX_COMMITMENT_TTL, "Not yet expired");

        c.resolved = true;
        pendingCount--;

        /// @dev Codex v3 [P2]: create Trade record so accounting is unified
        /// Expired trades have zero PnL and don't affect wins/losses
        uint256 tradeId = trades.length;
        trades.push(Trade({
            debateHash: _debateHash,
            symbol: c.symbol,
            agent: c.agent,
            pnlBps: 0,
            conviction: c.conviction,
            result: Result.EXPIRED,
            entryPrice: c.entryPrice,
            exitPrice: c.entryPrice, // No price change on expiry
            committedAt: c.committedAt,
            resolvedAt: uint64(block.timestamp),
            recorder: msg.sender
        }));

        agentTrades[c.agent]++;

        emit TradeResolved(tradeId, c.symbol, c.agent, Result.EXPIRED, 0, c.conviction, _debateHash);
        emit CommitmentExpired(cIdx, _debateHash, c.symbol);
    }

    // ---- View Functions ----

    function totalTrades() external view returns (uint256) {
        return trades.length;
    }

    function totalCommitments() external view returns (uint256) {
        return commitments.length;
    }

    function getWinRate() external view returns (uint256) {
        uint256 total = trades.length;
        if (total == 0) return 0;
        return (wins * 10000) / total;
    }

    function getAgentStats(Agent _agent) external view returns (
        uint256 _wins, uint256 _losses, uint256 _total, uint256 _winRate
    ) {
        _wins = agentWins[_agent];
        _losses = agentLosses[_agent];
        _total = agentTrades[_agent];
        _winRate = _total > 0 ? (_wins * 10000) / _total : 0;
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

    // ---- Admin ----

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

    /// @dev Gemini v2: enforce minimum floor of 10 minutes
    function setMinCommitAge(uint256 _newAge) external onlyOwner {
        require(_newAge >= MIN_COMMIT_AGE_FLOOR, "Below minimum floor");
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
}
