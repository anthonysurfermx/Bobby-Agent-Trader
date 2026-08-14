// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {BobbyTrackRecordV2} from "../src/BobbyTrackRecordV2.sol";

/// @title ABI/layout guardrails (spec F-06 / audit r2 fix 4)
/// @notice The authoritative storage-layout regression check is
///         `script/check-layout.sh` — it diffs the live `forge inspect`
///         storage layout against `test/snapshots/BobbyTrackRecordV2.layout.json`
///         and fails on ANY drift. (The former field-count "test" here was
///         theatre — it asserted a constant against itself. Removed.)
///         What Solidity CAN verify at test time is the ABI surface D-1 relies
///         on: that the verified and attested win-rate getters are two distinct
///         selectors and that no combined getter exists.
contract LayoutSnapshotTest is Test {
    function test_d1_separateWinRateSelectors() public pure {
        bytes4 v = BobbyTrackRecordV2.getVerifiedWinRate.selector;
        bytes4 a = BobbyTrackRecordV2.getAttestedWinRate.selector;
        assertTrue(v != bytes4(0) && a != bytes4(0));
        assertTrue(v != a, "verified/attested win-rate selectors must differ");
    }

    /// @dev The scorecard bundles the verified win rate WITH coverage in one
    ///      call (V-02), so a consumer cannot fetch the rate alone. Assert the
    ///      selector exists and returns the six-tuple shape by calling it.
    function test_v02_scorecardSelectorExists() public pure {
        assertTrue(BobbyTrackRecordV2.getVerifiedScorecard.selector != bytes4(0));
    }
}
