# Brief para Codex — Security Audit Round 3: BobbyAdversarialBounties

## Contexto del Producto
**Producto**: Bobby Adversarial Bounties — contrato que permite poner OKB como recompensa para quien demuestre que un debate de Bobby (AI trading CIO) estuvo mal calibrado en una dimensión específica (data_integrity, adversarial_quality, decision_logic, risk_management, calibration_alignment, novelty).
**Stack**: Solidity 0.8.19, Foundry, deployment en X Layer (Chain ID 196).
**Chain/Red**: OKX X Layer — native OKB como moneda de bounty.
**Hackathon**: Build X Season 2, submission el 2026-04-15. Este es el contrato principal del Día 6.

## Problema Específico
Este contrato custodia OKB de usuarios. Un bug de seguridad aquí puede drenar fondos, bloquear reclamos legítimos, o permitir que el resolver pague a challengers falsos. Ya hicimos 2 rondas de revisión interna (Claude self-review + adversarial pass). Necesitamos una tercera mirada independiente antes de deployar. El patrón de referencia es BobbyConvictionOracle v2 — auditado por Gemini en marzo, del cual heredamos: struct packing, pull payments, events-as-history, 2-step ownership, pausable (solo no-crítico).

## Decisiones de diseño ya tomadas (no discutir)
1. **Resolver centralizado**: un solo address elige al ganador. Aceptable para hackathon, futuro: DAO voting.
2. **Evidence off-chain**: solo guardamos `bytes32 evidenceHash` (IPFS/Arweave CID), no el blob.
3. **Pull payments**: nunca hacemos `.transfer` directo al ganador; acumulamos en `pendingWithdrawals` y el usuario llama `withdraw()`.
4. **Pause NO aplica a `withdraw()` ni `withdrawBounty()`**: explícitamente diseñado así para que owner malicioso no pueda congelar fondos de usuarios.
5. **Challenge grace period**: si un bounty recibió ≥1 challenge, el window efectivo se extiende 3 días automáticamente — para que el poster no pueda cheesear un challenge honesto dejando que el resolver no actúe.
6. **Single winner**: solo un challenger gana la bounty entera. No hay splits.
7. **`uint96` para reward**: cap ~79B OKB, suficiente.
8. **Constructor sin `_resolver == owner`**: ambos pueden ser distintos desde el inicio.

## Archivos a revisar

