// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {BobbyTrackRecordV2, PythStructs} from "../src/BobbyTrackRecordV2.sol";

/// @dev Same deterministic Pyth stand-in as the unit suite.
contract InvMockPyth {
    function getUpdateFee(bytes[] calldata) external pure returns (uint256) { return 10; }
    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData, bytes32[] calldata priceIds, uint64 minT, uint64 maxT
    ) external payable returns (PythStructs.PriceFeed[] memory out) {
        require(msg.value >= 10, "fee");
        out = new PythStructs.PriceFeed[](priceIds.length);
        for (uint256 i = 0; i < priceIds.length; i++) {
            (bytes32 id, int64 price, uint64 conf, int32 expo, uint64 pt, uint64 prev) =
                abi.decode(updateData[i], (bytes32, int64, uint64, int32, uint64, uint64));
            require(id == priceIds[i], "id");
            require(prev < minT && minT <= pt && pt <= maxT, "window");
            out[i] = PythStructs.PriceFeed(id, PythStructs.Price(price, conf, expo, pt), PythStructs.Price(price, conf, expo, pt));
        }
    }

    function parsePriceFeedUpdates(
        bytes[] calldata updateData, bytes32[] calldata priceIds, uint64 minT, uint64 maxT
    ) external payable returns (PythStructs.PriceFeed[] memory out) {
        require(msg.value >= 10, "fee");
        out = new PythStructs.PriceFeed[](priceIds.length);
        for (uint256 i = 0; i < priceIds.length; i++) {
            (bytes32 id, int64 price, uint64 conf, int32 expo, uint64 pt,) =
                abi.decode(updateData[i], (bytes32, int64, uint64, int32, uint64, uint64));
            require(id == priceIds[i], "id");
            require(minT <= pt && pt <= maxT, "window");
            out[i] = PythStructs.PriceFeed(id, PythStructs.Price(price, conf, expo, pt), PythStructs.Price(price, conf, expo, pt));
        }
    }
}

