// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";

/// @title TrackRecord v2 — PoC de Pyth real en Base Sepolia (spec v0.5 §9)
/// @notice FORK TEST, no broadcast. Mide: gas de parsePriceFeedUpdatesUnique,
///         fee real, semántica de ventana/unique, y valida el math §3.0 con un
///         update FIRMADO real de Hermes Benchmarks (BTC/USD, 2026-08-12).
/// @dev Correr con: RUN_PYTH_POC=true forge test --match-contract TrackRecordV2PythPoC -vvv
///      Sin la env var los tests se saltan (la suite normal no toca la red).
interface IPythPoC {
    struct Price { int64 price; uint64 conf; int32 expo; uint256 publishTime; }
    struct PriceFeed { bytes32 id; Price price; Price emaPrice; }
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256);
    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData, bytes32[] calldata priceIds,
        uint64 minPublishTime, uint64 maxPublishTime
    ) external payable returns (PriceFeed[] memory);
}

/// @dev Copia EXACTA del math de normalización del spec §3.0 (validación B-01).
library PocNorm {
    error NonPositivePrice();
    error UnexpectedExpo();

    function toE8(int64 price, int32 expo) internal pure returns (uint256 oracle1e8) {
        if (price <= 0) revert NonPositivePrice();
        if (expo < -18 || expo > 0) revert UnexpectedExpo();
        int32 shift = expo + 8;
        oracle1e8 = shift >= 0
            ? uint256(uint64(price)) * 10 ** uint32(shift)
            : uint256(uint64(price)) / 10 ** uint32(uint32(-shift));
        if (oracle1e8 == 0) revert NonPositivePrice();
    }

    function withinBps(uint256 reported, uint256 oracle1e8, uint16 tolBps) internal pure returns (bool) {
        uint256 diff = reported > oracle1e8 ? reported - oracle1e8 : oracle1e8 - reported;
        return diff * 10_000 / oracle1e8 <= tolBps;
    }

    function confOk(uint64 conf, int64 price, uint16 confMaxBps) internal pure returns (bool) {
        return uint256(conf) * 10_000 / uint256(uint64(price)) <= confMaxBps;
    }
}

/// @dev Probe de layout OBJETIVO del spec §2 (F-06) — solo storage, sin lógica.
///      `forge inspect CommitmentLayoutProbe storage-layout` congela §2.
contract CommitmentLayoutProbe {
    enum PriceMode { ATTESTED, VERIFIED }
    enum Agent { CIO, ALPHA, REDTEAM }
    struct OracleEvidence { bytes32 feedId; int64 price; uint64 conf; int32 expo; uint64 publishTime; }
    struct CommitmentV2 {
        bytes32 debateHash;        // slot 1
        uint96 entryPrice; uint96 targetPrice; uint64 committedAt;   // slot 2
        uint96 stopPrice; address recorder;                           // slot 3 (28/32)
        // slot 4: 8+1+1+1+1 + params encogidos 2+2+3+3+2+2+2 = 28/32
        uint64 minResolveAt; Agent agent; uint8 conviction; bool resolved; PriceMode mode;
        uint16 entryWindowSec; uint16 exitWindowSec; uint24 maxExitLagSec; uint24 challengeWindowSec;
        uint16 entryTolBps; uint16 exitTolBps; uint16 confMaxBps;
        OracleEvidence entryEvidence;  // slots 5–6
        string symbol;                 // slot 7+
    }
    CommitmentV2 internal probe;
}

contract TradeLayoutProbe {
    enum PriceMode { ATTESTED, VERIFIED }
    enum Agent { CIO, ALPHA, REDTEAM }
    enum Result { PENDING, WIN, LOSS, EXPIRED, BREAK_EVEN }
    struct OracleEvidence { bytes32 feedId; int64 price; uint64 conf; int32 expo; uint64 publishTime; }
    struct TradeV2 {
        bytes32 debateHash;                                            // slot 1
        uint96 entryPrice; uint96 exitPrice; uint64 committedAt;       // slot 2
        // slot 3: 8+20+1+1+1+1 = 32/32 exacto (mode toma el byte libre de v1)
        uint64 resolvedAt; address recorder; Agent agent; uint8 conviction; Result result; PriceMode mode;
        int256 pnlBps;                                                 // slot 4 (int256 = slot completo)
        // slot 5 NUEVO (F-06 confirmado: no caben en los slots v1): 8+8+1 = 17/32
        uint64 exitAt; uint64 challengeDeadline; bool stopChallenged;
        OracleEvidence entryEvidence;                                  // slots 6–7
        OracleEvidence exitEvidence;                                   // slots 8–9
        string symbol;                                                 // slot 10+
    }
    TradeV2 internal probe;
}

