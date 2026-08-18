// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// ============================================================
// AUDIT ROUND 1 REGRESSION — A1-1 / A1-2
//
// A1-1 (P1, fixed): with real ~1 Hz feeds (prev == pt-1), Unique's
// `prev < minPublishTime` gate rejected every fresh tick when minT derived
// from block.timestamp. Fix: entry uses the bounded NON-unique parse over
// [now-entryWindow, now]; exit keeps Unique but anchored at the DECLARED
// exitAt ([exitAt, exitAt+exitWindow]) — the canonical benchmark pattern the
// challenge always used. These tests pin the recorder's ACTUAL fetch shapes:
//   entry:  Hermes latest   → pt = now-5,  prev = now-6
//   exit:   Hermes benchmark at exitAt → pt = first tick ≥ exitAt, prev < exitAt
// against a mock enforcing Pyth's real rules at 1-second cadence. If either
// regresses, honest VERIFIED operation breaks in production again.
//
// A1-2 (P2, partial): the TTL boundary race is closed (expiry now strictly
// AFTER TTL, challenge open through TTL). The post-expiry unrecordable-breach
// residual is ACCEPTED and documented — coverage surfaces EXPIRED counts.
// ============================================================

import {Test} from "forge-std/Test.sol";
import {BobbyTrackRecordV2, PythStructs} from "../src/BobbyTrackRecordV2.sol";

/// @dev Faithful Pyth stand-in: Unique enforces prev < minT <= pt <= maxT;
///      the non-unique parse enforces only minT <= pt <= maxT.
contract RealRulePyth {
    uint256 public fee = 10;

    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        return fee;
    }

    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PythStructs.PriceFeed[] memory out) {
        require(msg.value >= fee, "RealRulePyth: fee");
        out = new PythStructs.PriceFeed[](priceIds.length);
        for (uint256 i = 0; i < priceIds.length; i++) {
            (bytes32 id, int64 price, uint64 conf, int32 expo, uint64 pt, uint64 prev) =
                abi.decode(updateData[i], (bytes32, int64, uint64, int32, uint64, uint64));
            require(id == priceIds[i], "RealRulePyth: id");
            require(prev < minPublishTime && minPublishTime <= pt && pt <= maxPublishTime, "RealRulePyth: window");
            out[i] = PythStructs.PriceFeed(id, PythStructs.Price(price, conf, expo, pt), PythStructs.Price(price, conf, expo, pt));
        }
    }

    function parsePriceFeedUpdates(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PythStructs.PriceFeed[] memory out) {
        require(msg.value >= fee, "RealRulePyth: fee");
        out = new PythStructs.PriceFeed[](priceIds.length);
        for (uint256 i = 0; i < priceIds.length; i++) {
            (bytes32 id, int64 price, uint64 conf, int32 expo, uint64 pt,) =
                abi.decode(updateData[i], (bytes32, int64, uint64, int32, uint64, uint64));
            require(id == priceIds[i], "RealRulePyth: id");
            require(minPublishTime <= pt && pt <= maxPublishTime, "RealRulePyth: window");
            out[i] = PythStructs.PriceFeed(id, PythStructs.Price(price, conf, expo, pt), PythStructs.Price(price, conf, expo, pt));
        }
    }
}

