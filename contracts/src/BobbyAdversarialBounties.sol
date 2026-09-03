// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

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

    /// @dev Codex round-2 #2: RESOLVED is no longer reached by the resolver alone.
    ///      resolveBounty PROPOSES a winner (PENDING_RESOLUTION); anyone may finalize
    ///      after `disputeWindow`; the poster or any other challenger may dispute
    ///      inside it (DISPUTED), and only the owner (the Safe) settles a dispute.
    ///      A compromised resolver key therefore needs the poster asleep for the
    ///      whole window AND no rival challenger watching — not one transaction.
    enum BountyStatus { OPEN, CHALLENGED, RESOLVED, WITHDRAWN, PENDING_RESOLUTION, DISPUTED }

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

    /// @dev Hard floor — owner cannot drop minBounty below this (anti-DoS).
    /// Audit D-3: immutable, set per deploy — the old 0.0001-ether constant was
    /// sized for OKB and would be ~40x more expensive as ETH on Base.
    uint96 public immutable ABSOLUTE_MIN_BOUNTY;

    /// @dev Minimum bounty to prevent dust spam (owner-adjustable within floor)
    uint96 public minBounty;

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

    /// @dev Codex r2 #2: how long a proposed resolution can be disputed before it pays.
    uint32 public disputeWindow = 2 days;
    uint32 public constant MIN_DISPUTE_WINDOW = 1 days;
    uint32 public constant MAX_DISPUTE_WINDOW = 14 days;
    /// @dev bountyId → when the resolver proposed the winner
    mapping(uint256 => uint64) public resolutionProposedAt;
    /// @dev bountyId → who disputed (poster, a rival challenger, or the owner)
    mapping(uint256 => address) public disputedBy;

    /// @dev Codex r3: contesting and disputing carry a bond, so filling the
    ///      challenge slots or freezing an escrow costs the attacker money.
    ///      Loser bonds go to the poster; a wrong dispute's bond goes to the winner.
    uint96 public challengeBond;
    mapping(uint256 => mapping(address => uint96)) public challengeBondOf;
    mapping(uint256 => uint96) public disputeBondOf;
    /// @dev Codex r3: the deadline is SNAPSHOTTED per bounty at proposal time —
    ///      a later setDisputeWindow cannot shorten or extend it.
    mapping(uint256 => uint64) public resolutionFinalizeAfter;
    /// @dev Codex r3: a dispute the owner never settles is not a permanent lock —
    ///      after this timeout anyone can return the escrow to the poster.
    mapping(uint256 => uint64) public disputedAt;
    uint32 public disputeSettlementTimeout = 30 days;
    uint32 public constant MIN_SETTLEMENT_TIMEOUT = 7 days;
    uint32 public constant MAX_SETTLEMENT_TIMEOUT = 90 days;

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

    event BountyResolutionProposed(uint256 indexed bountyId, address indexed winner, uint96 reward, uint64 finalizeAfter);
    event BountyResolutionDisputed(uint256 indexed bountyId, address indexed by);
    event BountyDisputeSettled(uint256 indexed bountyId, address indexed winner, bool refundedToPoster);
    event DisputeWindowUpdated(uint32 oldWindow, uint32 newWindow);
    event BountyDisputeTimedOut(uint256 indexed bountyId, address indexed poster, uint96 amount);
    event ChallengeBondUpdated(uint96 oldBond, uint96 newBond);
    event DisputeSettlementTimeoutUpdated(uint32 oldTimeout, uint32 newTimeout);
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

    constructor(address _resolver, uint96 _absoluteMinBounty, uint96 _initialMinBounty) {
        require(_resolver != address(0), "Invalid resolver");
        require(_absoluteMinBounty > 0, "Zero floor");
        require(_initialMinBounty >= _absoluteMinBounty, "Min below floor");
        owner = msg.sender;
        resolver = _resolver;
        ABSOLUTE_MIN_BOUNTY = _absoluteMinBounty;
        minBounty = _initialMinBounty;
        challengeBond = _initialMinBounty;
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
        payable
        whenNotPaused
    {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(
            b.status == BountyStatus.OPEN || b.status == BountyStatus.CHALLENGED,
            "Bounty not open"
        );
        require(msg.sender != b.poster, "Poster cannot challenge own bounty");
        // Final audit P1-6: the party that picks the winner cannot also be a
        // contestant — otherwise resolver + challenge + resolve drains the pot.
        require(msg.sender != resolver && msg.sender != owner, "Resolver cannot challenge");
        require(_evidenceHash != bytes32(0), "Evidence required");
        require(b.challengeCount < maxChallenges, "Max challenges reached");
        // R3: one challenge per address per bounty — prevents a single
        // account from spamming maxChallenges slots with junk evidence
        require(!hasChallenged[_bountyId][msg.sender], "Already challenged");
        require(
            block.timestamp < b.createdAt + b.claimWindowSecs,
            "Claim window expired"
        );

        // Codex r3: a bond per challenge — returned to the winner, forfeited to
        // the poster by every other challenger once the bounty resolves.
        require(msg.value == challengeBond, "Challenge bond required");
        challengeBondOf[_bountyId][msg.sender] = uint96(msg.value);
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
    /// @dev Audit Base r1 [H-1]: intentionally NOT `whenNotPaused`. Pausing must stop
    /// new value entering, never settlement of value already in — otherwise a pause
    /// outlasting claimWindow+grace lets the poster reclaim a bounty a challenger
    /// already won, while the payout path is frozen.
    function resolveBounty(uint256 _bountyId, address _winner)
        external
        onlyResolver
    {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(b.status == BountyStatus.CHALLENGED, "No challenges to resolve");
        require(_winner != address(0), "Invalid winner");
        // Final audit P1-6, belt to the check in submitChallenge: a resolver or
        // owner rotated in AFTER challenging still cannot be paid.
        require(_winner != resolver && _winner != owner, "Resolver cannot win");

        // R3: resolver cannot settle after the effective expiry. Without
        // this check, resolve and withdrawBounty could race once the
        // grace period is over, letting the resolver front-run the
        // poster's reclaim attempt.
        require(block.timestamp < _effectiveExpiry(b), "Resolution window closed");

        // R3: O(1) membership check via hasChallenged mapping (was O(n) loop)
        require(hasChallenged[_bountyId][_winner], "Winner did not challenge");

        // Codex r2 #2: propose, do not pay. The pot moves in finalizeResolution.
        b.winner = _winner;
        b.status = BountyStatus.PENDING_RESOLUTION;
        resolutionProposedAt[_bountyId] = uint64(block.timestamp);
        uint64 finalizeAfter = uint64(block.timestamp) + disputeWindow;
        resolutionFinalizeAfter[_bountyId] = finalizeAfter;

        emit BountyResolutionProposed(_bountyId, _winner, b.reward, finalizeAfter);
    }

    /// @notice Pay the proposed winner once the dispute window has passed with no
    ///         dispute. Permissionless and deliberately NOT pausable (settlement of
    ///         value already owed must not depend on an operator).
    function finalizeResolution(uint256 _bountyId) external {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(b.status == BountyStatus.PENDING_RESOLUTION, "Not pending");
        require(block.timestamp >= resolutionFinalizeAfter[_bountyId], "Dispute window open");

        b.status = BountyStatus.RESOLVED;
        pendingWithdrawals[b.winner] += b.reward;
        _settleChallengeBonds(_bountyId, b.winner);

        emit BountyResolved(_bountyId, b.winner, b.reward);
    }

    /// @notice The poster, or any challenger who is not the proposed winner, can
    ///         freeze a proposed resolution inside the window. Only the owner
    ///         (the 2/3 Safe) can then settle it.
    /// @dev Codex r3: the owner (Safe) may dispute too — the compromised-backend
    ///      model must not depend on the poster being awake. Parties post a bond;
    ///      the owner does not.
    function disputeResolution(uint256 _bountyId) external payable {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(b.status == BountyStatus.PENDING_RESOLUTION, "Not pending");
        require(block.timestamp < resolutionFinalizeAfter[_bountyId], "Dispute window closed");
        require(msg.sender == owner || msg.sender == b.poster || hasChallenged[_bountyId][msg.sender], "Not a party");
        require(msg.sender != b.winner, "Winner cannot dispute");
        if (msg.sender == owner) {
            require(msg.value == 0, "Owner disputes without bond");
        } else {
            require(msg.value == challengeBond, "Dispute bond required");
            disputeBondOf[_bountyId] = uint96(msg.value);
        }

        b.status = BountyStatus.DISPUTED;
        disputedBy[_bountyId] = msg.sender;
        disputedAt[_bountyId] = uint64(block.timestamp);

        emit BountyResolutionDisputed(_bountyId, msg.sender);
    }

    /// @notice Owner settles a dispute: pay a challenger (never the resolver or the
    ///         owner), or `address(0)` to refund the poster.
    function settleDispute(uint256 _bountyId, address _winner) external onlyOwner {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(b.status == BountyStatus.DISPUTED, "Not disputed");

        address proposed = b.winner;
        if (_winner == address(0)) {
            b.winner = address(0);
            b.status = BountyStatus.WITHDRAWN;
            pendingWithdrawals[b.poster] += b.reward;
            _returnAllChallengeBonds(_bountyId);
            _payDisputeBond(_bountyId, disputedBy[_bountyId]); // the dispute was upheld
            emit BountyWithdrawn(_bountyId, b.poster, b.reward);
            emit BountyDisputeSettled(_bountyId, address(0), true);
            return;
        }
        require(hasChallenged[_bountyId][_winner], "Winner did not challenge");
        require(_winner != resolver && _winner != owner, "Resolver cannot win");
        b.winner = _winner;
        b.status = BountyStatus.RESOLVED;
        pendingWithdrawals[_winner] += b.reward;
        _settleChallengeBonds(_bountyId, _winner);
        // Upheld (the proposal changed) → bond back to the disputer; rejected → to the winner.
        _payDisputeBond(_bountyId, _winner == proposed ? _winner : disputedBy[_bountyId]);
        emit BountyResolved(_bountyId, _winner, b.reward);
        emit BountyDisputeSettled(_bountyId, _winner, false);
    }

    /// @notice A dispute the owner never settled: after `disputeSettlementTimeout`
    ///         anyone returns the escrow to the poster and every bond to its owner.
    ///         Nobody profits from stalling.
    function resolveStalledDispute(uint256 _bountyId) external {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(b.status == BountyStatus.DISPUTED, "Not disputed");
        require(block.timestamp >= uint256(disputedAt[_bountyId]) + disputeSettlementTimeout, "Settlement timeout not reached");

        b.winner = address(0);
        b.status = BountyStatus.WITHDRAWN;
        pendingWithdrawals[b.poster] += b.reward;
        _returnAllChallengeBonds(_bountyId);
        _payDisputeBond(_bountyId, disputedBy[_bountyId]);
        emit BountyDisputeTimedOut(_bountyId, b.poster, b.reward);
        emit BountyWithdrawn(_bountyId, b.poster, b.reward);
    }

    function setChallengeBond(uint96 _bond) external onlyOwner {
        require(_bond >= ABSOLUTE_MIN_BOUNTY, "Bond below floor");
        emit ChallengeBondUpdated(challengeBond, _bond);
        challengeBond = _bond;
    }

    function setDisputeSettlementTimeout(uint32 _seconds) external onlyOwner {
        require(_seconds >= MIN_SETTLEMENT_TIMEOUT && _seconds <= MAX_SETTLEMENT_TIMEOUT, "Timeout out of bounds");
        emit DisputeSettlementTimeoutUpdated(disputeSettlementTimeout, _seconds);
        disputeSettlementTimeout = _seconds;
    }

    /// @dev Winner's bond back to the winner; every other challenger's bond to the poster.
    function _settleChallengeBonds(uint256 _bountyId, address _winner) internal {
        Challenge[] storage cs = _challenges[_bountyId];
        address poster = bounties[_bountyId].poster;
        for (uint256 i = 0; i < cs.length; i++) {
            address c = cs[i].challenger;
            uint96 bond = challengeBondOf[_bountyId][c];
            if (bond == 0) continue;
            challengeBondOf[_bountyId][c] = 0;
            pendingWithdrawals[c == _winner ? c : poster] += bond;
        }
    }

    /// @dev Nothing was won: every challenger gets their bond back.
    function _returnAllChallengeBonds(uint256 _bountyId) internal {
        Challenge[] storage cs = _challenges[_bountyId];
        for (uint256 i = 0; i < cs.length; i++) {
            address c = cs[i].challenger;
            uint96 bond = challengeBondOf[_bountyId][c];
            if (bond == 0) continue;
            challengeBondOf[_bountyId][c] = 0;
            pendingWithdrawals[c] += bond;
        }
    }

    function _payDisputeBond(uint256 _bountyId, address _to) internal {
        uint96 bond = disputeBondOf[_bountyId];
        if (bond == 0) return;
        disputeBondOf[_bountyId] = 0;
        pendingWithdrawals[_to] += bond;
    }

    function setDisputeWindow(uint32 _seconds) external onlyOwner {
        require(_seconds >= MIN_DISPUTE_WINDOW && _seconds <= MAX_DISPUTE_WINDOW, "Window out of bounds");
        emit DisputeWindowUpdated(disputeWindow, _seconds);
        disputeWindow = _seconds;
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
        _returnAllChallengeBonds(_bountyId); // Codex r3: an unresolved bounty owes nobody a bond

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
