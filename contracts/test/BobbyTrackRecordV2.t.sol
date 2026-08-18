// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {BobbyTrackRecordV2, IPyth, PythStructs} from "../src/BobbyTrackRecordV2.sol";

/// @dev Deterministic Pyth stand-in enforcing the REAL parseUnique contract:
///      exact fee, id match, and prev < min <= publishTime <= max.
contract MockPyth {
    uint256 public fee = 10;

    function setFee(uint256 f) external { fee = f; }

    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        return fee;
    }

    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PythStructs.PriceFeed[] memory out) {
        require(msg.value >= fee, "MockPyth: fee");
        out = new PythStructs.PriceFeed[](priceIds.length);
        for (uint256 i = 0; i < priceIds.length; i++) {
            (bytes32 id, int64 price, uint64 conf, int32 expo, uint64 pt, uint64 prev) =
                abi.decode(updateData[i], (bytes32, int64, uint64, int32, uint64, uint64));
            require(id == priceIds[i], "MockPyth: id");
            require(prev < minPublishTime && minPublishTime <= pt && pt <= maxPublishTime, "MockPyth: window");
            out[i] = PythStructs.PriceFeed(id, PythStructs.Price(price, conf, expo, pt), PythStructs.Price(price, conf, expo, pt));
        }
    }

    /// @dev Non-unique bounded parse (A1-1): signature + publishTime range only,
    ///      no first-tick-in-window precondition — mirrors the real IPyth.
    function parsePriceFeedUpdates(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PythStructs.PriceFeed[] memory out) {
        require(msg.value >= fee, "MockPyth: fee");
        out = new PythStructs.PriceFeed[](priceIds.length);
        for (uint256 i = 0; i < priceIds.length; i++) {
            (bytes32 id, int64 price, uint64 conf, int32 expo, uint64 pt,) =
                abi.decode(updateData[i], (bytes32, int64, uint64, int32, uint64, uint64));
            require(id == priceIds[i], "MockPyth: id");
            require(minPublishTime <= pt && pt <= maxPublishTime, "MockPyth: window");
            out[i] = PythStructs.PriceFeed(id, PythStructs.Price(price, conf, expo, pt), PythStructs.Price(price, conf, expo, pt));
        }
    }
}

/// @dev Recorder that rejects ETH, to exercise the retained-refund path.
contract RejectingRecorder {
    BobbyTrackRecordV2 rec;
    constructor(BobbyTrackRecordV2 _rec) { rec = _rec; }
    function commit(bytes32 h, bytes[] calldata d, uint96 e, uint96 tg, uint96 s) external payable {
        rec.commitTrade{value: msg.value}(h, "BTC", BobbyTrackRecordV2.Agent.CIO, 5, e, tg, s, BobbyTrackRecordV2.PriceMode.VERIFIED, d);
    }
    // no receive() → any refund .call reverts, forcing the retained path
}