contract Audit1HermesCadenceRegression is Test {
    BobbyTrackRecordV2 rec;
    RealRulePyth pyth;

    bytes32 constant BTC_FEED = bytes32(uint256(0xB7C));
    uint64 constant T0 = 1_800_000_000;

    uint96 constant ENTRY = 63_000e8;
    uint96 constant STOP = 62_000e8;
    uint96 constant TARGET = 66_000e8;

    /// ~1 update per second, exactly like the real BTC/ETH/SOL Pyth feeds.
    uint64 constant CADENCE = 1;

    receive() external payable {}

    function setUp() public {
        vm.warp(T0);
        pyth = new RealRulePyth();
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

    /// @dev One Hermes update at realistic cadence: prev = pt - 1s.
    function _realUpdate(int64 price, uint64 pt) internal pure returns (bytes[] memory d) {
        d = new bytes[](1);
        d[0] = abi.encode(BTC_FEED, price, uint64(1_000_000), int32(-8), pt, pt - CADENCE);
    }

    // ---- A1-1 regression: the recorder's REAL fetch shapes must pass ----

    function test_A1_1_freshEntryTickCommits() public {
        // A3-1 flow: announce fixes the anchor; the evidence is the Hermes
        // benchmark at that instant — the FIRST tick at/after it (1s cadence).
        bytes32 h = keccak256("fresh-entry");
        rec.announceCommit(h);
        uint64 anchor = uint64(vm.getBlockTimestamp());
        bytes[] memory d = _realUpdate(int64(uint64(ENTRY)), anchor);
        rec.commitTrade{value: 10}(
            h, "BTC", BobbyTrackRecordV2.Agent.CIO, 7, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, anchor, d
        );
        BobbyTrackRecordV2.Commitment memory c = rec.getCommitment(0);
        assertEq(c.entryEvidence.publishTime, anchor, "first tick at/after the announced anchor");
    }

    function test_A1_1_entryTickBeforeAnchorRejected() public {
        // Evidence must be at/after the announced anchor — an older (backdated)
        // tick fails the Unique window even though it is signed and fresh-ish.
        bytes32 h = keccak256("stale-entry");
        rec.announceCommit(h);
        uint64 anchor = uint64(vm.getBlockTimestamp());
        bytes[] memory d = _realUpdate(int64(uint64(ENTRY)), anchor - 30);
        vm.expectRevert(bytes("RealRulePyth: window"));
        rec.commitTrade{value: 10}(
            h, "BTC", BobbyTrackRecordV2.Agent.CIO, 7, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, anchor, d
        );
    }

    function test_A1_1_benchmarkExitResolvesAtRealCadence() public {
        test_A1_1_freshEntryTickCommits();
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        // Hermes benchmark at exitAt: FIRST tick at/after that instant, with a
        // realistic 1s gap — prev = exitAt-1 < exitAt = minT. Unique passes.
        uint64 pt = exitAt; // feed happened to tick exactly at the instant
        bytes[] memory d = _realUpdate(64_000e8, pt);
        rec.resolveTrade{value: 10}(
            keccak256("fresh-entry"), 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, d
        );
        assertEq(rec.winsVerified(), 1, "benchmark-shaped exit evidence resolves");
    }

    // ---- A1-2 regression: TTL boundary — challenge wins, expiry waits ----

    function test_A1_2_atExactTTL_expiryRevertsChallengeStillOpen() public {
        test_A1_1_freshEntryTickCommits();
        bytes32 h = keccak256("fresh-entry");

        // Exactly at committedAt + TTL: expiry must NOT be possible yet…
        vm.warp(uint256(T0) + rec.MAX_COMMITMENT_TTL());
        vm.expectRevert(bytes("Not yet expired"));
        rec.expireCommitment(h);

        // …while a genuine breach challenge in that same block still lands.
        uint64 anchor = T0 + 1 hours;
        bytes[] memory db = _realUpdate(int64(uint64(61_000e8)), anchor);
        rec.challengeStopBreach{value: 10}(h, anchor, db);
        assertEq(rec.lossesVerified(), 1, "boundary-block challenge records the loss");
    }

    // ---- A2-1 regression: entry is Unique-anchored — no tick shopping ----

    function test_A2_1_entryTickShoppingRejected() public {
        // The recorder declares entryAt but presents a LATER in-window tick
        // (prev >= entryAt proves an earlier tick existed after the anchor).
        // Unique semantics must reject it — evidence is pinned to the FIRST
        // tick at/after the declared anchor, killing retrospective selection.
        bytes32 h = keccak256("shopped");
        rec.announceCommit(h);
        uint64 anchor = uint64(vm.getBlockTimestamp());
        vm.warp(anchor + 40); // market observed for 40s after the announcement
        bytes[] memory shopped = _realUpdate(int64(uint64(ENTRY)), anchor + 20); // prev = anchor+19 >= anchor
        vm.expectRevert(bytes("RealRulePyth: window"));
        rec.commitTrade{value: 10}(
            h, "BTC", BobbyTrackRecordV2.Agent.CIO, 7, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, anchor, shopped
        );
    }

    function test_A3_1_announceGates() public {
        // No announcement → AnnounceRequired.
        uint64 nowTs = uint64(vm.getBlockTimestamp());
        bytes[] memory d = _realUpdate(int64(uint64(ENTRY)), nowTs);
        vm.expectRevert(BobbyTrackRecordV2.AnnounceRequired.selector);
        rec.commitTrade{value: 10}(
            keccak256("unannounced"), "BTC", BobbyTrackRecordV2.Agent.CIO, 7, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, nowTs, d
        );

        // Anchor != announcedAt (the backdating attempt) → EntryAnchorMismatch.
        bytes32 h = keccak256("mismatch");
        rec.announceCommit(h);
        vm.warp(nowTs + 30);
        bytes[] memory older = _realUpdate(int64(uint64(ENTRY)), nowTs - 20);
        vm.expectRevert(BobbyTrackRecordV2.EntryAnchorMismatch.selector);
        rec.commitTrade{value: 10}(
            h, "BTC", BobbyTrackRecordV2.Agent.CIO, 7, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, nowTs - 20, older
        );

        // Announcement aged past the entry window → EntryTooStale (announce
        // and commit must be near-adjacent; a stale announce cannot be aged
        // into observed price action).
        bytes32 h2 = keccak256("stale-announce");
        rec.announceCommit(h2);
        uint64 ann2 = uint64(vm.getBlockTimestamp());
        vm.warp(ann2 + 61);
        bytes[] memory d2 = _realUpdate(int64(uint64(ENTRY)), ann2);
        vm.expectRevert(BobbyTrackRecordV2.EntryTooStale.selector);
        rec.commitTrade{value: 10}(
            h2, "BTC", BobbyTrackRecordV2.Agent.CIO, 7, ENTRY, TARGET, STOP,
            BobbyTrackRecordV2.PriceMode.VERIFIED, ann2, d2
        );
    }

    function test_A1_2_afterTTL_expiryWorks() public {
        test_A1_1_freshEntryTickCommits();
        vm.warp(uint256(T0) + rec.MAX_COMMITMENT_TTL() + 1);
        rec.expireCommitment(keccak256("fresh-entry"));
        (, uint256 expired,) = rec.getCoverage(BobbyTrackRecordV2.PriceMode.VERIFIED);
        assertEq(expired, 1, "strictly-after-TTL expiry still functions");
    }
}