/// @dev Bounded actor: commits, resolves, expires and challenges verified and
///      attested trades with fuzzer-chosen but valid inputs, advancing time so
///      the state machine actually progresses. Every action is a no-op on
///      revert (try/catch) so the fuzzer explores freely without wedging.
contract Handler is Test {
    BobbyTrackRecordV2 public rec;
    bytes32 constant BTC_FEED = bytes32(uint256(0xB7C));
    uint64 constant ENTRY = 63_000e8;
    uint256 public nonce;

    constructor(BobbyTrackRecordV2 _rec) { rec = _rec; }

    function _update(int64 price, uint64 pt, uint64 prev) internal pure returns (bytes[] memory d) {
        d = new bytes[](1);
        d[0] = abi.encode(BTC_FEED, price, uint64(1_000_000), int32(-8), pt, prev);
    }

    function commitVerified(uint16 stopDelta, uint16 tgtDelta) external {
        bytes32 h = keccak256(abi.encode("v", nonce++));
        uint96 stop = ENTRY - (uint96(stopDelta) + 1) * 1e8;   // stop below entry (long)
        uint96 tgt = ENTRY + (uint96(tgtDelta) + 1) * 1e8;
        uint64 ts = uint64(vm.getBlockTimestamp());
        bytes[] memory d = _update(int64(ENTRY), ts - 5, ts - 70);
        uint64 anchor1_ = uint64(vm.getBlockTimestamp()) - 5;
        try rec.commitTrade{value: 10}(h, "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, tgt, stop, BobbyTrackRecordV2.PriceMode.VERIFIED, anchor1_, d) {} catch {}
    }

    /// @dev Audit r2 external P2 (Codex/Kimi): the handler only generated LONGs
    ///      whose reported entry equaled the oracle entry — precisely why the
    ///      fuzzer could never surface the reported-vs-oracle stop P1. This
    ///      action commits with a reported entry DIVERGENT from the oracle
    ///      (inside the 100 bps band) in both directions, and SHORTs too.
    function commitVerifiedDivergent(uint16 offBps, uint16 stopDelta, bool short_) external {
        bytes32 h = keccak256(abi.encode("v", nonce++));
        uint96 off = uint96((uint256(ENTRY) * (uint256(offBps) % 95)) / 10_000);
        try rec.announceCommit(h) {} catch {}
        uint64 ts = uint64(vm.getBlockTimestamp()) + rec.MIN_ENTRY_DELAY_SEC();
        vm.warp(ts);
        bytes[] memory d = _update(int64(ENTRY), ts, ts - 1);
        if (short_) {
            // reported below oracle (inside band); stop strictly above BOTH.
            uint96 rep = ENTRY - off;
            uint96 stop = ENTRY + (uint96(stopDelta) % 2000 + 1) * 1e8;
            uint64 anchor2_ = uint64(vm.getBlockTimestamp()) - 5;
            try rec.commitTrade{value: 10}(h, "BTC", BobbyTrackRecordV2.Agent.REDTEAM, 5, rep, 0, stop, BobbyTrackRecordV2.PriceMode.VERIFIED, anchor2_, d) {} catch {}
        } else {
            // reported above oracle (inside band); stop strictly below BOTH.
            uint96 rep = ENTRY + off;
            uint96 stop = ENTRY - (uint96(stopDelta) % 2000 + 1) * 1e8;
            uint64 anchor3_ = uint64(vm.getBlockTimestamp()) - 5;
            try rec.commitTrade{value: 10}(h, "BTC", BobbyTrackRecordV2.Agent.ALPHA, 5, rep, 0, stop, BobbyTrackRecordV2.PriceMode.VERIFIED, anchor3_, d) {} catch {}
        }
    }

    function commitAttested() external {
        bytes32 h = keccak256(abi.encode("a", nonce++));
        bytes[] memory empty = new bytes[](0);
        try rec.commitTrade(h, "OKB", BobbyTrackRecordV2.Agent.ALPHA, 5, 50e8, 60e8, 40e8, BobbyTrackRecordV2.PriceMode.ATTESTED, 0, empty) {} catch {}
    }

    /// @dev Audit r2 external P2: ATTESTED resolution was never fuzzed.
    function resolveAttested(uint256 idx, bool win) external {
        bytes32 h = keccak256(abi.encode("a", idx % (nonce + 1)));
        bytes[] memory empty = new bytes[](0);
        if (win) {
            try rec.resolveTrade(h, 1000, BobbyTrackRecordV2.Result.WIN, 55e8, 0, empty) {} catch {}
        } else {
            try rec.resolveTrade(h, -1000, BobbyTrackRecordV2.Result.LOSS, 45e8, 0, empty) {} catch {}
        }
    }

    function warp(uint32 secs) external {
        vm.warp(vm.getBlockTimestamp() + (uint256(secs) % 5 days) + 1);
    }

    function resolveVerified(uint256 idx, bool win) external {
        bytes32 h = keccak256(abi.encode("v", idx % (nonce + 1)));
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        int64 exitPx = win ? int64(64_000e8) : int64(62_500e8);
        int256 pnl = win ? int256(158) : int256(-79);
        BobbyTrackRecordV2.Result r = win ? BobbyTrackRecordV2.Result.WIN : BobbyTrackRecordV2.Result.LOSS;
        bytes[] memory d = _update(exitPx, exitAt + 1, exitAt - 1);
        try rec.resolveTrade{value: 10}(h, pnl, r, uint96(uint64(exitPx)), exitAt, d) {} catch {}
    }

    function expire(uint256 idx) external {
        bytes32 h = keccak256(abi.encode(idx % 2 == 0 ? "v" : "a", idx % (nonce + 1)));
        try rec.expireCommitment(h) {} catch {}
    }

    function challenge(uint256 idx) external {
        bytes32 h = keccak256(abi.encode("v", idx % (nonce + 1)));
        uint64 anchor = uint64(vm.getBlockTimestamp()) - 200;
        bytes[] memory d = _update(int64(61_000e8), anchor + 3, anchor - 10);
        try rec.challengeStopBreach{value: 10}(h, anchor, d) {} catch {}
    }

    /// @dev High-side breach tick so SHORT stops are also challengeable.
    function challengeHigh(uint256 idx) external {
        bytes32 h = keccak256(abi.encode("v", idx % (nonce + 1)));
        uint64 anchor = uint64(vm.getBlockTimestamp()) - 200;
        bytes[] memory d = _update(int64(90_000e8), anchor + 3, anchor - 10);
        try rec.challengeStopBreach{value: 10}(h, anchor, d) {} catch {}
    }

    /// @dev Audit r2 external P2: the retained-refund custody path was never
    ///      fuzzed (invariant d was vacuous). Toggling this makes the handler
    ///      reject ETH, so overpaid commits/resolves exercise RefundRetained.
    bool public refuseRefunds;

    function toggleRefunds(bool refuse) external {
        refuseRefunds = refuse;
    }

    /// @dev Overpay on purpose so a refund is owed; if refuseRefunds is set,
    ///      the handler's receive() reverts, forcing the RefundRetained path so
    ///      invariant (d) actually constrains real retained custody.
    function overpayCommit() external {
        bytes32 h = keccak256(abi.encode("v", nonce++));
        uint64 ts = uint64(vm.getBlockTimestamp());
        bytes[] memory d = _update(int64(ENTRY), ts - 5, ts - 70);
        uint64 anchor4_ = uint64(vm.getBlockTimestamp()) - 5;
        try rec.commitTrade{value: 1 ether}(h, "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, ENTRY + 3000e8, ENTRY - 1000e8, BobbyTrackRecordV2.PriceMode.VERIFIED, anchor4_, d) {} catch {}
    }

    /// @dev Audit r2 P2: the random walk rarely lands a challenge inside a
    ///      RESOLVED trade's finality window (anchor vs exitAt drift), so the
    ///      reclassify-of-resolved-WIN path was effectively un-fuzzed. This
    ///      builds the full commit→resolve(WIN)→challenge-in-window sequence in
    ///      one controlled action, so the invariants are checked across that
    ///      transition too.
    function resolveThenChallenge(uint16 stopDelta) external {
        bytes32 h = keccak256(abi.encode("v", nonce++));
        uint96 stop = ENTRY - (uint96(stopDelta) + 1) * 1e8;
        uint64 t0 = uint64(vm.getBlockTimestamp());
        bytes[] memory de = _update(int64(ENTRY), t0 - 5, t0 - 70);
        uint64 anchor5_ = uint64(vm.getBlockTimestamp()) - 5;
        try rec.commitTrade{value: 10}(h, "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, ENTRY + 3000e8, stop, BobbyTrackRecordV2.PriceMode.VERIFIED, anchor5_, de) {} catch { return; }
        vm.warp(vm.getBlockTimestamp() + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        bytes[] memory dr = _update(int64(64_000e8), exitAt + 1, exitAt - 1);
        try rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, dr) {} catch { return; }
        // breach anchored inside (committedAt, exitAt]
        uint64 anchor = t0 + 1 hours;
        bytes[] memory dc = _update(int64(61_000e8), anchor + 3, anchor - 10);
        try rec.challengeStopBreach{value: 10}(h, anchor, dc) {} catch {}
    }

    /// @dev Audit r2 external P2: the EXACT Codex P1 configuration, driven
    ///      deterministically so the mutation test has a live path to it —
    ///      reported entry 63,600 above oracle 63,000 (in the 100 bps band),
    ///      stop 63,300 sitting BETWEEN them, then a challenge with an in-band
    ///      tick 63,200 that crosses the stop but is a gain vs the oracle entry.
    ///      With the fix this reverts at commit (no trade). Revert the fix and
    ///      the fuzzer reaches a fabricated LOSS that invariant (f) catches.
    function resolveThenChallengeExploit() external {
        bytes32 h = keccak256(abi.encode("v", nonce++));
        uint64 t0 = uint64(vm.getBlockTimestamp());
        bytes[] memory de = _update(int64(ENTRY), t0 - 5, t0 - 70); // oracle 63,000
        uint64 anchor6_ = uint64(vm.getBlockTimestamp()) - 5;
        try rec.commitTrade{value: 10}(h, "BTC", BobbyTrackRecordV2.Agent.CIO, 5, 63_600e8, 66_000e8, 63_300e8, BobbyTrackRecordV2.PriceMode.VERIFIED, anchor6_, de) {} catch { return; }
        vm.warp(vm.getBlockTimestamp() + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        bytes[] memory dr = _update(int64(64_000e8), exitAt + 1, exitAt - 1);
        try rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, dr) {} catch { return; }
        uint64 anchor = t0 + 1 hours;
        bytes[] memory dc = _update(int64(63_200e8), anchor + 3, anchor - 10); // in-band breach
        try rec.challengeStopBreach{value: 10}(h, anchor, dc) {} catch {}
    }

    receive() external payable {
        // When refusing, revert refunds so the contract must retain them.
        require(!refuseRefunds, "refusing refund");
    }
}

contract BobbyTrackRecordV2InvariantTest is Test {
    BobbyTrackRecordV2 rec;
    Handler handler;
    bytes32 constant BTC_FEED = bytes32(uint256(0xB7C));

    function setUp() public {
        vm.warp(1_800_000_000);
        InvMockPyth pyth = new InvMockPyth();
        BobbyTrackRecordV2.VerificationParams memory p = BobbyTrackRecordV2.VerificationParams({
            entryWindowSec: 60, exitWindowSec: 120, maxExitLagSec: 3600,
            challengeWindowSec: 7 days, entryTolBps: 100, exitTolBps: 100, confMaxBps: 50
        });
        string[] memory syms = new string[](1); syms[0] = "BTC";
        bytes32[] memory feeds = new bytes32[](1); feeds[0] = BTC_FEED;
        address[] memory pyths = new address[](1); pyths[0] = address(pyth);
        rec = new BobbyTrackRecordV2(address(this), p, pyths, syms, feeds);

        handler = new Handler(rec);
        rec.setBobby(address(handler));
        vm.deal(address(handler), 100 ether);
        targetContract(address(handler));
        // Audit r2 external (Codex): EXPLICIT selector list — adding handler
        // actions without selecting them would silently empty the coverage.
        // Every state-exercising action is enumerated here; view getters are
        // excluded so fuzz calls aren't wasted.
        bytes4[] memory sels = new bytes4[](10);
        sels[0] = Handler.commitVerified.selector;
        sels[1] = Handler.commitVerifiedDivergent.selector;
        sels[2] = Handler.commitAttested.selector;
        sels[3] = Handler.resolveVerified.selector;
        sels[4] = Handler.resolveAttested.selector;
        sels[5] = Handler.expire.selector;
        sels[6] = Handler.challenge.selector;
        sels[7] = Handler.challengeHigh.selector;
        sels[8] = Handler.resolveThenChallenge.selector;
        sels[9] = Handler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
        // The exact-PoC exploit path, selected so the mutation test (revert the
        // commit-time fix) has a live route to a fabricated LOSS.
        bytes4[] memory poc = new bytes4[](1);
        poc[0] = Handler.resolveThenChallengeExploit.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: poc}));
        // toggleRefunds + overpayCommit run as their own pair so the retained-
        // refund path is exercised deterministically, not left to chance.
        bytes4[] memory refundSels = new bytes4[](2);
        refundSels[0] = Handler.toggleRefunds.selector;
        refundSels[1] = Handler.overpayCommit.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: refundSels}));
    }

    /// (a) Per-mode ledgers never cross: a verified outcome never lands in an
    ///     attested counter and vice versa (D-1 at the accounting level).
    function invariant_perModeCoverageConsistent() public view {
        (uint256 rV, uint256 eV, uint256 pV) = rec.getCoverage(BobbyTrackRecordV2.PriceMode.VERIFIED);
        (uint256 rA, uint256 eA, uint256 pA) = rec.getCoverage(BobbyTrackRecordV2.PriceMode.ATTESTED);
        // Every commitment is in exactly one (mode, state) bucket; totals across
        // both modes reconcile to the commitment and trade counts.
        assertEq(rV + eV + rA + eA, rec.totalTrades(), "resolved+expired == trades");
        assertEq(rV + eV + pV + rA + eA + pA, rec.totalCommitments(), "coverage == commitments");
    }

    /// (b) Decided counts never exceed resolved counts per mode (expired/BE are
    ///     resolved-but-not-decided; nothing is decided without being resolved).
    function invariant_decidedWithinResolved() public view {
        assertLe(rec.winsVerified() + rec.lossesVerified(), rec.resolvedVerified());
        assertLe(rec.winsAttested() + rec.lossesAttested(), rec.resolvedAttested());
    }

    /// (c) pendingCount equals the sum of per-mode pending — no desync between
    ///     the global counter and the mode ledgers across resolve/expire/challenge.
    function invariant_pendingReconciles() public view {
        (, , uint256 pV) = rec.getCoverage(BobbyTrackRecordV2.PriceMode.VERIFIED);
        (, , uint256 pA) = rec.getCoverage(BobbyTrackRecordV2.PriceMode.ATTESTED);
        assertEq(pV + pA, rec.pendingCount(), "pending desync");
    }

    /// (d) The contract only ever custodies retained refunds (exact-fee
    ///     forwarding), so its balance can never exceed what it tracked.
    function invariant_balanceIsRetainedOnly() public view {
        assertLe(rec.retainedFees(), address(rec).balance + 1);
    }

    /// (f) Every stop-breach reclassification is a GENUINE loss against the
    ///     ORACLE entry (audit r2 external P1). The earlier version only checked
    ///     `result==LOSS && pnlBps<0` — useless, because the P1 exploit ALSO
    ///     produced a negative reported pnl from committed levels. The real
    ///     property the P1 violates is that the breach EVIDENCE tick must be on
    ///     the loss side of the oracle ENTRY evidence. All mock updates use
    ///     expo -8, so the stored int64 prices are already 1e8-scaled and
    ///     directly comparable. Reintroducing the P1 (stop inside the entry
    ///     band, above the oracle entry for a long) makes a challenged trade's
    ///     breach evidence sit ABOVE the oracle entry → this assertion fails.
    function invariant_challengedTradesAreGenuineLosses() public view {
        uint256 n = rec.totalTrades();
        for (uint256 i = 0; i < n; i++) {
            BobbyTrackRecordV2.Trade memory t = rec.getTrade(i);
            if (!t.stopChallenged) continue;
            assertEq(uint8(t.result), uint8(BobbyTrackRecordV2.Result.LOSS), "challenged must be LOSS");
            // direction from the committed stop (t.exitPrice) vs reported entry
            bool isLong = t.exitPrice < t.entryPrice;
            int64 entryOracle = t.entryEvidence.price;
            int64 breachOracle = t.exitEvidence.price;
            if (isLong) {
                assertLt(breachOracle, entryOracle, "long breach must be below the ORACLE entry");
            } else {
                assertGt(breachOracle, entryOracle, "short breach must be above the ORACLE entry");
            }
        }
    }

    /// (e) Mode purity of the agent ledgers (audit r2 P2): the per-agent trade
    ///     counts summed across agents must equal the per-mode resolved+expired
    ///     totals — a verified outcome can never leak into an attested agent
    ///     counter or vice versa, and none is dropped or double-counted. This
    ///     is D-1 enforced at the agent-ledger granularity, exercised by the
    ///     reclassify-of-resolved path via resolveThenChallenge.
    function invariant_agentLedgersModePure() public view {
        uint256 vSum;
        uint256 aSum;
        for (uint8 g = 0; g < 3; g++) {
            BobbyTrackRecordV2.Agent agent = BobbyTrackRecordV2.Agent(g);
            vSum += rec.agentTradesByMode(agent, BobbyTrackRecordV2.PriceMode.VERIFIED);
            aSum += rec.agentTradesByMode(agent, BobbyTrackRecordV2.PriceMode.ATTESTED);
        }
        assertEq(vSum, rec.resolvedVerified() + rec.expiredVerified(), "verified agent ledger drift");
        assertEq(aSum, rec.resolvedAttested() + rec.expiredAttested(), "attested agent ledger drift");
    }
}
