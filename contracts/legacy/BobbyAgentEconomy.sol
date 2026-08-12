// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title BobbyAgentEconomy — On-chain agent-to-agent payment protocol
/// @notice Tracks payments between Bobby's internal agents (debate fees)
///         and external agent callers (MCP intelligence fees).
///         Deployed on OKX X Layer (Chain 196).
/// @dev Three payment types:
///   1. DEBATE_FEE: CIO pays Alpha Hunter + Red Team per debate cycle
///   2. MCP_CALL: External agent pays Bobby for intelligence
///   3. SIGNAL_ACCESS: External agent pays for ConvictionOracle read

contract BobbyAgentEconomy {
    // ---- Events ----
    event DebateFee(
        bytes32 indexed debateHash,
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        AgentRole role,
        uint256 timestamp
    );

    event MCPPayment(
        address indexed caller,
        string toolName,
        uint256 amount,
        uint256 timestamp
    );

    event SignalAccess(
        address indexed caller,
        string symbol,
        uint256 amount,
        uint256 timestamp
    );

    event Withdrawal(address indexed to, uint256 amount);

    // ---- Types ----
    enum AgentRole { CIO, ALPHA_HUNTER, RED_TEAM }

    struct AgentStats {
        uint256 totalEarned;
        uint256 totalPaid;
        uint256 debatesParticipated;
        uint256 mcpCallsServed;
    }

    struct PaymentRecord {
        address from;
        address to;
        uint256 amount;
        uint8 paymentType; // 0=debate, 1=mcp, 2=signal
        uint256 timestamp;
    }

    // ---- State ----
    address public immutable owner;
    address public immutable alphaHunter;
    address public immutable redTeam;
    address public immutable cio;

    uint256 public debateFeePerAgent = 0.0001 ether; // 0.0001 OKB per agent per debate
    uint256 public mcpCallFee = 0.001 ether;          // 0.001 OKB per MCP call
    uint256 public signalAccessFee = 0.0005 ether;    // 0.0005 OKB per oracle read

    uint256 public totalDebates;
    uint256 public totalMCPCalls;
    uint256 public totalSignalAccesses;
    uint256 public totalVolume;

    mapping(address => AgentStats) public agentStats;
    PaymentRecord[] public payments;

    // ---- Constructor ----
    constructor(address _alphaHunter, address _redTeam, address _cio) {
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

    // ---- Debate Fee (internal agent economy) ----
    /// @notice CIO pays Alpha Hunter and Red Team for their debate participation
    /// @param debateHash The keccak256 hash of the forum thread ID
    function payDebateFee(bytes32 debateHash) external payable {
        require(msg.value >= debateFeePerAgent * 2, "Insufficient debate fee");

        // Pay Alpha Hunter
        (bool s1,) = alphaHunter.call{value: debateFeePerAgent}("");
        require(s1, "Alpha payment failed");

        // Pay Red Team
        (bool s2,) = redTeam.call{value: debateFeePerAgent}("");
        require(s2, "Red Team payment failed");

        // Update stats
        agentStats[cio].totalPaid += debateFeePerAgent * 2;
        agentStats[cio].debatesParticipated++;
        agentStats[alphaHunter].totalEarned += debateFeePerAgent;
        agentStats[alphaHunter].debatesParticipated++;
        agentStats[redTeam].totalEarned += debateFeePerAgent;
        agentStats[redTeam].debatesParticipated++;

        totalDebates++;
        totalVolume += debateFeePerAgent * 2;

        // Record payments
        payments.push(PaymentRecord(cio, alphaHunter, debateFeePerAgent, 0, block.timestamp));
        payments.push(PaymentRecord(cio, redTeam, debateFeePerAgent, 0, block.timestamp));

        emit DebateFee(debateHash, cio, alphaHunter, debateFeePerAgent, AgentRole.ALPHA_HUNTER, block.timestamp);
        emit DebateFee(debateHash, cio, redTeam, debateFeePerAgent, AgentRole.RED_TEAM, block.timestamp);

        // Refund excess
        if (msg.value > debateFeePerAgent * 2) {
            (bool s3,) = msg.sender.call{value: msg.value - debateFeePerAgent * 2}("");
            require(s3, "Refund failed");
        }
    }

    // ---- MCP Payment (external agent calls Bobby) ----
    /// @notice External agent pays for Bobby's intelligence via MCP
    /// @param toolName The MCP tool being called (e.g., "bobby_analyze")
    function payMCPCall(string calldata toolName) external payable {
        require(msg.value >= mcpCallFee, "Insufficient MCP fee");

        agentStats[msg.sender].totalPaid += msg.value;
        agentStats[cio].totalEarned += msg.value;
        agentStats[cio].mcpCallsServed++;

        totalMCPCalls++;
        totalVolume += msg.value;

        payments.push(PaymentRecord(msg.sender, cio, msg.value, 1, block.timestamp));

        emit MCPPayment(msg.sender, toolName, msg.value, block.timestamp);
    }

    // ---- Signal Access (external agent reads ConvictionOracle) ----
    /// @notice External agent pays to access Bobby's conviction signal
    /// @param symbol The asset symbol (e.g., "BTC")
    function paySignalAccess(string calldata symbol) external payable {
        require(msg.value >= signalAccessFee, "Insufficient signal fee");

        agentStats[msg.sender].totalPaid += msg.value;
        agentStats[cio].totalEarned += msg.value;

        totalSignalAccesses++;
        totalVolume += msg.value;

        payments.push(PaymentRecord(msg.sender, cio, msg.value, 2, block.timestamp));

        emit SignalAccess(msg.sender, symbol, msg.value, block.timestamp);
    }

    // ---- Views ----
    function getAgentStats(address agent) external view returns (AgentStats memory) {
        return agentStats[agent];
    }

    function getEconomyStats() external view returns (
        uint256 _totalDebates,
        uint256 _totalMCPCalls,
        uint256 _totalSignalAccesses,
        uint256 _totalVolume,
        uint256 _totalPayments
    ) {
        return (totalDebates, totalMCPCalls, totalSignalAccesses, totalVolume, payments.length);
    }

    function getPaymentCount() external view returns (uint256) {
        return payments.length;
    }

    function getRecentPayments(uint256 count) external view returns (PaymentRecord[] memory) {
        uint256 len = payments.length;
        if (count > len) count = len;
        PaymentRecord[] memory recent = new PaymentRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = payments[len - count + i];
        }
        return recent;
    }

    // ---- Admin ----
    function updateFees(uint256 _debateFee, uint256 _mcpFee, uint256 _signalFee) external onlyOwner {
        debateFeePerAgent = _debateFee;
        mcpCallFee = _mcpFee;
        signalAccessFee = _signalFee;
    }

    function withdraw() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No balance");
        (bool s,) = owner.call{value: bal}("");
        require(s, "Withdraw failed");
        emit Withdrawal(owner, bal);
    }

    receive() external payable {}
}
