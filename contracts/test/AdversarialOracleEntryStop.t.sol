// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {BobbyTrackRecordV2, PythStructs} from "../src/BobbyTrackRecordV2.sol";

contract OESMockPyth {
    function getUpdateFee(bytes[] calldata) external pure returns (uint256) { return 10; }
    function parsePriceFeedUpdatesUnique(
        bytes[] calldata u, bytes32[] calldata ids, uint64 minT, uint64 maxT
    ) external payable returns (PythStructs.PriceFeed[] memory out) {
        require(msg.value >= 10, "fee");
        out = new PythStructs.PriceFeed[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            (bytes32 id, int64 p, uint64 c, int32 e, uint64 pt, uint64 pv) =
                abi.decode(u[i], (bytes32, int64, uint64, int32, uint64, uint64));
            require(id == ids[i], "id");
            require(pv < minT && minT <= pt && pt <= maxT, "window");
            out[i] = PythStructs.PriceFeed(id, PythStructs.Price(p, c, e, pt), PythStructs.Price(p, c, e, pt));
        }
    }

    function parsePriceFeedUpdates(
        bytes[] calldata u, bytes32[] calldata ids, uint64 minT, uint64 maxT
    ) external payable returns (PythStructs.PriceFeed[] memory out) {
        require(msg.value >= 10, "fee");
        out = new PythStructs.PriceFeed[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            (bytes32 id, int64 p, uint64 c, int32 e, uint64 pt,) =
                abi.decode(u[i], (bytes32, int64, uint64, int32, uint64, uint64));
            require(id == ids[i], "id");
            require(minT <= pt && pt <= maxT, "window");
            out[i] = PythStructs.PriceFeed(id, PythStructs.Price(p, c, e, pt), PythStructs.Price(p, c, e, pt));
        }
    }
}

