// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BobbyTrackRecordV2} from "../src/BobbyTrackRecordV2.sol";

/// @title V2ParamsGate — BP-03 (2026-09-04 review): the seven TrackRecordV2
///        verification parameters are validated at FULL WIDTH before they are
///        narrowed to the struct's uint16/uint24 fields, so an operator value
///        that would have truncated into a "valid" number fails before any
///        broadcast. Bounds mirror BobbyTrackRecordV2._validateParams exactly;
///        the constructor re-checks the narrowed values (defense in depth).
///        Deploy, manifest, live verification and the tests share this library.
library V2ParamsGate {
    struct Raw {
        uint256 entryWindowSec;
        uint256 exitWindowSec;
        uint256 maxExitLagSec;
        uint256 challengeWindowSec;
        uint256 entryTolBps;
        uint256 exitTolBps;
        uint256 confMaxBps;
    }

    /// @dev Mirrors BobbyTrackRecordV2.PYTH_ACTIVATION_DELAY (a contract
    ///      constant is not addressable through the type). DeploymentGates
    ///      proves the two agree by deploying the real contract at the boundary.
    uint256 internal constant PYTH_ACTIVATION_DELAY = 2 days;

    /// @dev Audited deploy defaults (Anthony's §8 decisions: maxExitLag 600s
    ///      cap, 7-day challenge window, 100 bps tolerances, conf 50 bps).
    function defaults() internal pure returns (Raw memory r) {
        r.entryWindowSec = 60;
        r.exitWindowSec = 120;
        r.maxExitLagSec = 600;
        r.challengeWindowSec = 7 days;
        r.entryTolBps = 100;
        r.exitTolBps = 100;
        r.confMaxBps = 50;
    }

    /// @dev Full-width bounds. Width checks come FIRST so an overflowing value
    ///      is reported as such, then the semantic bounds (identical to the
    ///      contract's _validateParams, including the V-03 timelock relation).
    function validate(Raw memory r) internal pure {
        require(r.entryWindowSec <= type(uint16).max, "V2ParamsGate: entryWindowSec exceeds uint16");
        require(r.exitWindowSec <= type(uint16).max, "V2ParamsGate: exitWindowSec exceeds uint16");
        require(r.maxExitLagSec <= type(uint24).max, "V2ParamsGate: maxExitLagSec exceeds uint24");
        require(r.challengeWindowSec <= type(uint24).max, "V2ParamsGate: challengeWindowSec exceeds uint24");
        require(r.entryTolBps <= type(uint16).max, "V2ParamsGate: entryTolBps exceeds uint16");
        require(r.exitTolBps <= type(uint16).max, "V2ParamsGate: exitTolBps exceeds uint16");
        require(r.confMaxBps <= type(uint16).max, "V2ParamsGate: confMaxBps exceeds uint16");

        require(r.entryWindowSec >= 10 && r.entryWindowSec <= 600, "V2ParamsGate: entryWindowSec out of [10,600]");
        require(r.exitWindowSec >= 10 && r.exitWindowSec <= 1800, "V2ParamsGate: exitWindowSec out of [10,1800]");
        require(r.maxExitLagSec >= 300 && r.maxExitLagSec <= 3600, "V2ParamsGate: maxExitLagSec out of [300,3600]");
        require(
            r.challengeWindowSec > PYTH_ACTIVATION_DELAY && r.challengeWindowSec <= 30 days,
            "V2ParamsGate: challengeWindowSec out of (PYTH_ACTIVATION_DELAY,30d]"
        );
        require(r.entryTolBps >= 10 && r.entryTolBps <= 500, "V2ParamsGate: entryTolBps out of [10,500]");
        require(r.exitTolBps >= 10 && r.exitTolBps <= 500, "V2ParamsGate: exitTolBps out of [10,500]");
        require(r.confMaxBps >= 10 && r.confMaxBps <= 200, "V2ParamsGate: confMaxBps out of [10,200]");
        // A-08 (minCommitAge > exitWindowSec) cannot trip on a fresh deploy:
        // minCommitAge starts at 1 hours and exitWindowSec is capped at 1800.
    }

    /// @dev Validates, then narrows. The ONLY path from env to the constructor.
    function narrow(Raw memory r) internal pure returns (BobbyTrackRecordV2.VerificationParams memory p) {
        validate(r);
        p.entryWindowSec = uint16(r.entryWindowSec);
        p.exitWindowSec = uint16(r.exitWindowSec);
        p.maxExitLagSec = uint24(r.maxExitLagSec);
        p.challengeWindowSec = uint24(r.challengeWindowSec);
        p.entryTolBps = uint16(r.entryTolBps);
        p.exitTolBps = uint16(r.exitTolBps);
        p.confMaxBps = uint16(r.confMaxBps);
    }

    /// @dev Reads the deployed struct through its public getter (a 7-tuple).
    function live(address trackRecord) internal view returns (BobbyTrackRecordV2.VerificationParams memory p) {
        (p.entryWindowSec, p.exitWindowSec, p.maxExitLagSec, p.challengeWindowSec, p.entryTolBps, p.exitTolBps, p.confMaxBps) =
            BobbyTrackRecordV2(trackRecord).params();
    }

    /// @dev Live comparison (post-deploy assertion + VerifyBaseDeployment): the
    ///      deployed params must equal the reviewed full-width values, and the
    ///      reviewed values must themselves be valid — a manifest carrying an
    ///      out-of-range number is rejected even if the chain happened to agree.
    function assertMatches(BobbyTrackRecordV2.VerificationParams memory deployed, Raw memory reviewed) internal pure {
        validate(reviewed);
        require(deployed.entryWindowSec == reviewed.entryWindowSec, "V2ParamsGate: live entryWindowSec drift");
        require(deployed.exitWindowSec == reviewed.exitWindowSec, "V2ParamsGate: live exitWindowSec drift");
        require(deployed.maxExitLagSec == reviewed.maxExitLagSec, "V2ParamsGate: live maxExitLagSec drift");
        require(deployed.challengeWindowSec == reviewed.challengeWindowSec, "V2ParamsGate: live challengeWindowSec drift");
        require(deployed.entryTolBps == reviewed.entryTolBps, "V2ParamsGate: live entryTolBps drift");
        require(deployed.exitTolBps == reviewed.exitTolBps, "V2ParamsGate: live exitTolBps drift");
        require(deployed.confMaxBps == reviewed.confMaxBps, "V2ParamsGate: live confMaxBps drift");
    }
}
