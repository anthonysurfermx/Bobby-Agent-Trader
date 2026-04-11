// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// src/BobbyAdversarialBounties.sol

/// @title Bobby Adversarial Bounties — Pay-to-Challenge Bobby's Debates
/// @notice Anyone can post an OKB bounty to prove a Bobby debate was miscalibrated.
///         Challengers submit evidence hashes. A trusted resolver (Bobby or Judge Mode)
///         picks the winner and releases funds.
/// @dev Deployed on X Layer (Chain ID 196). Follows BobbyConvictionOracle v2 patterns:
///      pull payments, struct packing, events-as-history, pausable, 2-step ownership.
/// @author Bobby Agent Trader × DeFi México — Build X Season 2 hackathon

contract BobbyAdversarialBounties {

    enum Dimension {
        DATA_INTEGRITY,
        ADVERSARIAL_QUALITY,
        DECISION_LOGIC,
        RISK_MANAGEMENT,
        CALIBRATION_ALIGNMENT,
        NOVELTY
    }

    enum BountyStatus { OPEN, CHALLENGED, RESOLVED, WITHDRAWN }

    /// @dev Struct-packed bounty
    /// Slot 1: threadHash (32)
    /// Slot 2: poster (20) + reward (12 = uint96)
    /// Slot 3: winner (20) + createdAt (8 = uint64) + claimWindowSecs (4 = uint32) = 32
    /// Slot 4: dimension (1) + status (1) + challengeCount (2) + gracePeriodSnapshot (4) = 8 bytes; rest padding
    struct Bounty {
        bytes32 threadHash;            // Slot 1: keccak256(threadId)
        address poster;                // Slot 2
        uint96 reward;                 // Slot 2 (enough for 79B OKB)
        address winner;                // Slot 3
        uint64 createdAt;              // Slot 3
        uint32 claimWindowSecs;        // Slot 3
        Dimension dimension;           // Slot 4
        BountyStatus status;           // Slot 4
        uint16 challengeCount;         // Slot 4
        uint32 gracePeriodSnapshot;    // Slot 4 — R3: immutable per-bounty grace
    }

    /// @dev Challenge submitted against a bounty
    struct Challenge {
        address challenger;
        bytes32 evidenceHash;     // IPFS/Arweave CID hash
        uint64 submittedAt;
    }

    // ---- State ----

    address public owner;
    address public pendingOwner;
    address public resolver;      // Bobby backend or Judge Mode oracle
    bool public paused;

    /// @dev Hard floor — owner cannot drop minBounty below this (anti-DoS)
    uint96 public constant ABSOLUTE_MIN_BOUNTY = 0.0001 ether;

    /// @dev Minimum bounty to prevent dust spam (owner-adjustable within floor)
    uint96 public minBounty = 0.001 ether;

    /// @dev Grace period added when a bounty receives at least one challenge
    ///      before expiring — protects honest challengers from resolver inaction
    uint32 public challengeGracePeriod = 3 days;

    /// @dev Maximum challenges per bounty (gas safety)
    uint16 public maxChallenges = 50;

    /// @dev Default claim window — poster cannot withdraw before this expires
    uint32 public defaultClaimWindow = 7 days;

    /// @dev Pull-payment withdrawals — avoids reentrancy & failed transfer DoS
    mapping(address => uint256) public pendingWithdrawals;

    /// @dev bountyId → Bounty
    mapping(uint256 => Bounty) public bounties;

    /// @dev bountyId → challenges array
    mapping(uint256 => Challenge[]) internal _challenges;

    /// @dev R3: one challenge per address per bounty (anti-spam + O(1) membership)
    mapping(uint256 => mapping(address => bool)) public hasChallenged;

    /// @dev Monotonic counter (history via events, not arrays)
    uint256 public nextBountyId = 1;

    // ---- Events ----

    event BountyPosted(
        uint256 indexed bountyId,
        address indexed poster,
        bytes32 indexed threadHash,
        Dimension dimension,
        uint96 reward,
        uint32 claimWindowSecs
    );

    event ChallengeSubmitted(
        uint256 indexed bountyId,
        address indexed challenger,
        bytes32 evidenceHash,
        uint16 challengeIndex,
        uint64 submittedAt
    );

    event BountyResolved(
        uint256 indexed bountyId,
        address indexed winner,
        uint96 reward
    );

    event BountyWithdrawn(uint256 indexed bountyId, address indexed poster, uint96 amount);
    event Withdrawal(address indexed to, uint256 amount);

    event ResolverUpdated(address indexed oldResolver, address indexed newResolver);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ---- Modifiers ----

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyResolver() {
        require(msg.sender == resolver || msg.sender == owner, "Not resolver");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    // ---- Constructor ----

    constructor(address _resolver) {
        require(_resolver != address(0), "Invalid resolver");
        owner = msg.sender;
        resolver = _resolver;
        emit OwnershipTransferred(address(0), msg.sender);
        emit ResolverUpdated(address(0), _resolver);
    }

    // ============================================================
    //  POST BOUNTY
    // ============================================================

    /// @notice Post an OKB bounty against a specific debate thread on a dimension
    /// @param _threadId Off-chain UUID of the forum thread (e.g. "4f8b...c2d1")
    /// @param _dimension Which of the 6 judge dimensions is being challenged
    /// @param _claimWindowSecs How long until poster can withdraw unchallenged (0 = default)
    function postBounty(
        string calldata _threadId,
        Dimension _dimension,
        uint32 _claimWindowSecs
    ) external payable whenNotPaused returns (uint256 bountyId) {
        require(msg.value >= minBounty, "Bounty below minimum");
        require(msg.value <= type(uint96).max, "Bounty too large");
        require(bytes(_threadId).length > 0, "Empty thread");

        uint32 window = _claimWindowSecs > 0 ? _claimWindowSecs : defaultClaimWindow;
        require(window >= 1 hours && window <= 90 days, "Window out of range");

        bountyId = nextBountyId++;
        bytes32 tHash = keccak256(bytes(_threadId));

        bounties[bountyId] = Bounty({
            threadHash: tHash,
            poster: msg.sender,
            reward: uint96(msg.value),
            winner: address(0),
            createdAt: uint64(block.timestamp),
            claimWindowSecs: window,
            dimension: _dimension,
            status: BountyStatus.OPEN,
            challengeCount: 0,
            // R3: snapshot the grace period so owner cannot rewrite
            // settlement terms of an existing bounty after deposit
            gracePeriodSnapshot: challengeGracePeriod
        });

        emit BountyPosted(bountyId, msg.sender, tHash, _dimension, uint96(msg.value), window);
    }

    // ============================================================
    //  INTERNAL
    // ============================================================

    /// @dev R3: single source of truth for the effective settlement
    ///      deadline of a bounty. Used by resolve and withdraw so
    ///      they can never disagree about when a bounty has matured.
    function _effectiveExpiry(Bounty storage b) internal view returns (uint256) {
        uint256 expiry = uint256(b.createdAt) + uint256(b.claimWindowSecs);
        if (b.status == BountyStatus.CHALLENGED) {
            expiry += uint256(b.gracePeriodSnapshot);
        }
        return expiry;
    }

    // ============================================================
    //  SUBMIT CHALLENGE
    // ============================================================

    /// @notice Submit evidence that the debate failed in the bountied dimension
    /// @param _bountyId Which bounty
    /// @param _evidenceHash Hash of the evidence blob (IPFS CID, Arweave tx, etc)
    function submitChallenge(uint256 _bountyId, bytes32 _evidenceHash)
        external
        whenNotPaused
    {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(
            b.status == BountyStatus.OPEN || b.status == BountyStatus.CHALLENGED,
            "Bounty not open"
        );
        require(msg.sender != b.poster, "Poster cannot challenge own bounty");
        require(_evidenceHash != bytes32(0), "Evidence required");
        require(b.challengeCount < maxChallenges, "Max challenges reached");
        // R3: one challenge per address per bounty — prevents a single
        // account from spamming maxChallenges slots with junk evidence
        require(!hasChallenged[_bountyId][msg.sender], "Already challenged");
        require(
            block.timestamp < b.createdAt + b.claimWindowSecs,
            "Claim window expired"
        );

        hasChallenged[_bountyId][msg.sender] = true;

        uint16 idx = b.challengeCount;
        _challenges[_bountyId].push(Challenge({
            challenger: msg.sender,
            evidenceHash: _evidenceHash,
            submittedAt: uint64(block.timestamp)
        }));
        b.challengeCount = idx + 1;
        if (b.status == BountyStatus.OPEN) {
            b.status = BountyStatus.CHALLENGED;
        }

        emit ChallengeSubmitted(_bountyId, msg.sender, _evidenceHash, idx, uint64(block.timestamp));
    }

    // ============================================================
    //  RESOLVE
    // ============================================================

    /// @notice Resolver picks a winning challenger and releases funds via pull-payment
    /// @dev Owner can resolve as a backstop if resolver is compromised
    function resolveBounty(uint256 _bountyId, address _winner)
        external
        onlyResolver
        whenNotPaused
    {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(b.status == BountyStatus.CHALLENGED, "No challenges to resolve");
        require(_winner != address(0), "Invalid winner");

        // R3: resolver cannot settle after the effective expiry. Without
        // this check, resolve and withdrawBounty could race once the
        // grace period is over, letting the resolver front-run the
        // poster's reclaim attempt.
        require(block.timestamp < _effectiveExpiry(b), "Resolution window closed");

        // R3: O(1) membership check via hasChallenged mapping (was O(n) loop)
        require(hasChallenged[_bountyId][_winner], "Winner did not challenge");

        b.winner = _winner;
        b.status = BountyStatus.RESOLVED;
        pendingWithdrawals[_winner] += b.reward;

        emit BountyResolved(_bountyId, _winner, b.reward);
    }

    // ============================================================
    //  WITHDRAW UNCHALLENGED
    // ============================================================

    /// @notice Poster reclaims bounty if claim window expired with no resolved winner
    /// @dev Intentionally NOT `whenNotPaused` — pausing must never trap user funds.
    ///      A malicious owner could otherwise pause to freeze pending claims.
    function withdrawBounty(uint256 _bountyId) external {
        Bounty storage b = bounties[_bountyId];
        require(b.poster == msg.sender, "Not poster");
        require(
            b.status == BountyStatus.OPEN || b.status == BountyStatus.CHALLENGED,
            "Already finalized"
        );
        require(block.timestamp >= _effectiveExpiry(b), "Window still active");

        uint96 amount = b.reward;
        b.status = BountyStatus.WITHDRAWN;
        pendingWithdrawals[msg.sender] += amount;

        emit BountyWithdrawn(_bountyId, msg.sender, amount);
    }

    // ============================================================
    //  PULL PAYMENT
    // ============================================================

    /// @notice Withdraw accumulated pending OKB (pull pattern — reentrancy-safe)
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");

        emit Withdrawal(msg.sender, amount);
    }

    // ============================================================
    //  READ
    // ============================================================

    function getBounty(uint256 _bountyId) external view returns (Bounty memory) {
        return bounties[_bountyId];
    }

    function getChallenges(uint256 _bountyId, uint256 _offset, uint256 _limit)
        external
        view
        returns (Challenge[] memory page)
    {
        Challenge[] storage chs = _challenges[_bountyId];
        uint256 total = chs.length;
        if (_offset >= total) return new Challenge[](0);

        uint256 end = _offset + _limit;
        if (end > total) end = total;
        uint256 count = end - _offset;

        page = new Challenge[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = chs[_offset + i];
        }
    }

    function challengeCount(uint256 _bountyId) external view returns (uint256) {
        return _challenges[_bountyId].length;
    }

    // ============================================================
    //  ADMIN
    // ============================================================

    function setResolver(address _newResolver) external onlyOwner {
        require(_newResolver != address(0), "Invalid");
        emit ResolverUpdated(resolver, _newResolver);
        resolver = _newResolver;
    }

    function setMinBounty(uint96 _min) external onlyOwner {
        require(_min >= ABSOLUTE_MIN_BOUNTY, "Below absolute floor");
        minBounty = _min;
    }

    /// @notice Update the default grace period applied to FUTURE bounties
    /// @dev Existing bounties are unaffected — they snapshot the value at
    ///      creation time (R3: immutable per-bounty settlement terms).
    function setChallengeGracePeriod(uint32 _grace) external onlyOwner {
        require(_grace <= 30 days, "Grace too long");
        challengeGracePeriod = _grace;
    }

    function setMaxChallenges(uint16 _max) external onlyOwner {
        require(_max > 0 && _max <= 500, "Out of range");
        maxChallenges = _max;
    }

    function setDefaultClaimWindow(uint32 _window) external onlyOwner {
        require(_window >= 1 hours && _window <= 90 days, "Out of range");
        defaultClaimWindow = _window;
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

    // @dev Reject bare transfers — all OKB must enter via postBounty()
    receive() external payable {
        revert("Use postBounty");
    }
}