/// @dev Codex/Kimi r2 adversarial finding: challenge anchors stop+direction to
///      the REPORTED entry while resolve classifies against the ORACLE entry.
///      Inside the entry tolerance band a challenger can fabricate a LOSS on a
///      trade that is still a GAIN vs the verified oracle entry.
contract AdversarialOracleEntryStopTest is Test {
    BobbyTrackRecordV2 rec;
    OESMockPyth pyth;
    bytes32 constant BTC_FEED = bytes32(uint256(0xB7C));
    uint64 constant T0 = 1_800_000_000;

    // Oracle entry 63,000. Reported entry 63,600 (≈95 bps above oracle, inside
    // the 100 bps band). Stop 63,300 (below reported entry → long; ABOVE oracle
    // entry). Target 66,000.
    uint96 constant ORACLE_ENTRY = 63_000e8;
    uint96 constant REPORTED_ENTRY = 63_600e8;
    uint96 constant STOP = 63_300e8;
    uint96 constant TARGET = 66_000e8;

    function _u(int64 price, uint64 pt, uint64 prev) internal pure returns (bytes[] memory d) {
        d = new bytes[](1);
        d[0] = abi.encode(BTC_FEED, price, uint64(1_000_000), int32(-8), pt, prev);
    }

    receive() external payable {}

    function setUp() public {
        vm.warp(T0);
        pyth = new OESMockPyth();
        BobbyTrackRecordV2.VerificationParams memory p = BobbyTrackRecordV2.VerificationParams({
            entryWindowSec: 60, exitWindowSec: 120, maxExitLagSec: 600,
            challengeWindowSec: 7 days, entryTolBps: 100, exitTolBps: 100, confMaxBps: 50
        });
        string[] memory syms = new string[](1); syms[0] = "BTC";
        bytes32[] memory feeds = new bytes32[](1); feeds[0] = BTC_FEED;
        address[] memory pyths = new address[](1); pyths[0] = address(pyth);
        rec = new BobbyTrackRecordV2(address(this), p, pyths, syms, feeds);
    }

    function test_fabricatedLossConfig_rejectedAtCommit() public {
        // Codex P1 fix: the attack configuration (stop between oracle entry and
        // reported entry) is rejected at COMMIT — the stop must sit strictly on
        // the loss side of the ORACLE entry, so no crossing tick can ever be a
        // gain against the verified entry.
        bytes32 h = keccak256("oes");
        bytes[] memory de = _u(int64(uint64(ORACLE_ENTRY)), T0 - 5, T0 - 70);
        vm.expectRevert(BobbyTrackRecordV2.InvalidDirection.selector);
        rec.commitTrade{value: 10}(h, "BTC", BobbyTrackRecordV2.Agent.CIO, 7, REPORTED_ENTRY, TARGET, STOP, BobbyTrackRecordV2.PriceMode.VERIFIED, de);
    }

    function test_fabricatedLossConfig_short_rejectedAtCommit() public {
        // Symmetric SHORT: reported entry 62,400 (below oracle 63,000, inside
        // band), stop 62,700 (above reported → short; BELOW oracle entry) —
        // same fabrication surface mirrored. Must be rejected at commit.
        bytes32 h = keccak256("oes-short");
        bytes[] memory de = _u(int64(uint64(ORACLE_ENTRY)), T0 - 5, T0 - 70);
        vm.expectRevert(BobbyTrackRecordV2.InvalidDirection.selector);
        rec.commitTrade{value: 10}(
            h, "BTC", BobbyTrackRecordV2.Agent.CIO, 7,
            62_400e8, 60_000e8, 62_700e8,
            BobbyTrackRecordV2.PriceMode.VERIFIED, de
        );
    }

    function test_short_lifecycle_resolveAndChallenge() public {
        // Kimi gap: zero SHORT coverage. Full short lifecycle: commit (stop
        // above BOTH entries), resolve WIN (price fell), then a genuine breach
        // ABOVE the oracle entry reclassifies to LOSS with oracle-derived pnl.
        bytes32 h = keccak256("short-life");
        bytes[] memory de = _u(int64(uint64(ORACLE_ENTRY)), T0 - 5, T0 - 70);
        // short: reported 63,100 (within band of 63,000), stop 64,000 (> both),
        // target 61,000 (< both)
        rec.commitTrade{value: 10}(
            h, "BTC", BobbyTrackRecordV2.Agent.CIO, 7,
            63_100e8, 61_000e8, 64_000e8,
            BobbyTrackRecordV2.PriceMode.VERIFIED, de
        );

        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        // oracle exit 62,000 < oracle entry 63,000 → short WIN (+158 bps)
        bytes[] memory dr = _u(int64(62_000e8), exitAt + 1, exitAt - 1);
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 62_000e8, exitAt, dr);
        assertEq(rec.winsVerified(), 1);

        // genuine breach: tick 64,100 >= stop 64,000 (short side) and above the
        // oracle entry → real loss. Reclassify with oracle-derived magnitude:
        // (63,000 - 64,000)/63,000 = -158 bps (stop level vs ORACLE entry).
        vm.warp(T0 + 3 hours);
        uint64 anchor = T0 + 1 hours;
        bytes[] memory dc = _u(int64(64_100e8), anchor + 3, anchor - 10);
        rec.challengeStopBreach{value: 10}(h, anchor, dc);
        assertEq(rec.winsVerified(), 0);
        assertEq(rec.lossesVerified(), 1);
        BobbyTrackRecordV2.Trade memory t = rec.getTrade(0);
        assertEq(t.pnlBps, -158);
    }

    function test_realStopOut_stillReclassifies() public {
        // Control: a genuine stop-out (breach below the oracle entry) must still
        // reclassify to LOSS, so the fix doesn't neuter the mechanism.
        bytes32 h = keccak256("real");
        bytes[] memory de = _u(int64(uint64(ORACLE_ENTRY)), T0 - 5, T0 - 70);
        rec.commitTrade{value: 10}(h, "BTC", BobbyTrackRecordV2.Agent.CIO, 7, REPORTED_ENTRY, TARGET, 62_000e8, BobbyTrackRecordV2.PriceMode.VERIFIED, de);
        vm.warp(T0 + 2 hours);
        uint64 exitAt = uint64(vm.getBlockTimestamp()) - 100;
        bytes[] memory dr = _u(int64(64_000e8), exitAt + 1, exitAt - 1);
        rec.resolveTrade{value: 10}(h, 158, BobbyTrackRecordV2.Result.WIN, 64_000e8, exitAt, dr);

        vm.warp(T0 + 3 hours);
        uint64 anchor = T0 + 1 hours;
        // breach 61,800 < oracle entry 63,000 → genuine loss
        bytes[] memory dc = _u(int64(61_800e8), anchor + 3, anchor - 10);
        rec.challengeStopBreach{value: 10}(h, anchor, dc);
        assertEq(rec.lossesVerified(), 1, "genuine stop-out must reclassify");
        assertEq(rec.winsVerified(), 0);
    }
}
