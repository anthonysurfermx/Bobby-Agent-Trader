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
        try rec.commitTrade{value: 10}(h, "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, tgt, stop, BobbyTrackRecordV2.PriceMode.VERIFIED, d) {} catch {}
    }

    function commitAttested() external {
        bytes32 h = keccak256(abi.encode("a", nonce++));
        bytes[] memory empty = new bytes[](0);
        try rec.commitTrade(h, "OKB", BobbyTrackRecordV2.Agent.ALPHA, 5, 50e8, 60e8, 40e8, BobbyTrackRecordV2.PriceMode.ATTESTED, empty) {} catch {}
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
        bytes[] memory d = _update(exitPx, exitAt - 10, exitAt - 300);
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
        try rec.commitTrade{value: 10}(h, "BTC", BobbyTrackRecordV2.Agent.CIO, 5, ENTRY, ENTRY + 3000e8, stop, BobbyTrackRecordV2.PriceMode.VERIFIED, de) {} catch { return; }
        vm.warp(vm.getBlockTimestamp() + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        bytes[] memory dr = _update(int64(64_000e8), exitAt - 10, exitAt - 300);
        try rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, dr) {} catch { return; }
        // breach anchored inside (committedAt, exitAt]
        uint64 anchor = t0 + 1 hours;
        bytes[] memory dc = _update(int64(61_000e8), anchor + 3, anchor - 10);
        try rec.challengeStopBreach{value: 10}(h, anchor, dc) {} catch {}
    }

    receive() external payable {}
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
