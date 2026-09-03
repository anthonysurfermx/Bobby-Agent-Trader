// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title HardnessRegistry
/// @notice Public hardness layer for AI agents: services, signals, predictions and adversarial bounties.
/// @dev Fresh v1 deploy intended to replace Bobby-specific primitives with public multi-agent modules.
contract HardnessRegistry {
    enum Direction {
        NEUTRAL,
        LONG,
        SHORT
    }

    enum PredictionResult {
        NONE,
        WIN,
        LOSS,
        BREAK_EVEN,
        EXPIRED
    }

    enum BountyDimension {
        DATA_INTEGRITY,
        ADVERSARIAL_QUALITY,
        DECISION_LOGIC,
        RISK_MANAGEMENT,
        CALIBRATION_ALIGNMENT,
        NOVELTY
    }

    enum BountyStatus {
        OPEN,
        CHALLENGED,
        RESOLVED,
        WITHDRAWN,
        PENDING_RESOLUTION, // Codex r2 #2: quorum reached, dispute window running
        DISPUTED            // poster / rival challenger objected; owner settles
    }

    struct AgentProfile {
        bool registered;
        uint64 registeredAt;
        uint96 stake;
        string metadataURI;
    }

    struct Service {
        address owner;
        address recipient;
        uint128 priceWei;
        uint128 totalRevenue;
        uint64 totalCalls;
        uint64 createdAt;
        bool active;
        string serviceId;
    }

    struct Prediction {
        address agent;
        uint64 committedAt;
        uint64 minResolveAt;
        uint64 resolvedAt;
        uint8 conviction;
        PredictionResult result;
        uint96 entryPrice;
        uint8 hardnessScore;
        uint96 targetPrice;
        uint96 stopPrice;
        uint96 exitPrice;
        int32 pnlBps;
        string symbol;
    }

    struct AgentStats {
        uint64 wins;
        uint64 losses;
        uint64 breakEvens;
        uint64 expired;
        uint64 totalResolved;
        uint32 winRateBps;
    }

    struct Signal {
        address agent;
        uint64 timestamp;
        uint64 expiresAt;
        uint8 conviction;
        uint8 hardnessScore;
        Direction direction;
        bytes32 context;
        string symbol;
    }

    struct Bounty {
        bytes32 threadHash;
        address poster;
        address winner;
        uint96 reward;
        uint64 createdAt;
        uint32 claimWindowSecs;
        uint8 challengeCount;
        uint8 approvalCount;
        uint8 approvalThreshold;
        uint32 gracePeriodSnapshot;
        BountyDimension dimension;
        BountyStatus status;
    }

    struct Challenge {
        address challenger;
        bytes32 evidenceHash;
        uint64 submittedAt;
    }

    // Custom errors (saves ~20 bytes each vs string reverts)
    error NotOwner();
    error NotRegistered();
    error ContractPaused();
    error Reentrancy();
    error InvalidAddress();
    error InvalidValue();
    error AlreadyExists();
    error NotFound();
    error NotAuthorized();
    error TooSoon();
    error Expired();
    error AlreadyResolved();
    error InvalidResult();
    error InsufficientPayment();
    error ChallengeConsumed();
    error ServiceInactive();
    error WindowExpired();
    error MaxChallenges();
    error AlreadyChallenged();
    error InsufficientStake();
    error ThresholdTooHigh();
    error AlreadyApproved();
    error NoResolvers();
    error TransferFailed();

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    address public owner;
    address public pendingOwner;
    address public hardnessScorer;
    bool public paused;

    uint256 public minPredictionAge = 1 hours;
    uint256 public predictionTTL = 30 days;
    uint256 public defaultSignalTTL = 24 hours;

    /// @dev Audit D-3: floors/stakes are immutable per-deploy values, not source
    /// constants — the old OKB-sized ether literals inflate ~40x as ETH on Base.
    uint96 public immutable ABSOLUTE_MIN_BOUNTY;
    uint96 public immutable REGISTRATION_STAKE;
    uint96 public minBounty;
    uint32 public challengeGracePeriod = 3 days;
    uint32 public defaultClaimWindow = 7 days;
    uint8 public maxChallengesPerBounty = 50;
    uint8 public resolverThreshold;
    uint8 public resolverCount;

    uint256 public nextBountyId = 1;
    uint256 private _status = _NOT_ENTERED;

    mapping(address => AgentProfile) public agentProfiles;

    mapping(bytes32 => Service) private _services;
    bytes32[] public serviceKeys;
    mapping(bytes32 => bool) public challengeConsumed;

    mapping(bytes32 => Prediction) private _predictions;
    mapping(address => AgentStats) private _agentStats;

    mapping(address => mapping(bytes32 => Signal)) private _signals;
    mapping(bytes32 => string) public symbolName;
    bytes32[] public signalSymbols;
    mapping(bytes32 => uint256) public signalSymbolIndex;
    mapping(bytes32 => address[]) private _symbolAgents;
    mapping(bytes32 => mapping(address => bool)) public symbolAgentSeen;

    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Challenge[]) private _challenges;
    mapping(uint256 => mapping(address => bool)) public hasChallenged;
    /// @dev Final audit P0-3: max distance allowed between the resolver's reported
    ///      pnlBps and the figure derived on-chain from entry/exit (1%).
    uint32 public constant PNL_TOLERANCE_BPS = 100;

    mapping(address => bool) public resolvers;
    mapping(uint256 => address) public proposedWinner;
    mapping(uint256 => uint256) public resolutionRound;
    /// @dev Codex r2 #2: a quorum of backend keys is still one operator. The pot
    ///      waits out a dispute window; the poster or a rival challenger can freeze
    ///      it and only the owner (Safe) settles.
    uint32 public bountyDisputeWindow = 2 days;
    uint32 public constant MIN_BOUNTY_DISPUTE_WINDOW = 1 days;
    uint32 public constant MAX_BOUNTY_DISPUTE_WINDOW = 14 days;
    mapping(uint256 => uint64) public bountyResolutionProposedAt;
    mapping(uint256 => address) public bountyDisputedBy;
    /// @dev Codex r3: bonds on challenges and disputes, a snapshotted deadline,
    ///      and a permissionless exit from an unsettled dispute.
    uint96 public bountyChallengeBond;
    mapping(uint256 => mapping(address => uint96)) public bountyChallengeBondOf;
    mapping(uint256 => uint96) public bountyDisputeBondOf;
    mapping(uint256 => uint64) public bountyResolutionFinalizeAfter;
    mapping(uint256 => uint64) public bountyDisputedAt;
    uint32 public bountyDisputeSettlementTimeout = 30 days;
    uint32 public constant MIN_BOUNTY_SETTLEMENT_TIMEOUT = 7 days;
    uint32 public constant MAX_BOUNTY_SETTLEMENT_TIMEOUT = 90 days;
    /// @dev Codex r4: forfeited bonds never go to a party; per-bounty snapshots of
    ///      the bond and of the settlement deadline; approvers tracked per round so a
    ///      revoked resolver's vote stops counting.
    address public treasury;
    mapping(uint256 => uint96) public bountyBond;
    mapping(uint256 => uint64) public bountySettlementAfter;
    mapping(uint256 => mapping(uint256 => address[])) internal _roundApprovers;
    uint96 public constant MAX_BOUNTY_BOND_MULTIPLIER = 1000;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasApprovedResolution;

    mapping(address => uint256) public pendingWithdrawals;

    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    event AgentRegistered(address indexed agent, string metadataURI);
    event AgentMetadataUpdated(address indexed agent, string metadataURI);

    event ServiceRegistered(address indexed agent, string serviceId, uint256 priceWei, address recipient);
    event ServiceUpdated(address indexed agent, string serviceId, uint256 priceWei, address recipient, bool active);
    event ServicePayment(address indexed payer, address indexed recipient, string serviceId, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    event PredictionCommitted(address indexed agent, bytes32 indexed predictionHash, string symbol, uint8 conviction);
    event PredictionResolved(
        address indexed resolver,
        address indexed agent,
        bytes32 indexed predictionHash,
        PredictionResult result,
        int32 pnlBps
    );
    event HardnessCertified(bytes32 indexed predictionHash, uint8 score);
    event AgentSlashed(address indexed agent, uint256 amount, bytes32 reason);

    event PredictionExpired(address indexed caller, address indexed agent, bytes32 indexed predictionHash);

    event SignalPublished(
        address indexed agent,
        bytes32 indexed symbolHash,
        string symbol,
        uint8 hardnessScore,
        uint8 direction,
        uint8 conviction,
        bytes32 context
    );

    event ResolverUpdated(address indexed resolver, bool active);
    event ResolverThresholdUpdated(uint8 oldThreshold, uint8 newThreshold);
    event BountyPosted(
        uint256 indexed bountyId,
        address indexed poster,
        bytes32 indexed threadHash,
        BountyDimension dimension,
        uint96 reward
    );
    event ChallengeSubmitted(uint256 indexed bountyId, address indexed challenger, bytes32 evidenceHash);
    event BountyResolutionApproved(
        uint256 indexed bountyId,
        uint256 indexed round,
        address indexed resolver,
        address winner,
        uint8 approvals,
        uint8 threshold
    );
    event BountyResolved(uint256 indexed bountyId, address indexed winner, uint96 reward);
    event BountyResolutionProposed(uint256 indexed bountyId, address indexed winner, uint96 reward, uint64 finalizeAfter);
    event BountyResolutionDisputed(uint256 indexed bountyId, address indexed by);
    event BountyDisputeSettled(uint256 indexed bountyId, address indexed winner, bool refundedToPoster);
    event BountyDisputeWindowUpdated(uint32 oldWindow, uint32 newWindow);
    event BountyDisputeTimedOut(uint256 indexed bountyId, address indexed poster, uint96 amount);
    event BountyChallengeBondUpdated(uint96 oldBond, uint96 newBond);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event BountyDisputeSettlementTimeoutUpdated(uint32 oldTimeout, uint32 newTimeout);
    event BountyWithdrawn(uint256 indexed bountyId, address indexed poster, uint96 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRegisteredAgent() {
        if (!agentProfiles[msg.sender].registered) revert NotRegistered();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier nonReentrant() {
        if (_status == _ENTERED) revert Reentrancy();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    constructor(
        address[] memory initialResolvers,
        uint8 initialThreshold,
        uint96 _absoluteMinBounty,
        uint96 _registrationStake,
        uint96 _initialMinBounty
    ) {
        if (_absoluteMinBounty == 0 || _registrationStake == 0) revert InvalidValue();
        if (_initialMinBounty < _absoluteMinBounty) revert InvalidValue();
        owner = msg.sender;
        ABSOLUTE_MIN_BOUNTY = _absoluteMinBounty;
        REGISTRATION_STAKE = _registrationStake;
        minBounty = _initialMinBounty;
        bountyChallengeBond = _initialMinBounty;
        treasury = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);

        for (uint256 i = 0; i < initialResolvers.length; i++) {
            address resolver = initialResolvers[i];
            if (resolver == address(0)) revert InvalidAddress();
            if (resolvers[resolver]) revert AlreadyExists();
            resolvers[resolver] = true;
            resolverCount++;
            emit ResolverUpdated(resolver, true);
        }

        _setResolverThreshold(initialThreshold);
    }

    function registerAgent(string calldata metadataURI) external payable whenNotPaused {
        if (msg.value < REGISTRATION_STAKE) revert InsufficientStake();
        AgentProfile storage profile = agentProfiles[msg.sender];
        if (!profile.registered) {
            profile.registered = true;
            profile.registeredAt = uint64(block.timestamp);
            profile.stake = uint96(msg.value);
            profile.metadataURI = metadataURI;
            emit AgentRegistered(msg.sender, metadataURI);
        } else {
            profile.metadataURI = metadataURI;
            profile.stake += uint96(msg.value);
            emit AgentMetadataUpdated(msg.sender, metadataURI);
        }
    }

    function registerService(string calldata serviceId, uint256 priceWei, address recipient)
        external
        onlyRegisteredAgent
        whenNotPaused
    {
        if (bytes(serviceId).length == 0) revert InvalidValue();
        if (priceWei == 0 || priceWei > type(uint128).max) revert InvalidValue();
        if (recipient == address(0)) revert InvalidAddress();

        bytes32 serviceKey = keccak256(bytes(serviceId));
        Service storage service = _services[serviceKey];

        if (service.owner == address(0)) {
            service.owner = msg.sender;
            service.createdAt = uint64(block.timestamp);
            service.serviceId = serviceId;
            serviceKeys.push(serviceKey);
            emit ServiceRegistered(msg.sender, serviceId, priceWei, recipient);
        } else {
            if (service.owner != msg.sender) revert NotAuthorized();
        }

        service.recipient = recipient;
        service.priceWei = uint128(priceWei);
        service.active = true;

        emit ServiceUpdated(msg.sender, serviceId, priceWei, recipient, true);
    }

    function setServiceStatus(string calldata serviceId, bool active) external onlyRegisteredAgent {
        bytes32 serviceKey = keccak256(bytes(serviceId));
        Service storage service = _services[serviceKey];
        if (service.owner != msg.sender) revert NotFound();
        service.active = active;
        emit ServiceUpdated(msg.sender, serviceId, service.priceWei, service.recipient, active);
    }

    function payForService(bytes32 challengeId, string calldata serviceId)
        external
        payable
        whenNotPaused
        nonReentrant
    {
        if (challengeId == bytes32(0)) revert InvalidValue();
        if (challengeConsumed[challengeId]) revert ChallengeConsumed();
        bytes32 serviceKey = keccak256(bytes(serviceId));
        Service storage service = _services[serviceKey];
        if (service.owner == address(0)) revert NotFound();
        if (!service.active) revert ServiceInactive();
        if (msg.value < service.priceWei) revert InsufficientPayment();

        challengeConsumed[challengeId] = true;
        service.totalCalls += 1;
        service.totalRevenue += uint128(service.priceWei);
        pendingWithdrawals[service.recipient] += service.priceWei;

        uint256 refund = msg.value - service.priceWei;
        if (refund > 0) {
            (bool okRefund, ) = msg.sender.call{value: refund}("");
            if (!okRefund) revert TransferFailed();
        }

        emit ServicePayment(msg.sender, service.recipient, service.serviceId, service.priceWei);
    }

    function commitPrediction(
        bytes32 predictionHash,
        string calldata symbol,
        uint8 conviction,
        uint96 entry,
        uint96 target,
        uint96 stop
    ) external onlyRegisteredAgent whenNotPaused {
        if (predictionHash == bytes32(0)) revert InvalidValue();
        if (bytes(symbol).length == 0) revert InvalidValue();
        if (conviction > 100) revert InvalidValue();
        if (entry == 0) revert InvalidValue();
        if (target == 0 && stop == 0) revert InvalidValue();
        /// @dev Codex r2 #6: the levels must describe ONE direction. Long is
        ///      target > entry > stop; short is target < entry < stop. A single
        ///      level is enough but must sit off the entry; two levels must agree.
        if (target != 0 && target == entry) revert InvalidValue();
        if (stop != 0 && stop == entry) revert InvalidValue();
        if (target != 0 && stop != 0) {
            bool longSide = target > entry && stop < entry;
            bool shortSide = target < entry && stop > entry;
            if (!longSide && !shortSide) revert InvalidValue();
        }
        if (_predictions[predictionHash].agent != address(0)) revert AlreadyExists();

        _predictions[predictionHash] = Prediction({
            agent: msg.sender,
            committedAt: uint64(block.timestamp),
            minResolveAt: uint64(block.timestamp + minPredictionAge),
            resolvedAt: 0,
            conviction: conviction,
            result: PredictionResult.NONE,
            entryPrice: entry,
            hardnessScore: 0,
            targetPrice: target,
            stopPrice: stop,
            exitPrice: 0,
            pnlBps: 0,
            symbol: symbol
        });

        emit PredictionCommitted(msg.sender, predictionHash, symbol, conviction);
    }

    function resolvePrediction(
        bytes32 predictionHash,
        int32 pnlBps,
        PredictionResult result,
        uint96 exitPrice
    ) external whenNotPaused {
        Prediction storage prediction = _predictions[predictionHash];
        if (prediction.agent == address(0)) revert NotFound();
        if (prediction.result != PredictionResult.NONE) revert AlreadyResolved();
        if (exitPrice == 0) revert InvalidValue();
        if (block.timestamp < prediction.minResolveAt) revert TooSoon();
        if (block.timestamp > prediction.committedAt + predictionTTL) revert Expired();
        /// @dev Kimi/Codex audit (Base r4, CRITICAL): being a registered agent must NOT
        /// grant resolution rights over other agents' predictions. Final audit
        /// 2026-09-03 (P0-3): nor over its OWN — with no oracle in this contract the
        /// exit price is caller-supplied, so a self-resolving agent minted a perfect
        /// record for one stake plus gas. Only an approved resolver may resolve.
        if (!resolvers[msg.sender]) revert NotAuthorized();
        if (result == PredictionResult.NONE || result == PredictionResult.EXPIRED) revert InvalidResult();

        /// @dev P0-3, second half: the outcome is DERIVED from the committed prices
        /// and the exit price, never taken on faith — the same gate v1's
        /// resolveTrade has always had. The reported pnlBps must agree with the
        /// derived figure within PNL_TOLERANCE_BPS; the derived figure is stored.
        int256 computed = _derivePnlBps(prediction, exitPrice);
        PredictionResult derived = computed > 0 ? PredictionResult.WIN : computed < 0 ? PredictionResult.LOSS : PredictionResult.BREAK_EVEN;
        if (derived != result) revert InvalidResult();
        int256 delta = int256(pnlBps) - computed;
        if (delta < 0) delta = -delta;
        if (delta > int256(uint256(PNL_TOLERANCE_BPS))) revert InvalidResult();
        if (computed > int256(type(int32).max) || computed < int256(type(int32).min)) revert InvalidValue();

        prediction.result = result;
        prediction.resolvedAt = uint64(block.timestamp);
        prediction.exitPrice = exitPrice;
        prediction.pnlBps = int32(computed);

        AgentStats storage stats = _agentStats[prediction.agent];
        stats.totalResolved += 1;
        if (result == PredictionResult.WIN) {
            stats.wins += 1;
        } else if (result == PredictionResult.LOSS) {
            stats.losses += 1;
        } else {
            stats.breakEvens += 1;
        }
        stats.winRateBps = _computeWinRate(stats.wins, stats.losses, stats.breakEvens);

        // Codex r2 #5: emit what was stored, not what was reported.
        emit PredictionResolved(msg.sender, prediction.agent, predictionHash, result, int32(computed));
    }

    function expirePrediction(bytes32 predictionHash) external {
        Prediction storage prediction = _predictions[predictionHash];
        if (prediction.agent == address(0)) revert NotFound();
        if (prediction.result != PredictionResult.NONE) revert AlreadyResolved();
        if (block.timestamp <= prediction.committedAt + predictionTTL) revert TooSoon();

        prediction.result = PredictionResult.EXPIRED;
        prediction.resolvedAt = uint64(block.timestamp);
        prediction.exitPrice = prediction.entryPrice;

        AgentStats storage stats = _agentStats[prediction.agent];
        stats.totalResolved += 1;
        stats.expired += 1;
        stats.winRateBps = _computeWinRate(stats.wins, stats.losses, stats.breakEvens);

        emit PredictionExpired(msg.sender, prediction.agent, predictionHash);
        emit PredictionResolved(msg.sender, prediction.agent, predictionHash, PredictionResult.EXPIRED, 0);
    }

    function publishSignal(
        string calldata symbol,
        uint8 hardnessScore,
        uint8 direction,
        uint8 conviction,
        bytes32 context
    ) external onlyRegisteredAgent whenNotPaused {
        if (bytes(symbol).length == 0) revert InvalidValue();
        if (direction > uint8(Direction.SHORT)) revert InvalidValue();
        if (conviction > 100) revert InvalidValue();

        bytes32 symbolHash = keccak256(bytes(symbol));
        uint64 expiry = uint64(block.timestamp + defaultSignalTTL);

        _signals[msg.sender][symbolHash] = Signal({
            agent: msg.sender,
            timestamp: uint64(block.timestamp),
            expiresAt: expiry,
            conviction: conviction,
            hardnessScore: hardnessScore,
            direction: Direction(direction),
            context: context,
            symbol: symbol
        });

        if (signalSymbolIndex[symbolHash] == 0) {
            signalSymbols.push(symbolHash);
            signalSymbolIndex[symbolHash] = signalSymbols.length;
            symbolName[symbolHash] = symbol;
        }

        if (!symbolAgentSeen[symbolHash][msg.sender]) {
            symbolAgentSeen[symbolHash][msg.sender] = true;
            _symbolAgents[symbolHash].push(msg.sender);
        }

        emit SignalPublished(msg.sender, symbolHash, symbol, hardnessScore, direction, conviction, context);
    }

    function postBounty(
        string calldata threadId,
        BountyDimension dimension,
        uint32 claimWindowSecs
    ) external payable whenNotPaused returns (uint256 bountyId) {
        if (msg.value < minBounty) revert InsufficientPayment();
        if (msg.value > type(uint96).max) revert InvalidValue();
        if (bytes(threadId).length == 0) revert InvalidValue();

        uint32 window = claimWindowSecs > 0 ? claimWindowSecs : defaultClaimWindow;
        if (window < 1 hours || window > 90 days) revert InvalidValue();
        if (resolverThreshold == 0) revert NoResolvers();

        bountyId = nextBountyId++;
        bounties[bountyId] = Bounty({
            threadHash: keccak256(bytes(threadId)),
            poster: msg.sender,
            winner: address(0),
            reward: uint96(msg.value),
            createdAt: uint64(block.timestamp),
            claimWindowSecs: window,
            challengeCount: 0,
            approvalCount: 0,
            approvalThreshold: resolverThreshold,
            gracePeriodSnapshot: challengeGracePeriod,
            dimension: dimension,
            status: BountyStatus.OPEN
        });

        bountyBond[bountyId] = bountyChallengeBond; // Codex r4: fixed at post time

        emit BountyPosted(bountyId, msg.sender, keccak256(bytes(threadId)), dimension, uint96(msg.value));
    }

    function submitChallenge(uint256 bountyId, bytes32 evidenceHash) external payable whenNotPaused {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster == address(0)) revert NotFound();
        if (bounty.status != BountyStatus.OPEN && bounty.status != BountyStatus.CHALLENGED) revert InvalidValue();
        if (msg.sender == bounty.poster) revert NotAuthorized();
        // Codex r2 #2: the parties that adjudicate cannot also contest.
        if (resolvers[msg.sender] || msg.sender == owner) revert NotAuthorized();
        if (evidenceHash == bytes32(0)) revert InvalidValue();
        if (hasChallenged[bountyId][msg.sender]) revert AlreadyChallenged();
        if (bounty.challengeCount >= maxChallengesPerBounty) revert MaxChallenges();
        if (block.timestamp >= uint256(bounty.createdAt) + bounty.claimWindowSecs) revert WindowExpired();

        // Codex r3: a bond per challenge; returned to the winner, forfeited to the poster otherwise.
        if (msg.value != bountyBond[bountyId]) revert InsufficientPayment();
        bountyChallengeBondOf[bountyId][msg.sender] = uint96(msg.value);
        hasChallenged[bountyId][msg.sender] = true;
        _challenges[bountyId].push(Challenge({
            challenger: msg.sender,
            evidenceHash: evidenceHash,
            submittedAt: uint64(block.timestamp)
        }));
        bounty.challengeCount += 1;
        if (bounty.status == BountyStatus.OPEN) {
            bounty.status = BountyStatus.CHALLENGED;
        }

        emit ChallengeSubmitted(bountyId, msg.sender, evidenceHash);
    }

    /// @dev Audit Base r5 [HIGH]: intentionally NOT `whenNotPaused` — same principle
    /// as BobbyAdversarialBounties.resolveBounty. Pausing must stop new value
    /// entering, never settlement of value already owed: a pause spanning the
    /// grace window would lock resolvers out while the poster's reclaim clock
    /// keeps running, letting the poster take back a bounty a challenger won.
    function approveBountyResolution(uint256 bountyId, address winner) external {
        if (!resolvers[msg.sender]) revert NotAuthorized();
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster == address(0)) revert NotFound();
        if (bounty.status != BountyStatus.CHALLENGED) revert InvalidValue();
        if (winner == address(0)) revert InvalidAddress();
        if (resolvers[winner] || winner == owner) revert NotAuthorized();
        if (!hasChallenged[bountyId][winner]) revert NotFound();
        if (block.timestamp >= _effectiveExpiry(bounty)) revert WindowExpired();

        uint256 round = resolutionRound[bountyId];
        if (proposedWinner[bountyId] != winner) {
            proposedWinner[bountyId] = winner;
            round = round + 1;
            resolutionRound[bountyId] = round;
            bounty.approvalCount = 0;
        }

        if (hasApprovedResolution[bountyId][round][msg.sender]) revert AlreadyApproved();
        hasApprovedResolution[bountyId][round][msg.sender] = true;
        _roundApprovers[bountyId][round].push(msg.sender);
        // Codex r4: count only approvers who are STILL resolvers — a revoked key's
        // vote must not linger in an open round.
        address[] storage approvers = _roundApprovers[bountyId][round];
        uint8 active = 0;
        for (uint256 i = 0; i < approvers.length; i++) {
            if (resolvers[approvers[i]]) active += 1;
        }
        bounty.approvalCount = active;

        emit BountyResolutionApproved(
            bountyId,
            round,
            msg.sender,
            winner,
            bounty.approvalCount,
            bounty.approvalThreshold
        );

        if (bounty.approvalCount >= bounty.approvalThreshold) {
            // Codex r2 #2: quorum proposes; the pot moves in finalizeBountyResolution.
            bounty.winner = winner;
            bounty.status = BountyStatus.PENDING_RESOLUTION;
            bountyResolutionProposedAt[bountyId] = uint64(block.timestamp);
            uint64 finalizeAfter = uint64(block.timestamp) + bountyDisputeWindow;
            bountyResolutionFinalizeAfter[bountyId] = finalizeAfter;
            emit BountyResolutionProposed(bountyId, winner, bounty.reward, finalizeAfter);
        }
    }

    /// @dev Permissionless, not pausable: pays the proposed winner after the window.
    function finalizeBountyResolution(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster == address(0)) revert NotFound();
        if (bounty.status != BountyStatus.PENDING_RESOLUTION) revert InvalidValue();
        if (block.timestamp < bountyResolutionFinalizeAfter[bountyId]) revert TooSoon();

        bounty.status = BountyStatus.RESOLVED;
        pendingWithdrawals[bounty.winner] += bounty.reward;
        _settleBountyChallengeBonds(bountyId, bounty.winner);
        emit BountyResolved(bountyId, bounty.winner, bounty.reward);
    }

    /// @dev The poster or any challenger other than the proposed winner may freeze
    ///      a proposal inside the window.
    /// @dev Codex r3: the owner (Safe) may dispute without a bond; parties post one.
    function disputeBountyResolution(uint256 bountyId) external payable {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster == address(0)) revert NotFound();
        if (bounty.status != BountyStatus.PENDING_RESOLUTION) revert InvalidValue();
        if (block.timestamp >= bountyResolutionFinalizeAfter[bountyId]) revert WindowExpired();
        if (msg.sender != owner && msg.sender != bounty.poster && !hasChallenged[bountyId][msg.sender]) revert NotAuthorized();
        if (msg.sender == bounty.winner) revert NotAuthorized();
        if (msg.sender == owner) {
            if (msg.value != 0) revert InvalidValue();
        } else {
            if (msg.value != bountyBond[bountyId]) revert InsufficientPayment();
            bountyDisputeBondOf[bountyId] = uint96(msg.value);
        }

        bounty.status = BountyStatus.DISPUTED;
        bountyDisputedBy[bountyId] = msg.sender;
        bountyDisputedAt[bountyId] = uint64(block.timestamp);
        bountySettlementAfter[bountyId] = uint64(block.timestamp) + bountyDisputeSettlementTimeout; // Codex r4: snapshot
        emit BountyResolutionDisputed(bountyId, msg.sender);
    }

    /// @dev Owner settles: a challenger (never a resolver or the owner), or
    ///      address(0) to refund the poster.
    function settleBountyDispute(uint256 bountyId, address winner) external onlyOwner {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster == address(0)) revert NotFound();
        if (bounty.status != BountyStatus.DISPUTED) revert InvalidValue();

        address proposed = bounty.winner;
        if (winner == address(0)) {
            bounty.winner = address(0);
            bounty.status = BountyStatus.WITHDRAWN;
            pendingWithdrawals[bounty.poster] += bounty.reward;
            _returnAllBountyChallengeBonds(bountyId);
            _payBountyDisputeBond(bountyId, bountyDisputedBy[bountyId]);
            emit BountyWithdrawn(bountyId, bounty.poster, bounty.reward);
            emit BountyDisputeSettled(bountyId, address(0), true);
            return;
        }
        if (!hasChallenged[bountyId][winner]) revert NotFound();
        if (resolvers[winner] || winner == owner) revert NotAuthorized();
        bounty.winner = winner;
        bounty.status = BountyStatus.RESOLVED;
        pendingWithdrawals[winner] += bounty.reward;
        _settleBountyChallengeBonds(bountyId, winner);
        _payBountyDisputeBond(bountyId, winner == proposed ? treasury : bountyDisputedBy[bountyId]); // rejected → treasury
        emit BountyResolved(bountyId, winner, bounty.reward);
        emit BountyDisputeSettled(bountyId, winner, false);
    }

    /// @dev Codex r4: an unsettled dispute is not a permanent lock, and stalling is
    ///      not free either — the quorum's proposal STANDS and the disputer's bond
    ///      goes to the treasury. The Safe must rule on a real shill within the
    ///      window (and may dispute on its own, without a bond).
    function resolveStalledBountyDispute(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster == address(0)) revert NotFound();
        if (bounty.status != BountyStatus.DISPUTED) revert InvalidValue();
        if (block.timestamp < bountySettlementAfter[bountyId]) revert TooSoon();

        bounty.status = BountyStatus.RESOLVED;
        pendingWithdrawals[bounty.winner] += bounty.reward;
        _settleBountyChallengeBonds(bountyId, bounty.winner);
        _payBountyDisputeBond(bountyId, treasury);
        emit BountyDisputeTimedOut(bountyId, bounty.winner, bounty.reward);
        emit BountyResolved(bountyId, bounty.winner, bounty.reward);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setBountyChallengeBond(uint96 bond) external onlyOwner {
        if (bond < ABSOLUTE_MIN_BOUNTY) revert InvalidValue();
        if (bond > ABSOLUTE_MIN_BOUNTY * MAX_BOUNTY_BOND_MULTIPLIER) revert InvalidValue(); // Codex r4
        emit BountyChallengeBondUpdated(bountyChallengeBond, bond);
        bountyChallengeBond = bond;
    }

    function setBountyDisputeSettlementTimeout(uint32 secondsTimeout) external onlyOwner {
        if (secondsTimeout < MIN_BOUNTY_SETTLEMENT_TIMEOUT || secondsTimeout > MAX_BOUNTY_SETTLEMENT_TIMEOUT) revert InvalidValue();
        emit BountyDisputeSettlementTimeoutUpdated(bountyDisputeSettlementTimeout, secondsTimeout);
        bountyDisputeSettlementTimeout = secondsTimeout;
    }

    /// @dev Codex r4: losers' bonds go to the treasury, never to the poster.
    function _settleBountyChallengeBonds(uint256 bountyId, address winner) internal {
        Challenge[] storage cs = _challenges[bountyId];
        address sink = treasury;
        for (uint256 i = 0; i < cs.length; i++) {
            address c = cs[i].challenger;
            uint96 bond = bountyChallengeBondOf[bountyId][c];
            if (bond == 0) continue;
            bountyChallengeBondOf[bountyId][c] = 0;
            pendingWithdrawals[c == winner ? c : sink] += bond;
        }
    }

    function _returnAllBountyChallengeBonds(uint256 bountyId) internal {
        Challenge[] storage cs = _challenges[bountyId];
        for (uint256 i = 0; i < cs.length; i++) {
            address c = cs[i].challenger;
            uint96 bond = bountyChallengeBondOf[bountyId][c];
            if (bond == 0) continue;
            bountyChallengeBondOf[bountyId][c] = 0;
            pendingWithdrawals[c] += bond;
        }
    }

    function _payBountyDisputeBond(uint256 bountyId, address to) internal {
        uint96 bond = bountyDisputeBondOf[bountyId];
        if (bond == 0) return;
        bountyDisputeBondOf[bountyId] = 0;
        pendingWithdrawals[to] += bond;
    }

    function setBountyDisputeWindow(uint32 secondsWindow) external onlyOwner {
        if (secondsWindow < MIN_BOUNTY_DISPUTE_WINDOW || secondsWindow > MAX_BOUNTY_DISPUTE_WINDOW) revert InvalidValue();
        emit BountyDisputeWindowUpdated(bountyDisputeWindow, secondsWindow);
        bountyDisputeWindow = secondsWindow;
    }

    function withdrawBounty(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster != msg.sender) revert NotAuthorized();
        if (bounty.status != BountyStatus.OPEN && bounty.status != BountyStatus.CHALLENGED) revert AlreadyResolved();
        if (block.timestamp < _effectiveExpiry(bounty)) revert TooSoon();

        bounty.status = BountyStatus.WITHDRAWN;
        pendingWithdrawals[msg.sender] += bounty.reward;
        _returnAllBountyChallengeBonds(bountyId); // Codex r3
        emit BountyWithdrawn(bountyId, msg.sender, bounty.reward);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert InvalidValue();
        pendingWithdrawals[msg.sender] = 0;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawal(msg.sender, amount);
    }

    function getService(string calldata serviceId) external view returns (Service memory) {
        return _services[keccak256(bytes(serviceId))];
    }

    function getPrediction(bytes32 predictionHash) external view returns (Prediction memory) {
        return _predictions[predictionHash];
    }

    function getAgentStats(address agent) external view returns (uint256 wins, uint256 losses, uint256 winRateBps) {
        AgentStats storage stats = _agentStats[agent];
        return (stats.wins, stats.losses, stats.winRateBps);
    }

    function getAgentStatsFull(address agent) external view returns (AgentStats memory) {
        return _agentStats[agent];
    }

    function getSignal(address agent, string calldata symbol) external view returns (Signal memory) {
        return _signals[agent][keccak256(bytes(symbol))];
    }

    // getConsensus removed to fit EIP-170 size limit — use off-chain indexing via events

    function getChallenges(uint256 bountyId, uint256 offset, uint256 limit)
        external
        view
        returns (Challenge[] memory page)
    {
        Challenge[] storage items = _challenges[bountyId];
        uint256 total = items.length;
        if (offset >= total) {
            return new Challenge[](0);
        }

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;

        page = new Challenge[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = items[offset + i];
        }
    }

    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }

    function updateResolver(address resolver, bool active) external onlyOwner {
        if (resolver == address(0)) revert InvalidAddress();
        if (active) {
            if (resolvers[resolver]) revert AlreadyExists();
            resolvers[resolver] = true;
            resolverCount += 1;
        } else {
            if (!resolvers[resolver]) revert NotFound();
            if (resolverCount <= 1 && resolverThreshold != 0) revert InvalidValue();
            resolvers[resolver] = false;
            resolverCount -= 1;
            if (resolverThreshold > resolverCount) revert ThresholdTooHigh();
        }

        emit ResolverUpdated(resolver, active);
    }

    function setHardnessScorer(address newScorer) external onlyOwner {
        hardnessScorer = newScorer;
    }

    function certifyHardness(bytes32 predictionHash, uint8 hardnessScore) external {
        if (msg.sender != hardnessScorer && msg.sender != owner) revert NotAuthorized();
        Prediction storage prediction = _predictions[predictionHash];
        if (prediction.agent == address(0)) revert NotFound();

        prediction.hardnessScore = hardnessScore;
        emit HardnessCertified(predictionHash, hardnessScore);
    }

    function slashAgent(address agent, uint256 amount, bytes32 reason) external {
        if (msg.sender != owner && msg.sender != hardnessScorer) revert NotAuthorized();
        AgentProfile storage profile = agentProfiles[agent];
        if (profile.stake < amount) amount = profile.stake;

        profile.stake -= uint96(amount);
        pendingWithdrawals[owner] += amount;

        emit AgentSlashed(agent, amount, reason);
    }

    function setResolverThreshold(uint8 newThreshold) external onlyOwner {
        _setResolverThreshold(newThreshold);
    }

    function setMinPredictionAge(uint256 newAge) external onlyOwner {
        if (newAge < 10 minutes) revert InvalidValue();
        minPredictionAge = newAge;
    }

    function setPredictionTTL(uint256 newTTL) external onlyOwner {
        if (newTTL < 1 hours) revert InvalidValue();
        predictionTTL = newTTL;
    }

    function setDefaultSignalTTL(uint256 newTTL) external onlyOwner {
        if (newTTL < 1 minutes) revert InvalidValue();
        defaultSignalTTL = newTTL;
    }

    function setMinBounty(uint96 newMinBounty) external onlyOwner {
        if (newMinBounty < ABSOLUTE_MIN_BOUNTY) revert InvalidValue();
        minBounty = newMinBounty;
    }

    function setChallengeGracePeriod(uint32 newGracePeriod) external onlyOwner {
        /// @dev Audit Base r5 [MED]: cap at 30 days to match BobbyAdversarialBounties —
        /// an unbounded grace lets a future owner park bounties in limbo indefinitely.
        if (newGracePeriod > 30 days) revert InvalidValue();
        challengeGracePeriod = newGracePeriod;
    }

    function setDefaultClaimWindow(uint32 newWindow) external onlyOwner {
        if (newWindow < 1 hours || newWindow > 90 days) revert InvalidValue();
        defaultClaimWindow = newWindow;
    }

    function setMaxChallengesPerBounty(uint8 newMax) external onlyOwner {
        if (newMax == 0) revert InvalidValue();
        maxChallengesPerBounty = newMax;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotAuthorized();
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

    function _effectiveExpiry(Bounty storage bounty) internal view returns (uint256) {
        uint256 expiry = uint256(bounty.createdAt) + uint256(bounty.claimWindowSecs);
        if (bounty.status == BountyStatus.CHALLENGED) {
            expiry += uint256(bounty.gracePeriodSnapshot);
        }
        return expiry;
    }

    function _setResolverThreshold(uint8 newThreshold) internal {
        if (newThreshold == 0) revert InvalidValue();
        if (newThreshold > resolverCount) revert ThresholdTooHigh();
        uint8 oldThreshold = resolverThreshold;
        resolverThreshold = newThreshold;
        emit ResolverThresholdUpdated(oldThreshold, newThreshold);
    }

    /// @dev Final audit P0-3. Direction is inferred from the committed levels:
    ///      target above entry (or stop below it) is long; the mirror is short.
    ///      A commit whose target and stop both sit ON the entry has no direction
    ///      and cannot be resolved as anything but expired. Returns signed bps.
    function _derivePnlBps(Prediction storage p, uint96 exitPrice) internal view returns (int256) {
        uint256 entry = p.entryPrice; // non-zero: enforced at commit
        bool isLong;
        if (p.targetPrice != 0 && p.targetPrice != entry) isLong = p.targetPrice > entry;
        else if (p.stopPrice != 0 && p.stopPrice != entry) isLong = p.stopPrice < entry;
        else revert InvalidValue();
        int256 move = int256(uint256(exitPrice)) - int256(entry);
        if (!isLong) move = -move;
        return (move * 10000) / int256(entry);
    }

    function _computeWinRate(uint64 wins, uint64 losses, uint64 breakEvens) internal pure returns (uint32) {
        uint256 denominator = uint256(wins) + uint256(losses) + uint256(breakEvens);
        if (denominator == 0) {
            return 0;
        }
        return uint32((uint256(wins) * 10000) / denominator);
    }
}
