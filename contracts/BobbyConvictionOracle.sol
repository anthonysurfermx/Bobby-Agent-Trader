// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title Bobby Conviction Oracle — On-Chain AI Decision Feed (Audited v2)
/// @notice Other protocols call getConviction("BTC") before executing strategies
/// @dev Deployed on X Layer (Chain ID 196)
/// @dev Audit v1: internal review
/// @dev Audit v2: Gemini (2026-03-17) — struct packing, no on-chain history,
///      circular buffer eliminated, defensive getConviction, cooldown, pagination
/// @author Bobby Agent Trader × DeFi México

contract BobbyConvictionOracle {

    enum Direction { NEUTRAL, LONG, SHORT }
    enum Agent { CIO, ALPHA, REDTEAM }

    /// @dev Struct-packed signal — 3 storage slots + dynamic string
    /// Slot 1: debateHash (32 bytes)
    /// Slot 2: entryPrice (12) + targetPrice (12) + timestamp (8) = 32
    /// Slot 3: stopPrice (12) + expiresAt (8) + direction (1) + conviction (1) + agent (1) = 23
    /// Slot 4+: symbol (dynamic)
    struct Signal {
        bytes32 debateHash;      // Slot 1
        uint96 entryPrice;       // Slot 2: price × 1e8
        uint96 targetPrice;      // Slot 2
        uint64 timestamp;        // Slot 2
        uint96 stopPrice;        // Slot 3
        uint64 expiresAt;        // Slot 3
        Direction direction;     // Slot 3 (1 byte)
        uint8 conviction;        // Slot 3 (1 byte)
        Agent agent;             // Slot 3 (1 byte)
        string symbol;           // Slot 4+ (dynamic)
    }

    // ---- State ----

    address public owner;
    address public pendingOwner;
    address public bobby;
    bool public paused;

    /// @dev Latest signal per symbol hash
    mapping(bytes32 => Signal) internal _latestSignal;

    /// @dev Symbol hash → human-readable symbol (for enumeration)
    mapping(bytes32 => string) public symbolName;

    /// @dev All symbol hashes that have been signaled
    bytes32[] public symbolHashes;

    /// @dev Consolidated: symbolIndex[hash] = arrayIndex + 1 (0 = not exists)
    mapping(bytes32 => uint256) public symbolIndex;

    /// @dev Default signal TTL (24 hours)
    uint256 public defaultTTL = 24 hours;

    /// @dev Gemini v2: minimum cooldown between signals for same symbol
    uint256 public signalCooldown = 10 minutes;

    // ---- Events ----

    /// @dev History is reconstructed from events, NOT stored on-chain (Gemini v2)
    event SignalPublished(
        bytes32 indexed symbolHash,
        string symbol,
        Direction direction,
        uint8 conviction,
        Agent indexed agent,
        uint96 entryPrice,
        bytes32 indexed debateHash
    );

    event BobbyUpdated(address indexed oldBobby, address indexed newBobby);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

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
        require(!paused, "Paused");
        _;
    }

    // ---- Constructor ----

    constructor(address _bobby) {
        require(_bobby != address(0), "Invalid bobby");
        owner = msg.sender;
        bobby = _bobby;
        emit OwnershipTransferred(address(0), msg.sender);
        emit BobbyUpdated(address(0), _bobby);
    }

    // ============================================================
    //  PUBLISH SIGNAL
    // ============================================================

    /// @dev Input struct to avoid stack-too-deep (9 params)
    struct SignalInput {
        string symbol;
        Direction direction;
        uint8 conviction;
        Agent agent;
        uint96 entryPrice;
        uint96 targetPrice;
        uint96 stopPrice;
        bytes32 debateHash;
        uint256 ttl;
    }

    /// @notice Publish Bobby's conviction on an asset
    function publishSignal(SignalInput calldata _input) external onlyBobby whenNotPaused {
        require(_input.conviction <= 10, "Conviction 0-10");
        require(bytes(_input.symbol).length > 0, "Empty symbol");
        require(_input.entryPrice > 0, "Entry price required");

        bytes32 symHash = keccak256(bytes(_input.symbol));

        /// @dev Gemini v2: cooldown prevents spam/overwrites
        Signal storage existing = _latestSignal[symHash];
        if (existing.timestamp > 0) {
            require(
                block.timestamp >= existing.timestamp + signalCooldown,
                "Signal cooldown active"
            );
        }

        uint64 expiry = uint64(block.timestamp + (_input.ttl > 0 ? _input.ttl : defaultTTL));

        _latestSignal[symHash] = Signal({
            debateHash: _input.debateHash,
            symbol: _input.symbol,
            direction: _input.direction,
            conviction: _input.conviction,
            agent: _input.agent,
            entryPrice: _input.entryPrice,
            targetPrice: _input.targetPrice,
            stopPrice: _input.stopPrice,
            timestamp: uint64(block.timestamp),
            expiresAt: expiry
        });

        // Track symbol list (consolidated index)
        if (symbolIndex[symHash] == 0) {
            symbolHashes.push(symHash);
            symbolIndex[symHash] = symbolHashes.length; // 1-indexed
            symbolName[symHash] = _input.symbol;
        }

        emit SignalPublished(
            symHash, _input.symbol, _input.direction, _input.conviction,
            _input.agent, _input.entryPrice, _input.debateHash
        );
    }

    // ============================================================
    //  READ — For other protocols to consume
    // ============================================================

    /// @notice Get Bobby's latest conviction on a symbol
    /// @dev Gemini v2: returns NEUTRAL/0/0/false for expired signals (defensive)
    function getConviction(string calldata _symbol) external view returns (
        Direction direction,
        uint8 conviction,
        uint96 entryPrice,
        bool isActive
    ) {
        bytes32 symHash = keccak256(bytes(_symbol));
        Signal storage sig = _latestSignal[symHash];

        if (sig.timestamp == 0 || block.timestamp > sig.expiresAt) {
            return (Direction.NEUTRAL, 0, 0, false);
        }
        return (sig.direction, sig.conviction, sig.entryPrice, true);
    }

    /// @notice Full signal data for a symbol (returns as-is, check expiresAt)
    function getSignal(string calldata _symbol) external view returns (Signal memory) {
        return _latestSignal[keccak256(bytes(_symbol))];
    }

    /// @notice Paginated symbol list with signals
    /// @dev Gemini v2: replaces unbounded getActiveSignals()
    function getSignals(uint256 _offset, uint256 _limit) external view returns (
        string[] memory _symbols,
        Direction[] memory _directions,
        uint8[] memory _convictions,
        bool[] memory _active
    ) {
        uint256 total = symbolHashes.length;
        if (_offset >= total) {
            return (new string[](0), new Direction[](0), new uint8[](0), new bool[](0));
        }

        uint256 end = _offset + _limit;
        if (end > total) end = total;
        uint256 count = end - _offset;

        _symbols = new string[](count);
        _directions = new Direction[](count);
        _convictions = new uint8[](count);
        _active = new bool[](count);

        for (uint256 i = 0; i < count; i++) {
            bytes32 h = symbolHashes[_offset + i];
            Signal storage sig = _latestSignal[h];
            _symbols[i] = sig.symbol;
            _directions[i] = sig.direction;
            _convictions[i] = sig.conviction;
            _active[i] = block.timestamp <= sig.expiresAt;
        }
    }

    /// @notice How many unique symbols have been signaled
    function symbolCount() external view returns (uint256) {
        return symbolHashes.length;
    }

    // ============================================================
    //  ADMIN
    // ============================================================

    function setBobby(address _newBobby) external onlyOwner {
        require(_newBobby != address(0), "Invalid");
        emit BobbyUpdated(bobby, _newBobby);
        bobby = _newBobby;
    }

    function setDefaultTTL(uint256 _ttl) external onlyOwner {
        defaultTTL = _ttl;
    }

    function setSignalCooldown(uint256 _cooldown) external onlyOwner {
        signalCooldown = _cooldown;
    }

    function transferOwnership(address _new) external onlyOwner {
        require(_new != address(0), "Invalid");
        pendingOwner = _new;
        emit OwnershipTransferStarted(owner, _new);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
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
