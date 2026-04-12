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
        WITHDRAWN
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

    uint96 public constant ABSOLUTE_MIN_BOUNTY = 0.0001 ether;
    uint96 public constant REGISTRATION_STAKE = 0.01 ether;
    uint96 public minBounty = 0.001 ether;
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
    mapping(address => bool) public resolvers;
    mapping(uint256 => address) public proposedWinner;
    mapping(uint256 => uint256) public resolutionRound;
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

    constructor(address[] memory initialResolvers, uint8 initialThreshold) {
        owner = msg.sender;
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
        if (
            msg.sender != prediction.agent && !agentProfiles[msg.sender].registered && !resolvers[msg.sender]
        ) revert NotAuthorized();
        if (result == PredictionResult.NONE || result == PredictionResult.EXPIRED) revert InvalidResult();

        if (result == PredictionResult.WIN) {
            if (pnlBps <= 0) revert InvalidResult();
        } else if (result == PredictionResult.LOSS) {
            if (pnlBps >= 0) revert InvalidResult();
        } else {
            if (pnlBps != 0) revert InvalidResult();
        }

        prediction.result = result;
        prediction.resolvedAt = uint64(block.timestamp);
        prediction.exitPrice = exitPrice;
        prediction.pnlBps = pnlBps;

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

        emit PredictionResolved(msg.sender, prediction.agent, predictionHash, result, pnlBps);
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

        emit BountyPosted(bountyId, msg.sender, keccak256(bytes(threadId)), dimension, uint96(msg.value));
    }

    function submitChallenge(uint256 bountyId, bytes32 evidenceHash) external whenNotPaused {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster == address(0)) revert NotFound();
        if (bounty.status != BountyStatus.OPEN && bounty.status != BountyStatus.CHALLENGED) revert InvalidValue();
        if (msg.sender == bounty.poster) revert NotAuthorized();
        if (evidenceHash == bytes32(0)) revert InvalidValue();
        if (hasChallenged[bountyId][msg.sender]) revert AlreadyChallenged();
        if (bounty.challengeCount >= maxChallengesPerBounty) revert MaxChallenges();
        if (block.timestamp >= uint256(bounty.createdAt) + bounty.claimWindowSecs) revert WindowExpired();

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

    function approveBountyResolution(uint256 bountyId, address winner) external whenNotPaused {
        if (!resolvers[msg.sender]) revert NotAuthorized();
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster == address(0)) revert NotFound();
        if (bounty.status != BountyStatus.CHALLENGED) revert InvalidValue();
        if (winner == address(0)) revert InvalidAddress();
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
        bounty.approvalCount += 1;

        emit BountyResolutionApproved(
            bountyId,
            round,
            msg.sender,
            winner,
            bounty.approvalCount,
            bounty.approvalThreshold
        );

        if (bounty.approvalCount >= bounty.approvalThreshold) {
            bounty.winner = winner;
            bounty.status = BountyStatus.RESOLVED;
            pendingWithdrawals[winner] += bounty.reward;
            emit BountyResolved(bountyId, winner, bounty.reward);
        }
    }

    function withdrawBounty(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.poster != msg.sender) revert NotAuthorized();
        if (bounty.status != BountyStatus.OPEN && bounty.status != BountyStatus.CHALLENGED) revert AlreadyResolved();
        if (block.timestamp < _effectiveExpiry(bounty)) revert TooSoon();

        bounty.status = BountyStatus.WITHDRAWN;
        pendingWithdrawals[msg.sender] += bounty.reward;
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

    function _computeWinRate(uint64 wins, uint64 losses, uint64 breakEvens) internal pure returns (uint32) {
        uint256 denominator = uint256(wins) + uint256(losses) + uint256(breakEvens);
        if (denominator == 0) {
            return 0;
        }
        return uint32((uint256(wins) * 10000) / denominator);
    }
}