contract MockAggregator {
    int256 public answer;
    uint256 public updatedAt;
    uint8 public decimals = 8;

    function set(int256 a, uint256 u) external { answer = a; updatedAt = u; }
    function setDecimals(uint8 d) external { decimals = d; }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract BobbyTrackRecordV2Test is Test {
    BobbyTrackRecordV2 rec;
    MockPyth pyth;
    MockAggregator agg;

    bytes32 constant BTC_FEED = bytes32(uint256(0xB7C));
    uint64 constant T0 = 1_800_000_000;

    // Long BTC: entry 63,000, stop 62,000, target 66,000 (1e8 scale)
    uint96 constant ENTRY = 63_000e8;
    uint96 constant STOP = 62_000e8;
    uint96 constant TARGET = 66_000e8;

    event OracleDiscrepancy(bytes32 indexed debateHash, uint256 oracle1e8, uint256 chainlink1e8);
    event TradeReclassified(
        uint256 indexed tradeId, bytes32 indexed debateHash,
        BobbyTrackRecordV2.Result oldResult, BobbyTrackRecordV2.Result newResult,
        int256 oldPnlBps, int256 newPnlBps, string reason
    );

    receive() external payable {}

    function setUp() public {
        vm.warp(T0);
        pyth = new MockPyth();
        agg = new MockAggregator();

        BobbyTrackRecordV2.VerificationParams memory p = BobbyTrackRecordV2.VerificationParams({
            entryWindowSec: 60,
            exitWindowSec: 120,
            maxExitLagSec: 3600,
            challengeWindowSec: 7 days,
            entryTolBps: 100,
            exitTolBps: 100,
            confMaxBps: 50
        });
        string[] memory syms = new string[](1);
        syms[0] = "BTC";
        bytes32[] memory feeds = new bytes32[](1);
        feeds[0] = BTC_FEED;
        address[] memory pyths = new address[](1);
        pyths[0] = address(pyth);

        rec = new BobbyTrackRecordV2(address(this), p, pyths, syms, feeds);
    }

    // ---- helpers ----

    function _update(int64 price, uint64 pt, uint64 prev) internal pure returns (bytes[] memory d) {
        d = new bytes[](1);
        d[0] = abi.encode(BTC_FEED, price, uint64(1_000_000), int32(-8), pt, prev);
    }

    function _commitVerified(bytes32 hash) internal {
        // entry oracle == ENTRY exactly. A1-3: REALISTIC ~1 Hz cadence —
        // prev = pt-1, the shape a live BTC/ETH/SOL feed actually produces.
        // Entry is the non-unique bounded parse, so this fresh tick passes.
        bytes[] memory d = _update(int64(uint64(ENTRY)), uint64(vm.getBlockTimestamp()) - 5, uint64(vm.getBlockTimestamp()) - 6);
        rec.commitTrade{value: 10}(
            hash, "BTC", BobbyTrackRecordV2.Agent.CIO, 7, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, d
        );
    }

    function _resolveWin(bytes32 hash) internal returns (uint64 exitAt) {
        vm.warp(T0 + 2 hours);
        exitAt = uint64(vm.getBlockTimestamp()) - 100;
        // A1-1: exit evidence is the FIRST tick at/after the declared exitAt
        // (Hermes benchmark shape): pt >= exitAt, prev < exitAt, 1s cadence.
        bytes[] memory d = _update(64_000e8, exitAt + 1, exitAt - 1);
        rec.resolveTrade{value: 10}(hash, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, d);
    }

    // ============ Commit ============

    function test_commit_verified_happy_storesEvidenceAndSnapshot() public {
        _commitVerified(keccak256("t1"));
        BobbyTrackRecordV2.Commitment memory c = rec.getCommitment(0);
        assertEq(uint8(c.mode), uint8(BobbyTrackRecordV2.PriceMode.VERIFIED));
        assertEq(c.entryEvidence.feedId, BTC_FEED);
        assertEq(c.entryEvidence.publishTime, T0 - 5);
        assertEq(c.entryWindowSec, 60);
        assertEq(c.challengeWindowSec, 7 days);
        (, , uint256 pending) = rec.getCoverage(BobbyTrackRecordV2.PriceMode.VERIFIED);
        assertEq(pending, 1);
    }

    function test_commit_snapshot_immuneToLaterSetParams() public {
        _commitVerified(keccak256("t1"));
        BobbyTrackRecordV2.VerificationParams memory p = BobbyTrackRecordV2.VerificationParams(
            30, 60, 1200, 3 days, 50, 50, 30
        );
        rec.setParams(p);
        BobbyTrackRecordV2.Commitment memory c = rec.getCommitment(0);
        assertEq(c.exitWindowSec, 120); // snapshot, not the new 60
        assertEq(c.challengeWindowSec, 7 days);
    }

    function test_commit_attested_v1PathVerbatim() public {
        bytes[] memory empty = new bytes[](0);
        rec.commitTrade(
            keccak256("a1"), "OKB", BobbyTrackRecordV2.Agent.ALPHA, 5, 50e8, 60e8, 0,
            BobbyTrackRecordV2.PriceMode.ATTESTED, empty
        );
        vm.expectRevert(bytes("Already committed"));
        rec.commitTrade(
            keccak256("a1"), "OKB", BobbyTrackRecordV2.Agent.ALPHA, 5, 50e8, 60e8, 0,
            BobbyTrackRecordV2.PriceMode.ATTESTED, empty
        );
    }

    function test_commit_modeMismatch_bothDirections() public {
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert(BobbyTrackRecordV2.ModeMismatch.selector);
        rec.commitTrade(
            keccak256("m1"), "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.ATTESTED, empty
        );
        vm.expectRevert(BobbyTrackRecordV2.ModeMismatch.selector);
        rec.commitTrade(
            keccak256("m2"), "OKB", BobbyTrackRecordV2.Agent.CIO, 5, 50e8, 60e8, 0,
            BobbyTrackRecordV2.PriceMode.VERIFIED, empty
        );
    }

    function test_commit_symbolCharsetEnforced() public {
        bytes[] memory empty = new bytes[](0);
        string[3] memory bad = ["btc", "BTC ", "B"];
        for (uint256 i = 0; i < bad.length; i++) {
            vm.expectRevert(BobbyTrackRecordV2.InvalidSymbol.selector);
            rec.commitTrade(
                keccak256(abi.encode("s", i)), bad[i], BobbyTrackRecordV2.Agent.CIO, 5, 50e8, 60e8, 0,
                BobbyTrackRecordV2.PriceMode.ATTESTED, empty
            );
        }
    }

    function test_commit_verified_requiresStopAndProof() public {
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert(BobbyTrackRecordV2.StopRequiredForVerified.selector);
        rec.commitTrade(
            keccak256("v1"), "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, TARGET, 0,
            BobbyTrackRecordV2.PriceMode.VERIFIED, empty
        );
        vm.expectRevert(BobbyTrackRecordV2.EntryProofRequired.selector);
        rec.commitTrade(
            keccak256("v2"), "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, empty
        );
    }

    function test_commit_verified_invalidDirection() public {
        bytes[] memory d = _update(int64(uint64(ENTRY)), T0 - 5, T0 - 70);
        // target and stop on the same side (both below entry)
        vm.expectRevert(BobbyTrackRecordV2.InvalidDirection.selector);
        rec.commitTrade{value: 10}(
            keccak256("d1"), "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, 62_500e8, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, d
        );
        // stop == entry
        vm.expectRevert(BobbyTrackRecordV2.InvalidDirection.selector);
        rec.commitTrade{value: 10}(
            keccak256("d2"), "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, TARGET, ENTRY,
            BobbyTrackRecordV2.PriceMode.VERIFIED, d
        );
    }

    function test_commit_verified_entryBandEnforced() public {
        // oracle 63,000 but reported entry 64,000 → 158 bps > 100 tol
        bytes[] memory d = _update(int64(uint64(ENTRY)), T0 - 5, T0 - 70);
        vm.expectRevert(BobbyTrackRecordV2.PriceOutOfBand.selector);
        rec.commitTrade{value: 10}(
            keccak256("b1"), "BTC", BobbyTrackRecordV2.Agent.CIO, 5, 64_000e8, 66_000e8, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, d
        );
    }

    function test_commit_attested_rejectsEvidenceAndValue() public {
        bytes[] memory d = _update(1e8, T0 - 5, T0 - 70);
        vm.expectRevert(BobbyTrackRecordV2.AttestedNoEvidence.selector);
        rec.commitTrade(
            keccak256("x1"), "OKB", BobbyTrackRecordV2.Agent.CIO, 5, 50e8, 60e8, 0,
            BobbyTrackRecordV2.PriceMode.ATTESTED, d
        );
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert(BobbyTrackRecordV2.AttestedNoValue.selector);
        rec.commitTrade{value: 1}(
            keccak256("x2"), "OKB", BobbyTrackRecordV2.Agent.CIO, 5, 50e8, 60e8, 0,
            BobbyTrackRecordV2.PriceMode.ATTESTED, empty
        );
    }

    function test_commit_refundsExcessFee() public {
        bytes[] memory d = _update(int64(uint64(ENTRY)), T0 - 5, T0 - 70);
        uint256 before = address(this).balance;
        rec.commitTrade{value: 1 ether}(
            keccak256("r1"), "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, d
        );
        assertEq(before - address(this).balance, 10); // only the fee was kept
        assertEq(address(rec).balance, 0);
    }

    // ============ Resolve ============

    function test_resolve_verified_win_oracleDerived() public {
        bytes32 h = keccak256("w1");
        _commitVerified(h);
        _resolveWin(h);

        assertEq(rec.winsVerified(), 1);
        assertEq(rec.getVerifiedWinRate(), 10000);
        assertEq(rec.getAttestedWinRate(), 0); // D-1: untouched
        BobbyTrackRecordV2.Trade memory t = rec.getTrade(0);
        assertEq(t.challengeDeadline, uint64(T0 + 2 hours) + 7 days);
        assertFalse(rec.isFinal(h));
        vm.warp(T0 + 2 hours + 7 days + 1);
        assertTrue(rec.isFinal(h));
    }

    function test_resolve_verified_resultMustMatchOracleSign() public {
        bytes32 h = keccak256("w2");
        _commitVerified(h);
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        // oracle says exit 64,000 (> entry, long) = WIN, recorder claims LOSS
        bytes[] memory d = _update(64_000e8, exitAt + 1, exitAt - 1);
        vm.expectRevert(BobbyTrackRecordV2.ResultContradictsOracle.selector);
        rec.resolveTrade{value: 10}(h, -50, BobbyTrackRecordV2.Result.LOSS, 64_000e8, exitAt, d);
    }

    function test_resolve_verified_reportedPnlToleranceBound() public {
        bytes32 h = keccak256("w3");
        _commitVerified(h);
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        // verified pnl = +158 bps; reported +300 deviates 142 > 100
        bytes[] memory d = _update(64_000e8, exitAt + 1, exitAt - 1);
        vm.expectRevert(BobbyTrackRecordV2.PnlOutOfTolerance.selector);
        rec.resolveTrade{value: 10}(h, 300, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, d);
    }

    function test_resolve_verified_exitAtBounds() public {
        bytes32 h = keccak256("w4");
        _commitVerified(h);
        vm.warp(T0 + 2 hours);
        bytes[] memory d = _update(64_000e8, T0 + 1, T0 - 400);

        vm.expectRevert(BobbyTrackRecordV2.ExitInFuture.selector);
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, uint64(vm.getBlockTimestamp()) + 1, d);

        vm.expectRevert(BobbyTrackRecordV2.ExitBeforeMinResolve.selector);
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, T0 + 30 minutes, d);

        vm.warp(T0 + 6 hours);
        vm.expectRevert(BobbyTrackRecordV2.ExitTooStale.selector);
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, T0 + 90 minutes, d);
    }

    function test_resolve_verified_windowRejectsEvidenceOutsideBenchmark() public {
        // A1-1: exit evidence is the FIRST tick at/after the declared exitAt
        // (benchmark semantics). A tick BEFORE exitAt fails min bound; a tick
        // past exitAt+exitWindowSec fails the max bound; and a tick that is not
        // the first-at/after (prev >= exitAt) fails Unique.
        bytes32 h = keccak256("w5");
        _commitVerified(h);
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 300;

        // tick before the declared exit — retroactive cherry-pick, rejected
        bytes[] memory before_ = _update(64_000e8, exitAt - 5, exitAt - 6);
        vm.expectRevert(bytes("MockPyth: window"));
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, before_);

        // tick beyond the exit window — too far after the declared instant
        bytes[] memory late = _update(64_000e8, exitAt + 121, exitAt - 1);
        vm.expectRevert(bytes("MockPyth: window"));
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, late);

        // NOT the first tick at/after exitAt (an earlier in-window tick exists)
        bytes[] memory notFirst = _update(64_000e8, exitAt + 60, exitAt + 30);
        vm.expectRevert(bytes("MockPyth: window"));
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, notFirst);
    }

    function test_resolve_attested_v1CoherenceVerbatim() public {
        bytes32 h = keccak256("a2");
        bytes[] memory empty = new bytes[](0);
        rec.commitTrade(
            h, "OKB", BobbyTrackRecordV2.Agent.ALPHA, 5, 50e8, 60e8, 0,
            BobbyTrackRecordV2.PriceMode.ATTESTED, empty
        );
        vm.warp(T0 + 2 hours);
        // exit 55 > entry 50 (long) implies WIN; claiming LOSS hits v1 string
        vm.expectRevert(bytes("Prices imply WIN"));
        rec.resolveTrade(h, -100, BobbyTrackRecordV2.Result.LOSS, 55e8, 0, empty);

        rec.resolveTrade(h, 1000, BobbyTrackRecordV2.Result.WIN, 55e8, 0, empty);
        assertEq(rec.winsAttested(), 1);
        assertEq(rec.winsVerified(), 0); // D-1
        assertTrue(rec.isFinal(h)); // attested: no challenge window
    }

    function test_resolve_h01Guard_verbatim() public {
        bytes32 h = keccak256("h01");
        _commitVerified(h);
        vm.warp(T0 + 2 hours);
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert(bytes("Use expireCommitment()"));
        rec.resolveTrade(h, 0, BobbyTrackRecordV2.Result.EXPIRED, 1e8, uint64(vm.getBlockTimestamp()) - 10, empty);
    }

    function test_resolve_sanityDiscrepancyEmits() public {
        rec.setSanityFeed("BTC", address(agg));
        bytes32 h = keccak256("sc1");
        _commitVerified(h);
        vm.warp(T0 + 2 hours);
        // Chainlink fresh but 5% away from the Pyth exit price
        agg.set(int256(uint256(61_000e8)), vm.getBlockTimestamp());
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        bytes[] memory d = _update(64_000e8, exitAt + 1, exitAt - 1);
        vm.expectEmit(true, false, false, false);
        emit OracleDiscrepancy(h, 0, 0);
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, d);
    }

    // ============ Expire ============

    function test_expire_countsCoveragePerMode() public {
        bytes32 h = keccak256("e1");
        _commitVerified(h);
        vm.warp(T0 + 31 days);
        rec.expireCommitment(h);
        (uint256 resolved_, uint256 expired_, uint256 pending_) =
            rec.getCoverage(BobbyTrackRecordV2.PriceMode.VERIFIED);
        assertEq(resolved_, 0);
        assertEq(expired_, 1);
        assertEq(pending_, 0);
        assertTrue(rec.isFinal(h)); // expiry carries no challenge window
    }

    // ============ Challenge ============

    function test_challenge_pendingResolvesAsStopLoss() public {
        bytes32 h = keccak256("c1");
        _commitVerified(h);
        vm.warp(T0 + 3 hours);
        // breach tick: price through the stop, after entry evidence
        uint64 anchor = T0 + 1 hours;
        bytes[] memory d = _update(61_900e8, anchor + 3, anchor - 10);
        rec.challengeStopBreach{value: 10}(h, anchor, d);

        assertEq(rec.lossesVerified(), 1);
        BobbyTrackRecordV2.Trade memory t = rec.getTrade(0);
        assertTrue(t.stopChallenged);
        assertEq(uint8(t.result), uint8(BobbyTrackRecordV2.Result.LOSS));
        // loss at stop from committed levels: (62000-63000)/63000 = -158 bps
        assertEq(t.pnlBps, -158);
        assertTrue(rec.isFinal(h));
    }

    function test_challenge_reclassifiesResolvedWin() public {
        bytes32 h = keccak256("c2");
        _commitVerified(h);
        uint64 exitAt = _resolveWin(h);
        assertEq(rec.winsVerified(), 1);

        uint64 anchor = T0 + 1 hours;
        bytes[] memory d = _update(61_900e8, anchor + 3, anchor - 10);
        vm.expectEmit(true, true, false, false);
        emit TradeReclassified(0, h, BobbyTrackRecordV2.Result.WIN, BobbyTrackRecordV2.Result.LOSS, 0, 0, "");
        rec.challengeStopBreach{value: 10}(h, anchor, d);

        assertEq(rec.winsVerified(), 0);
        assertEq(rec.lossesVerified(), 1);
        assertEq(rec.getVerifiedWinRate(), 0);
        // second challenge is idempotent-blocked
        vm.expectRevert(BobbyTrackRecordV2.AlreadyChallenged.selector);
        rec.challengeStopBreach{value: 10}(h, anchor, d);
        exitAt; // silence
    }

    function test_challenge_closedAfterFinalityWindow() public {
        bytes32 h = keccak256("c3");
        _commitVerified(h);
        _resolveWin(h);
        vm.warp(T0 + 2 hours + 7 days + 1);
        uint64 anchor = T0 + 1 hours;
        bytes[] memory d = _update(61_900e8, anchor + 3, anchor - 10);
        vm.expectRevert(BobbyTrackRecordV2.ChallengeWindowClosed.selector);
        rec.challengeStopBreach{value: 10}(h, anchor, d);
    }

    function test_challenge_noBreachIfStopNotCrossed() public {
        bytes32 h = keccak256("c4");
        _commitVerified(h);
        vm.warp(T0 + 3 hours);
        uint64 anchor = T0 + 1 hours;
        bytes[] memory d = _update(62_500e8, anchor + 3, anchor - 10); // above stop
        vm.expectRevert(BobbyTrackRecordV2.NoBreach.selector);
        rec.challengeStopBreach{value: 10}(h, anchor, d);
    }

    function test_challenge_anchorMustPostdateEntryEvidence() public {
        bytes32 h = keccak256("c5");
        _commitVerified(h);
        vm.warp(T0 + 3 hours);
        bytes[] memory d = _update(61_900e8, T0 - 6, T0 - 100);
        vm.expectRevert(BobbyTrackRecordV2.ChallengeAnchorOutOfRange.selector);
        rec.challengeStopBreach{value: 10}(h, T0 - 6, d); // anchor <= entry publishTime (T0-5)
    }

    function test_challenge_attestedNotChallengeable() public {
        bytes32 h = keccak256("c6");
        bytes[] memory empty = new bytes[](0);
        rec.commitTrade(
            h, "OKB", BobbyTrackRecordV2.Agent.ALPHA, 5, 50e8, 60e8, 40e8,
            BobbyTrackRecordV2.PriceMode.ATTESTED, empty
        );
        bytes[] memory d = _update(39e8, T0 + 100, T0 + 90);
        vm.expectRevert(BobbyTrackRecordV2.ChallengeNotVerified.selector);
        rec.challengeStopBreach{value: 10}(h, T0 + 100, d);
    }

    // ============ Audit-round regression (V-02..V-07 + gaps) ============

    function test_resolve_verified_loss_ledgerAccounting() public {
        // Gap: no verified LOSS was ever resolved on the normal path.
        bytes32 h = keccak256("L1");
        _commitVerified(h);
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        // oracle exit 62,500 < entry 63,000 (long) → LOSS, -79 bps
        bytes[] memory d = _update(62_500e8, exitAt + 1, exitAt - 1);
        rec.resolveTrade{value: 10}(h, -79, BobbyTrackRecordV2.Result.LOSS, 62_500e8, exitAt, d);

        assertEq(rec.lossesVerified(), 1);
        assertEq(rec.winsVerified(), 0);
        (uint256 w, uint256 l, uint256 tot,) = rec.getAgentStats(BobbyTrackRecordV2.Agent.CIO, BobbyTrackRecordV2.PriceMode.VERIFIED);
        assertEq(w, 0); assertEq(l, 1); assertEq(tot, 1);
    }

    function test_V05_storedPnlIsOracleDerived_notReported() public {
        // Reported +120 (within tol of oracle +158) must NOT be what's stored;
        // the oracle-derived +158 is.
        bytes32 h = keccak256("v05");
        _commitVerified(h);
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        bytes[] memory d = _update(64_000e8, exitAt + 1, exitAt - 1);
        rec.resolveTrade{value: 10}(h, 120, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, d);
        BobbyTrackRecordV2.Trade memory t = rec.getTrade(0);
        assertEq(t.pnlBps, 158); // oracle-derived, not the reported 120
        assertEq(rec.totalPnlBpsVerified(), 158);
    }

    function test_V06_tightStopBreachFloorsAtOneBp() public {
        // Stop 1e8 unit below entry → naive bps truncates to 0; floor forces -1.
        bytes[] memory d = _update(int64(uint64(ENTRY)), T0 - 5, T0 - 70);
        bytes32 h = keccak256("v06");
        rec.commitTrade{value: 10}(
            h, "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, ENTRY + 1000e8, ENTRY - 1,
            BobbyTrackRecordV2.PriceMode.VERIFIED, d
        );
        vm.warp(T0 + 3 hours);
        uint64 anchor = T0 + 1 hours;
        bytes[] memory b = _update(int64(uint64(ENTRY - 1)), anchor + 3, anchor - 10);
        rec.challengeStopBreach{value: 10}(h, anchor, b);
        BobbyTrackRecordV2.Trade memory t = rec.getTrade(0);
        assertEq(uint8(t.result), uint8(BobbyTrackRecordV2.Result.LOSS));
        assertEq(t.pnlBps, -1); // floored, never a zero-PnL LOSS
    }

    function test_breakEvenReclassifiedToLoss() public {
        // Gap: only WIN→LOSS was covered. BREAK_EVEN sat in neither ledger.
        bytes32 h = keccak256("be1");
        _commitVerified(h);
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        // oracle exit == entry → BREAK_EVEN
        bytes[] memory d = _update(int64(uint64(ENTRY)), exitAt + 1, exitAt - 1);
        rec.resolveTrade{value: 10}(h, 0, BobbyTrackRecordV2.Result.BREAK_EVEN, ENTRY, exitAt, d);
        assertEq(rec.winsVerified(), 0);
        assertEq(rec.lossesVerified(), 0);

        uint64 anchor = T0 + 1 hours;
        bytes[] memory b = _update(61_900e8, anchor + 3, anchor - 10);
        rec.challengeStopBreach{value: 10}(h, anchor, b);
        assertEq(rec.winsVerified(), 0); // unchanged (BE wasn't a win)
        assertEq(rec.lossesVerified(), 1); // now a loss
        (, , uint256 tot,) = rec.getAgentStats(BobbyTrackRecordV2.Agent.CIO, BobbyTrackRecordV2.PriceMode.VERIFIED);
        assertEq(tot, 1); // resolvedVerified counted once, not double
    }

    function test_V03_challengeAlsoBlockedWhenPythRevoked() public {
        // The revoke-as-pause ALSO silences the permissionless challenge — the
        // documented residual (V-03). This test PINS that behavior so a future
        // change that alters it is caught. See docs decision D-V03.
        bytes32 h = keccak256("v03");
        _commitVerified(h);
        rec.revokePyth(address(pyth));
        vm.warp(T0 + 3 hours);
        uint64 anchor = T0 + 1 hours;
        bytes[] memory b = _update(61_900e8, anchor + 3, anchor - 10);
        vm.expectRevert(BobbyTrackRecordV2.NoPythActive.selector);
        rec.challengeStopBreach{value: 10}(h, anchor, b);
    }

    function test_V04_expireIsNonReentrant() public {
        // expireCommitment now holds the shared lock; a well-formed expire
        // still works (the guard only blocks reentrancy, not normal calls).
        bytes32 h = keccak256("v04");
        _commitVerified(h);
        vm.warp(T0 + 31 days);
        rec.expireCommitment(h);
        (, uint256 expired_,) = rec.getCoverage(BobbyTrackRecordV2.PriceMode.VERIFIED);
        assertEq(expired_, 1);
    }

    function test_refundRetainedOnFailedRefund_andWithdraw() public {
        // A recorder contract that rejects ETH makes the refund fail → retained.
        RejectingRecorder rr = new RejectingRecorder(rec);
        rec.setBobby(address(rr));
        bytes[] memory d = _update(int64(uint64(ENTRY)), T0 - 5, T0 - 70);
        rr.commit{value: 1 ether}(keccak256("rf1"), d, ENTRY, TARGET, STOP);
        assertEq(rec.retainedFees(), 1 ether - 10);
        assertEq(address(rec).balance, 1 ether - 10);
        // owner sweeps
        rec.withdrawStuckFees(payable(address(this)));
        assertEq(address(rec).balance, 0);
        assertEq(rec.retainedFees(), 0);
    }

    // ============ Audit-round-2 (Kimi/Codex) regression ============

    function test_r2_challengeRejectsTickBeforeCommittedAt() public {
        bytes32 h = keccak256("r2a");
        _commitVerified(h); // committedAt = T0, entryEvidence.publishTime = T0-5
        vm.warp(T0 + 3 hours);
        // anchor between entry evidence (T0-5) and committedAt (T0): must reject.
        bytes[] memory d = _update(61_900e8, T0 - 2, T0 - 20);
        vm.expectRevert(BobbyTrackRecordV2.ChallengeAnchorOutOfRange.selector);
        rec.challengeStopBreach{value: 10}(h, T0 - 2, d);
    }

    function test_r2_reclassifyCarriesBreachEvidence() public {
        bytes32 h = keccak256("r2b");
        _commitVerified(h);
        _resolveWin(h); // WIN, exitEvidence = 64,000 tick
        BobbyTrackRecordV2.Trade memory won = rec.getTrade(0);
        assertEq(won.exitPrice, 64_000e8);

        uint64 anchor = T0 + 1 hours;
        bytes[] memory d = _update(61_900e8, anchor + 3, anchor - 10);
        rec.challengeStopBreach{value: 10}(h, anchor, d);

        BobbyTrackRecordV2.Trade memory lost = rec.getTrade(0);
        // exit evidence/price now reflect the STOP-breach, not the stale WIN.
        assertEq(lost.exitPrice, STOP);
        assertEq(lost.exitEvidence.price, int64(uint64(61_900e8)));
        assertEq(lost.exitAt, anchor + 3);
    }

    function test_r2_verifiedScorecardBundlesCoverage() public {
        // 1 win resolved, 1 sub-stop loser left pending (V-02: not auto-LOSS).
        bytes32 hw = keccak256("sw");
        _commitVerified(hw);
        _resolveWin(hw);
        bytes32 hp = keccak256("sp");
        vm.warp(T0);
        // fresh pending commit at T0 again would clash on time; commit another
        // verified trade in the same block window
        bytes[] memory d = _update(int64(uint64(ENTRY)), uint64(vm.getBlockTimestamp()) - 5, uint64(vm.getBlockTimestamp()) - 70);
        rec.commitTrade{value: 10}(hp, "BTC", BobbyTrackRecordV2.Agent.CIO, 7, ENTRY, TARGET, STOP, BobbyTrackRecordV2.PriceMode.VERIFIED, d);

        (uint256 winRate, uint256 decided, uint256 resolved_, uint256 expired_, uint256 pending_, uint256 resolutionBps)
            = rec.getVerifiedScorecard();
        assertEq(winRate, 10000);      // 1/1 decided
        assertEq(decided, 1);
        assertEq(resolved_, 1);
        assertEq(expired_, 0);
        assertEq(pending_, 1);
        // resolution = 1 resolved / (1 resolved + 0 expired + 1 pending) = 5000 bps
        assertEq(resolutionBps, 5000);
    }

    function test_r2_minCommitAgeCapped() public {
        vm.expectRevert(BobbyTrackRecordV2.ParamsOutOfBounds.selector);
        rec.setMinCommitAge(30 days); // >= MAX_COMMITMENT_TTL
    }

    function test_r2_challengeWindowMustExceedTimelock() public {
        // 2 days == PYTH_ACTIVATION_DELAY → rejected; 2 days + 1 accepted.
        BobbyTrackRecordV2.VerificationParams memory bad =
            BobbyTrackRecordV2.VerificationParams(60, 120, 600, 2 days, 100, 100, 50);
        vm.expectRevert(BobbyTrackRecordV2.ParamsOutOfBounds.selector);
        rec.setParams(bad);
        BobbyTrackRecordV2.VerificationParams memory ok =
            BobbyTrackRecordV2.VerificationParams(60, 120, 600, 2 days + 1, 100, 100, 50);
        rec.setParams(ok);
    }

    function test_r2_maxExitLagCappedAtOneHour() public {
        BobbyTrackRecordV2.VerificationParams memory bad =
            BobbyTrackRecordV2.VerificationParams(60, 120, 3601, 7 days, 100, 100, 50);
        vm.expectRevert(BobbyTrackRecordV2.ParamsOutOfBounds.selector);
        rec.setParams(bad);
    }

    function test_r2_preApprovedAlternatePyth_instantActivate() public {
        // Deploy a fresh recorder with TWO deploy-vetted oracles.
        MockPyth alt = new MockPyth();
        BobbyTrackRecordV2.VerificationParams memory p = BobbyTrackRecordV2.VerificationParams({
            entryWindowSec: 60, exitWindowSec: 120, maxExitLagSec: 600,
            challengeWindowSec: 7 days, entryTolBps: 100, exitTolBps: 100, confMaxBps: 50
        });
        string[] memory syms = new string[](1); syms[0] = "BTC";
        bytes32[] memory feeds = new bytes32[](1); feeds[0] = BTC_FEED;
        address[] memory pyths = new address[](2);
        pyths[0] = address(pyth); pyths[1] = address(alt);
        BobbyTrackRecordV2 rec2 = new BobbyTrackRecordV2(address(this), p, pyths, syms, feeds);

        assertEq(rec2.activePyth(), address(pyth));
        assertTrue(rec2.approvedPyth(address(alt)));
        // V-03: revoke the active one, then instantly activate the pre-approved
        // alternate — NO 2-day timelock, because it was vetted at deploy.
        rec2.revokePyth(address(pyth));
        assertEq(rec2.activePyth(), address(0));
        rec2.activatePyth(address(alt)); // no vm.warp needed
        assertEq(rec2.activePyth(), address(alt));
    }

    // ============ Admin ============

    function test_pyth_timelockFlow() public {
        MockPyth pyth2 = new MockPyth();
        rec.approvePyth(address(pyth2));
        vm.expectRevert(BobbyTrackRecordV2.TimelockNotElapsed.selector);
        rec.activatePyth(address(pyth2));
        vm.warp(vm.getBlockTimestamp() + 2 days);
        rec.activatePyth(address(pyth2));
        assertEq(rec.activePyth(), address(pyth2));
    }

    function test_pyth_revokeActiveBlocksVerifiedResolves() public {
        bytes32 h = keccak256("p1");
        _commitVerified(h);
        rec.revokePyth(address(pyth));
        assertEq(rec.activePyth(), address(0));
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        bytes[] memory d = _update(64_000e8, exitAt + 1, exitAt - 1);
        vm.expectRevert(BobbyTrackRecordV2.NoPythActive.selector);
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, d);
        // attested settlement unaffected (r5: settlement never pausable)
        bytes[] memory empty = new bytes[](0);
        rec.commitTrade(
            keccak256("p2"), "OKB", BobbyTrackRecordV2.Agent.ALPHA, 5, 50e8, 60e8, 0,
            BobbyTrackRecordV2.PriceMode.ATTESTED, empty
        );
        vm.warp(vm.getBlockTimestamp() + 2 hours);
        rec.resolveTrade(keccak256("p2"), 1000, BobbyTrackRecordV2.Result.WIN, 55e8, 0, empty);
    }

    function test_params_boundsEnforced() public {
        BobbyTrackRecordV2.VerificationParams memory p = BobbyTrackRecordV2.VerificationParams(
            5, 120, 3600, 7 days, 100, 100, 50 // entryWindow below floor
        );
        vm.expectRevert(BobbyTrackRecordV2.ParamsOutOfBounds.selector);
        rec.setParams(p);
        // A-08: minCommitAge must stay strictly above the exit window
        p = BobbyTrackRecordV2.VerificationParams(60, 1800, 3600, 7 days, 100, 100, 50);
        rec.setParams(p); // valid: minCommitAge (1h) > 1800s
        vm.expectRevert(BobbyTrackRecordV2.ParamsOutOfBounds.selector);
        rec.setMinCommitAge(1800); // == exit window → rejected
    }

    function test_sanityFeed_decimalsGuard() public {
        agg.setDecimals(18);
        vm.expectRevert(BobbyTrackRecordV2.SanityFeedBadDecimals.selector);
        rec.setSanityFeed("BTC", address(agg));
    }

    function test_pause_gatesCommitNotResolve() public {
        bytes32 h = keccak256("z1");
        _commitVerified(h);
        rec.pause();
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert(bytes("Contract is paused"));
        rec.commitTrade(
            keccak256("z2"), "OKB", BobbyTrackRecordV2.Agent.CIO, 5, 50e8, 60e8, 0,
            BobbyTrackRecordV2.PriceMode.ATTESTED, empty
        );
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        bytes[] memory d = _update(64_000e8, exitAt + 1, exitAt - 1);
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, d); // works while paused
    }
}