contract TrackRecordV2PythPoC is Test {
    // Pyth en Base Sepolia (oracle-comparison.md §1, verificado)
    IPythPoC constant PYTH = IPythPoC(0xA2aa501b19aff244D90cc15a4Cf739D2725B5729);
    bytes32 constant BTC_FEED = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;

    // Update firmado REAL — Hermes Benchmarks /v2/updates/price/1786591762 (2026-08-12).
    // publishTime 1786591762, prevPublishTime 1786591761, price 6350230500000 expo -8
    // (= $63,502.305), conf 1985500000. 1,311 bytes.
    uint64 constant PT = 1786591762;
    int64  constant PRICE = 6350230500000;
    int32  constant EXPO = -8;
    uint64 constant CONF = 1985500000;
    bytes constant UPDATE = hex"504e41550100000003b801000000070d004efac545aa4fae508bc342be70e91c9f2e1e11d00bbcb582cb9afe3b1015ceb8586f00c8d2d45ee3e5cf084be50bfc2b0e76887430ce10b0f60b485d4cec762700016b02551b14f25e9be148a54a45ce00e91f87e3100706943e673360ea96174ee41b35af1f8877e5fb214d2927d9559cb872ad4a0ae0dcd5e4e0201f0eeeb58c8e0002b7dafffe21dfcb11a0e124cddc81cb851356cc9d883b89e32d3723a1414a2e4516dc6d67e32fce75b5f9d0c3cd75540cc73d06037eeb5afccabd43531b50926d00047762e74e73c04a74bd20ed115f12c6ae2b333525db8f126e2d81471e10c6c65a722e618fbea06fb43bc9573db99643e8e6f055c50e04f79aba230a40787f3fcd0106f2bf4b7c92d9f48f2a29e16f174274be3b503d42f39af7d8b9923650bf5dfd092beb3b74af7c80ca95f58121c0d54420e9401680d7909d37ec321422145ea36500074ace013d14276326b5731218d314bc585c97b8e01a657f4968473e55179182bd3aa32e14edc2c0a58e60d770f53c2147e245c55473507e04d89f1a7b438687f801086cbdd2262a93e6ea6d3dfa1d473309184478c08b2329aaba0370978f53b2452529fafd171e7693943ae25fd96c6e177158e9f2ac3d211ab4b0c0aa6ae0e8000a000a148b47ffbd585618db6bb6ed5322aab9f3762b65c685a6558b03aa59a8e7569b6278ca3ed5603dcb67f125fd84f4433adbc43329d59d01d02b1f61a952703ae5010b55dbbe66f067a967dbf8bc09053221ca60b964cf2c144ee2519e34eaf6ca1c3709bef3118f2fef25221dee640c89d6f5c4730bef3c3d7ed962fee7e3391ba290010d9ae04fe97199491ea436f17b227c9cee47e7d2c2f63a14d4f0b2fc0c0436ec816252db6a79428c517654f3a8838da485ddcecb5f5c8357c6d2f64f6c6b8c90e00110033a7be9891389c167059a95137c68061da34483279beebd0ef70dab18fa93ed34276aa614661b6449346cb32635847d2e8debc56158fc6ad9c7dfd8779295c90111cbc2324278da0609d65befebe51c583a186bfddabba8c37ce13af231dc976e973a111dd1bb2fd089ca6a7ca74c5821bd2c2b324880b494b5f5263e542b13f1d70112093b4c51f7bf9038d68f3ba0a4238bfaaafe8d45bee51fa56270289a850f6522514b485915dba166b4afe7d3af31d595afa7b5341abe32f60f1686147c66ccb1016a7d3a1200000000001ae101faedac5851e32b9b23b5f9411a8c2bac4aae3ed4dd7b811dd1a72ea4aa71000000000d4ff92c01415557560000000000125dd28c00002710e86f43b66cc00ecb43c985ee50ee42e4c422c3a101005500e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43000005c6873bb2a00000000076585360fffffff8000000006a7d3a12000000006a7d3a11000005c5297c2ce000000000759f35240dd277de99236f127d0be6e03585416e270c80bee5c7aaaa08d6f6f5da8c967753322c17aec677ecb325c8f753e7db715460cdc93ac3005b401643678890a39fe60d6f04b765d2fb6e48f6261d4f26839bc1d4ec6f9021c0aaf00d0ea22e5ba431eb7a0d56ac3bbee26e6e14adacf5a5c7e12a231fb49244e42b2fce18502f85d0933a4a77d96dc1af3677284d47d1ddea1fa8fb97c12aeecb771e1a74951818e298eb2afccf5c49646ab4caf433686e92bb7419a53b81f7affe0b826385680feaced7d116a56d12154e4729005a9af6d3b809b6d65aa5a2649d49bd1890d27f02a1a061cbdebb961bb21cb90cce66a81752c2804dbc061e2df24d9178c03ea3e3e88ca1c5";

    bool internal runPoc;

    function setUp() public {
        runPoc = vm.envOr("RUN_PYTH_POC", false);
        if (runPoc) {
            vm.createSelectFork(vm.rpcUrl("base_sepolia_publicnode"));
            vm.deal(address(this), 1 ether);
        }
    }

    function _data() internal pure returns (bytes[] memory d, bytes32[] memory ids) {
        d = new bytes[](1);
        d[0] = UPDATE;
        ids = new bytes32[](1);
        ids[0] = BTC_FEED;
    }

    /// PoC-1: fee real + gas real de parseUnique + semántica del update devuelto.
    function test_poc_parseUnique_gas_fee_semantics() public {
        if (!runPoc) { emit log("SKIP: RUN_PYTH_POC not set"); return; }
        (bytes[] memory d, bytes32[] memory ids) = _data();

        uint256 fee = PYTH.getUpdateFee(d);
        emit log_named_uint("updateFee_wei", fee);
        assertGt(fee, 0, "fee must be nonzero");

        // Ventana estilo exit F-01: [PT, PT] con max = exit declarado.
        // unique: prev (PT-1) < min (PT) <= publishTime (PT).
        uint256 g0 = gasleft();
        IPythPoC.PriceFeed[] memory feeds = PYTH.parsePriceFeedUpdatesUnique{value: fee}(d, ids, PT, PT + 120);
        uint256 gasUsed = g0 - gasleft();
        emit log_named_uint("parseUnique_gas", gasUsed);
        emit log_named_uint("calldata_bytes", UPDATE.length);

        assertEq(feeds.length, 1);
        assertEq(feeds[0].id, BTC_FEED, "feed id");
        assertEq(feeds[0].price.price, PRICE, "price");
        assertEq(feeds[0].price.expo, EXPO, "expo");
        assertEq(feeds[0].price.conf, CONF, "conf");
        assertEq(feeds[0].price.publishTime, uint256(PT), "publishTime");
    }

    /// PoC-2: la ventana rechaza un update fuera de [min, max] (regresión F-01).
    function test_poc_parseUnique_reverts_outside_window() public {
        if (!runPoc) { emit log("SKIP: RUN_PYTH_POC not set"); return; }
        (bytes[] memory d, bytes32[] memory ids) = _data();
        uint256 fee = PYTH.getUpdateFee(d);
        // max < publishTime ⇒ el update no puede probar ese rango.
        vm.expectRevert();
        PYTH.parsePriceFeedUpdatesUnique{value: fee}(d, ids, PT - 600, PT - 300);
    }

    /// PoC-3: semántica UNIQUE — prev < min es obligatorio: con min = PT-1
    /// (== prevPublishTime) el update NO es "el primero desde min" y revierte.
    /// Consecuencia de diseño: con min fijado por el contrato, el update válido
    /// es ÚNICO y determinista — el recorder no elige nada dentro de la ventana.
    function test_poc_parseUnique_enforces_first_after_min() public {
        if (!runPoc) { emit log("SKIP: RUN_PYTH_POC not set"); return; }
        (bytes[] memory d, bytes32[] memory ids) = _data();
        uint256 fee = PYTH.getUpdateFee(d);
        vm.expectRevert();
        PYTH.parsePriceFeedUpdatesUnique{value: fee}(d, ids, PT - 1, PT + 120);
    }

    /// PoC-4: math §3.0 (B-01) contra los valores REALES del update + sintéticos.
    function test_poc_normalization_math() public pure {
        // Real: expo -8 ⇒ identidad (price ya está en 1e8)
        assertEq(PocNorm.toE8(PRICE, EXPO), uint256(uint64(PRICE)));
        // $63,502.305 en 1e8:
        assertEq(PocNorm.toE8(PRICE, EXPO), 6350230500000);
        // Sintéticos: expo -5 (×1000) y -12 (÷10000)
        assertEq(PocNorm.toE8(1234567, -5), 1234567000);
        assertEq(PocNorm.toE8(12345678901234, -12), 1234567890);
        // expo 0 (×1e8)
        assertEq(PocNorm.toE8(63502, 0), 6350200000000);
        // Basis band: reportado a 50 bps del oráculo pasa con tol 100, falla con tol 30
        uint256 o = PocNorm.toE8(PRICE, EXPO);
        uint256 rep = o + (o * 50 / 10_000);
        assertTrue(PocNorm.withinBps(rep, o, 100));
        assertFalse(PocNorm.withinBps(rep, o, 30));
        // Conf gate con los valores reales: conf/price ≈ 3.1 bps (BTC muy líquido)
        // ⇒ el default confMaxBps=50 tiene ~16× de holgura. Falla solo bajo 3.
        assertTrue(PocNorm.confOk(CONF, PRICE, 50));
        assertFalse(PocNorm.confOk(CONF, PRICE, 2));
    }

    /// PoC-5: reverts del math (precio no positivo / expo fuera de rango).
    function test_poc_normalization_reverts() public {
        vm.expectRevert(PocNorm.NonPositivePrice.selector);
        this.extNorm(0, -8);
        vm.expectRevert(PocNorm.NonPositivePrice.selector);
        this.extNorm(-1, -8);
        vm.expectRevert(PocNorm.UnexpectedExpo.selector);
        this.extNorm(1e8, 1);
        vm.expectRevert(PocNorm.UnexpectedExpo.selector);
        this.extNorm(1e8, -19);
    }

    function extNorm(int64 p, int32 e) external pure returns (uint256) {
        return PocNorm.toE8(p, e);
    }
}