### contracts/src/BobbyAdversarialBounties.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract BobbyAdversarialBounties {
    enum Dimension { DATA_INTEGRITY, ADVERSARIAL_QUALITY, DECISION_LOGIC, RISK_MANAGEMENT, CALIBRATION_ALIGNMENT, NOVELTY }
    enum BountyStatus { OPEN, CHALLENGED, RESOLVED, WITHDRAWN }

    struct Bounty {
        bytes32 threadHash;
        address poster;
        uint96 reward;
        address winner;
        uint64 createdAt;
        uint32 claimWindowSecs;
        Dimension dimension;
        BountyStatus status;
        uint16 challengeCount;
    }

    struct Challenge {
        address challenger;
        bytes32 evidenceHash;
        uint64 submittedAt;
    }

    address public owner;
    address public pendingOwner;
    address public resolver;
    bool public paused;

    uint96 public constant ABSOLUTE_MIN_BOUNTY = 0.0001 ether;
    uint96 public minBounty = 0.001 ether;
    uint32 public challengeGracePeriod = 3 days;
    uint16 public maxChallenges = 50;
    uint32 public defaultClaimWindow = 7 days;

    mapping(address => uint256) public pendingWithdrawals;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Challenge[]) internal _challenges;
    uint256 public nextBountyId = 1;

    // [events + modifiers omitted for brevity — standard pattern]

    function postBounty(string calldata _threadId, Dimension _dimension, uint32 _claimWindowSecs)
        external payable whenNotPaused returns (uint256 bountyId)
    {
        require(msg.value >= minBounty, "Bounty below minimum");
        require(msg.value <= type(uint96).max, "Bounty too large");
        require(bytes(_threadId).length > 0, "Empty thread");

        uint32 window = _claimWindowSecs > 0 ? _claimWindowSecs : defaultClaimWindow;
        require(window >= 1 hours && window <= 90 days, "Window out of range");

        bountyId = nextBountyId++;
        bounties[bountyId] = Bounty({
            threadHash: keccak256(bytes(_threadId)),
            poster: msg.sender,
            reward: uint96(msg.value),
            winner: address(0),
            createdAt: uint64(block.timestamp),
            claimWindowSecs: window,
            dimension: _dimension,
            status: BountyStatus.OPEN,
            challengeCount: 0
        });
        emit BountyPosted(bountyId, msg.sender, keccak256(bytes(_threadId)), _dimension, uint96(msg.value), window);
    }

    function submitChallenge(uint256 _bountyId, bytes32 _evidenceHash) external whenNotPaused {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(b.status == BountyStatus.OPEN || b.status == BountyStatus.CHALLENGED, "Bounty not open");
        require(msg.sender != b.poster, "Poster cannot challenge own bounty");
        require(_evidenceHash != bytes32(0), "Evidence required");
        require(b.challengeCount < maxChallenges, "Max challenges reached");
        require(block.timestamp < b.createdAt + b.claimWindowSecs, "Claim window expired");

        uint16 idx = b.challengeCount;
        _challenges[_bountyId].push(Challenge({
            challenger: msg.sender,
            evidenceHash: _evidenceHash,
            submittedAt: uint64(block.timestamp)
        }));
        b.challengeCount = idx + 1;
        if (b.status == BountyStatus.OPEN) b.status = BountyStatus.CHALLENGED;
        emit ChallengeSubmitted(_bountyId, msg.sender, _evidenceHash, idx, uint64(block.timestamp));
    }

    function resolveBounty(uint256 _bountyId, address _winner) external onlyResolver whenNotPaused {
        Bounty storage b = bounties[_bountyId];
        require(b.poster != address(0), "Bounty not found");
        require(b.status == BountyStatus.CHALLENGED, "No challenges to resolve");
        require(_winner != address(0), "Invalid winner");

        bool isValidChallenger = false;
        Challenge[] storage chs = _challenges[_bountyId];
        for (uint256 i = 0; i < chs.length; i++) {
            if (chs[i].challenger == _winner) { isValidChallenger = true; break; }
        }
        require(isValidChallenger, "Winner did not challenge");

        b.winner = _winner;
        b.status = BountyStatus.RESOLVED;
        pendingWithdrawals[_winner] += b.reward;
        emit BountyResolved(_bountyId, _winner, b.reward);
    }

    function withdrawBounty(uint256 _bountyId) external {
        // Note: intentionally NOT whenNotPaused — pause must not trap funds
        Bounty storage b = bounties[_bountyId];
        require(b.poster == msg.sender, "Not poster");
        require(b.status == BountyStatus.OPEN || b.status == BountyStatus.CHALLENGED, "Already finalized");

        uint256 effectiveExpiry = uint256(b.createdAt) + uint256(b.claimWindowSecs);
        if (b.status == BountyStatus.CHALLENGED) {
            effectiveExpiry += uint256(challengeGracePeriod);
        }
        require(block.timestamp >= effectiveExpiry, "Window still active");

        uint96 amount = b.reward;
        b.status = BountyStatus.WITHDRAWN;
        pendingWithdrawals[msg.sender] += amount;
        emit BountyWithdrawn(_bountyId, msg.sender, amount);
    }

    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    receive() external payable { revert("Use postBounty"); }
}
```

## Hallazgos ya resueltos (rondas 1 y 2)
- **R1:** `BountyStatus.EXPIRED` declarado pero no usado → eliminado del enum.
- **R1:** `setMinBounty` podía llegar a 0 → añadido `ABSOLUTE_MIN_BOUNTY` constant.
- **R1:** Poster podía cheesear challengers legítimos dejando que el window expire sin que resolver actúe → añadido `challengeGracePeriod` de 3 días al expiry efectivo si hay challenges.
- **R2:** `withdrawBounty` tenía `whenNotPaused` → removido. Owner malicioso podía pausar para congelar reclamos.
- **R2:** `ChallengeSubmitted` event no incluía timestamp → añadido `uint64 submittedAt` al evento para orden indexable off-chain.

## Preguntas Específicas para Codex

1. **Reentrancy en `withdraw()`:** Usamos checks-effects-interactions estricto (`pendingWithdrawals[msg.sender] = 0` antes del `.call`). ¿Hay algún vector de reentrancy cross-function? Ejemplo: un contrato malicioso que en su `receive()` llame a `postBounty` o `submitChallenge` — ¿puede eso corromper estado?

2. **Front-running en `submitChallenge`:** Un challenger puede ver la evidencia de otro en el mempool y copiarla (`evidenceHash` idéntico) para reclamar el premio primero. ¿Vale la pena un esquema commit-reveal? Trade-off: duplica transacciones y gas, pero elimina el riesgo.

3. **Resolver centralizado + owner backstop:** `resolveBounty` requiere `onlyResolver` que es `resolver || owner`. Es aceptable para hackathon, pero ¿cuál es el riesgo práctico si owner == resolver (mismo key)? ¿Deberíamos forzar `resolver != owner` en el constructor?

4. **Gas griefing en `resolveBounty`:** El loop de búsqueda recorre hasta `maxChallenges=50` entradas. Worst case ~100k gas. ¿Es suficiente? ¿O conviene indexar por `mapping(uint256 => mapping(address => bool)) challengerExists` para O(1)?

5. **Edge case de window overflow:** `uint256 effectiveExpiry = uint256(b.createdAt) + uint256(b.claimWindowSecs) + uint256(challengeGracePeriod)`. Con los tipos actuales (`uint64 + uint32 + uint32`) cast a `uint256`, ¿hay algún escenario donde overflow?

6. **`uint96` para reward:** Parece suficiente (~79B OKB), pero ¿hay razones para usar `uint128` o `uint256`? ¿Algún protocol pattern común lo exige?

7. **Pausable scope:** ¿Es razonable que `postBounty`, `submitChallenge`, `resolveBounty` estén pausados pero `withdrawBounty` y `withdraw` NO? ¿O el patrón estándar es "pause bloquea todo salvo withdraws directos"?

## Constraints
- Deploy target: X Layer (EVM-compatible, Solidity 0.8.19 confirmado)
- No OpenZeppelin — queremos el contrato auto-contenido para facilitar audit manual
- Solidity 0.8.19 ya tiene checked arithmetic, asumimos no overflow por default
- Patrón de referencia: BobbyConvictionOracle v2 (ya auditado por Gemini)
- 27/27 foundry tests passing actualmente

## Lo que espero de ti (Codex)
Necesito:
- **Decisiones concretas con justificación**, no respuestas genéricas
- **Prioridad P0/P1/P2** para cualquier hallazgo nuevo
- Si ves un bug real de seguridad, dilo directamente con el código exacto que falla y el fix
- Si alguna de las 7 preguntas tiene trampa oculta (ej: yo creo que está OK pero no lo está), dilo
- Ignora nits de estilo; enfoca en seguridad, economía de fondos, y edge cases
