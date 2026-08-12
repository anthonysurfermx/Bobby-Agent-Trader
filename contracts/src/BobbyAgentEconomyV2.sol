// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title BobbyAgentEconomyV2 — Replay-resistant MCP payment protocol
/// @notice Adds challengeId to payMCPCall to prevent tx replay.
///         Each payment is tied to a unique challenge created by the backend.
///         Deployed on OKX X Layer (Chain 196).
/// @dev Breaking change from V1: payMCPCall now requires a bytes32 challengeId.
/// @dev Audit R1: Codex (2026-04-07) + Gemini (2026-04-07)
///      Fixes: refund excess, zero-address checks, payDebateFee restricted,
///      pause mechanism, FeesUpdated event, getEconomyStats compat

contract BobbyAgentEconomyV2 {
    // ---- Events ----
    event MCPPayment(
        address indexed payer,
        bytes32 indexed challengeId,
        string toolName,
        uint256 amount,
        uint256 timestamp
    );

    event DebateFee(
        bytes32 indexed debateHash,
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    event Withdrawal(address indexed to, uint256 amount);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event FeesUpdated(uint256 mcpCallFee, uint256 debateFeePerAgent);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ---- State ----
    /// @dev Audit Base r9 [H-02]: owner was immutable, making the D-4 Safe
    /// handoff impossible post-deploy. Two-step transfer, same pattern as the
    /// other five contracts.
    address public owner;
    address public pendingOwner;
    address public immutable alphaHunter;
    address public immutable redTeam;
    address public immutable cio;

    /// @dev Audit D-3 (r6 #4): fees are constructor-set per deploy — no OKB-era
    /// literal ever lives in bytecode, not even transiently between deploy txs.
    uint256 public mcpCallFee;
    uint256 public debateFeePerAgent;

    uint256 public totalMCPCalls;
    uint256 public totalDebates;
    uint256 public totalVolume;

    bool public paused;

    /// @notice Tracks consumed challengeIds to prevent replay
    mapping(bytes32 => bool) public challengeConsumed;

    // ---- Constructor ----
    /// @dev Audit R1 fix: validate non-zero addresses
    constructor(
        address _alphaHunter,
        address _redTeam,
        address _cio,
        uint256 _mcpCallFee,
        uint256 _debateFeePerAgent
    ) {
        require(_alphaHunter != address(0), "Invalid alpha");
        require(_redTeam != address(0), "Invalid red");
        require(_cio != address(0), "Invalid cio");
        require(_mcpCallFee > 0 && _debateFeePerAgent > 0, "Zero fee");
        mcpCallFee = _mcpCallFee;
        debateFeePerAgent = _debateFeePerAgent;
        owner = msg.sender;
        alphaHunter = _alphaHunter;
        redTeam = _redTeam;
        cio = _cio;
    }

    // ---- Modifiers ----
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyCioOrOwner() {
        require(msg.sender == cio || msg.sender == owner, "Not authorized");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    // ---- MCP Payment (replay-resistant) ----
    /// @notice External agent pays for Bobby's intelligence via MCP
    /// @param challengeId Unique challenge ID from the backend (prevents replay)
    /// @param toolName The MCP tool being called (e.g., "bobby_analyze")
    /// @dev Audit R1 fix: refund excess payment, use mcpCallFee for totalVolume
    function payMCPCall(bytes32 challengeId, string calldata toolName) external payable whenNotPaused {
        require(msg.value >= mcpCallFee, "Insufficient MCP fee");
        require(challengeId != bytes32(0), "Invalid challengeId");
        require(!challengeConsumed[challengeId], "Challenge already consumed");

        challengeConsumed[challengeId] = true;

        totalMCPCalls++;
        totalVolume += mcpCallFee;

        emit MCPPayment(msg.sender, challengeId, toolName, mcpCallFee, block.timestamp);

        // Refund excess
        if (msg.value > mcpCallFee) {
            (bool success,) = msg.sender.call{value: msg.value - mcpCallFee}("");
            require(success, "Refund failed");
        }
    }

    // ---- Debate Fee (internal agent economy) ----
    /// @notice CIO pays Alpha Hunter and Red Team for debate participation
    /// @param debateHash The keccak256 hash of the forum thread ID
    /// @dev Audit R1 fix: restricted to cio/owner to prevent metric inflation
    function payDebateFee(bytes32 debateHash) external payable onlyCioOrOwner whenNotPaused {
        require(msg.value >= debateFeePerAgent * 2, "Insufficient debate fee");

        (bool s1,) = alphaHunter.call{value: debateFeePerAgent}("");
        require(s1, "Alpha payment failed");

        (bool s2,) = redTeam.call{value: debateFeePerAgent}("");
        require(s2, "Red Team payment failed");

        totalDebates++;
        totalVolume += debateFeePerAgent * 2;

        emit DebateFee(debateHash, msg.sender, alphaHunter, debateFeePerAgent, block.timestamp);
        emit DebateFee(debateHash, msg.sender, redTeam, debateFeePerAgent, block.timestamp);

        if (msg.value > debateFeePerAgent * 2) {
            (bool s3,) = msg.sender.call{value: msg.value - debateFeePerAgent * 2}("");
            require(s3, "Refund failed");
        }
    }

    // ---- Views ----
    function isChallengeConsumed(bytes32 challengeId) external view returns (bool) {
        return challengeConsumed[challengeId];
    }

    function getStats() external view returns (
        uint256 _totalMCPCalls,
        uint256 _totalDebates,
        uint256 _totalVolume
    ) {
        return (totalMCPCalls, totalDebates, totalVolume);
    }

    /// @dev V1 compatibility — callers expecting getEconomyStats() still work
    function getEconomyStats() external view returns (
        uint256 _totalDebates,
        uint256 _totalMCPCalls,
        uint256 _totalSignalAccesses,
        uint256 _totalVolume,
        uint256 _totalPayments
    ) {
        return (totalDebates, totalMCPCalls, 0, totalVolume, totalMCPCalls + (totalDebates * 2));
    }

    // ---- Admin ----
    /// @dev Audit Base r9 [H-02]: two-step ownership transfer so the D-4 Safe
    /// handoff is executable and typo-safe (Safe must accept).
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Zero address");
        pendingOwner = _newOwner;
        emit OwnershipTransferStarted(owner, _newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    /// @dev Audit R1 fix: emit FeesUpdated event
    /// @dev Audit Base r9 [L-03]: same non-zero guard as the constructor — a
    /// zero fee would hand out free MCP calls and free challengeId consumption.
    function updateFees(uint256 _mcpFee, uint256 _debateFee) external onlyOwner {
        require(_mcpFee > 0 && _debateFee > 0, "Zero fee");
        mcpCallFee = _mcpFee;
        debateFeePerAgent = _debateFee;
        emit FeesUpdated(_mcpFee, _debateFee);
    }

    function withdraw() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No balance");
        (bool s,) = owner.call{value: bal}("");
        require(s, "Withdraw failed");
        emit Withdrawal(owner, bal);
    }

    /// @dev Audit R1 fix: pause mechanism for emergency stops
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    receive() external payable {}
}
