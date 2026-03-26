// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/forge-std/src/interfaces/IERC721.sol";

/// @title BobbyAgentRegistry — On-chain identity for Bobby's AI agents
/// @notice Each agent (Alpha Hunter, Red Team, CIO) gets an ERC-721 NFT
///         with on-chain performance stats. Other protocols can verify
///         agent identity and track record before trusting their signals.
/// @dev Deployed on OKX X Layer (Chain 196). Minimal ERC-721 implementation.

contract BobbyAgentRegistry {
    // ---- Events ----
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event AgentRegistered(uint256 indexed tokenId, string name, AgentRole role);
    event StatsUpdated(uint256 indexed tokenId, uint256 debates, uint256 winRate, uint256 calibrationError);

    // ---- Types ----
    enum AgentRole { CIO, ALPHA_HUNTER, RED_TEAM }

    struct AgentIdentity {
        string name;
        AgentRole role;
        bytes32 personalityHash;
        uint256 totalDebates;
        uint256 wins;
        uint256 losses;
        uint256 winRate;          // basis points (7500 = 75%)
        uint256 calibrationError; // basis points (500 = 5%)
        uint256 totalSignals;
        uint256 registeredAt;
        uint256 lastUpdated;
    }

    // ---- State ----
    address public immutable owner;
    uint256 public totalAgents;

    mapping(uint256 => AgentIdentity) public agents;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;

    // ---- Constructor ----
    constructor() {
        owner = msg.sender;
    }

    // ---- Modifiers ----
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ---- Register Agent (mint NFT) ----
    /// @notice Register a new AI agent with on-chain identity
    /// @param name Agent display name (e.g., "Alpha Hunter")
    /// @param role Agent role enum
    /// @param personalityHash keccak256 of the agent's personality config
    /// @param to Address to receive the NFT
    function registerAgent(
        string calldata name,
        AgentRole role,
        bytes32 personalityHash,
        address to
    ) external onlyOwner returns (uint256 tokenId) {
        tokenId = ++totalAgents;

        agents[tokenId] = AgentIdentity({
            name: name,
            role: role,
            personalityHash: personalityHash,
            totalDebates: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            calibrationError: 0,
            totalSignals: 0,
            registeredAt: block.timestamp,
            lastUpdated: block.timestamp
        });

        ownerOf[tokenId] = to;
        balanceOf[to]++;

        emit Transfer(address(0), to, tokenId);
        emit AgentRegistered(tokenId, name, role);
    }

    // ---- Update Stats (after each cycle) ----
    /// @notice Update agent performance stats from Bobby's cycle
    /// @param tokenId Agent NFT token ID
    /// @param debates Total debates participated
    /// @param wins Total wins
    /// @param losses Total losses
    /// @param calibrationError Calibration error in basis points
    /// @param signals Total signals produced
    function updateStats(
        uint256 tokenId,
        uint256 debates,
        uint256 wins,
        uint256 losses,
        uint256 calibrationError,
        uint256 signals
    ) external onlyOwner {
        require(tokenId > 0 && tokenId <= totalAgents, "Invalid agent");

        AgentIdentity storage agent = agents[tokenId];
        agent.totalDebates = debates;
        agent.wins = wins;
        agent.losses = losses;
        agent.winRate = (wins + losses) > 0 ? (wins * 10000) / (wins + losses) : 0;
        agent.calibrationError = calibrationError;
        agent.totalSignals = signals;
        agent.lastUpdated = block.timestamp;

        emit StatsUpdated(tokenId, debates, agent.winRate, calibrationError);
    }

    // ---- Views ----
    function getAgent(uint256 tokenId) external view returns (AgentIdentity memory) {
        require(tokenId > 0 && tokenId <= totalAgents, "Invalid agent");
        return agents[tokenId];
    }

    function getAgentByRole(AgentRole role) external view returns (uint256 tokenId, AgentIdentity memory agent) {
        for (uint256 i = 1; i <= totalAgents; i++) {
            if (agents[i].role == role) {
                return (i, agents[i]);
            }
        }
        revert("Agent not found");
    }

    // ---- Minimal ERC-721 support ----
    function name() external pure returns (string memory) {
        return "Bobby Agent Identity";
    }

    function symbol() external pure returns (string memory) {
        return "BOBBY-AGENT";
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(tokenId > 0 && tokenId <= totalAgents, "Invalid agent");
        AgentIdentity storage a = agents[tokenId];
        // On-chain JSON metadata
        return string(abi.encodePacked(
            'data:application/json,{"name":"', a.name,
            '","description":"Bobby Agent Trader - AI Agent Identity on X Layer",',
            '"attributes":[{"trait_type":"Role","value":"', _roleString(a.role),
            '"},{"trait_type":"Debates","value":', _uint2str(a.totalDebates),
            '},{"trait_type":"Win Rate","value":', _uint2str(a.winRate),
            '},{"trait_type":"Signals","value":', _uint2str(a.totalSignals),
            '}]}'
        ));
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x01ffc9a7; // ERC-721 + ERC-165
    }

    // ---- Internal ----
    function _roleString(AgentRole role) internal pure returns (string memory) {
        if (role == AgentRole.CIO) return "CIO";
        if (role == AgentRole.ALPHA_HUNTER) return "Alpha Hunter";
        return "Red Team";
    }

    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
