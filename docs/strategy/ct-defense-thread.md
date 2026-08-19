# CT defense thread — ready to fire on announcement day

Drafted by Kimi K3 red-team (2026-08-19). Replace [calls page] → bobbyprotocol.xyz/protocol/calls,
[contract] → Basescan address, [audits] → audits page, before posting. Tone: dry, technical,
zero defensiveness. Publish only the tweets whose attack actually appears.
1. **Attack:** "The recorder picks the most favorable Pyth tick."  
   **Response:** It cannot. The anchor is derived from an on-chain announce at `announcedAt + 10s`. At announce time the tick does not exist. The proof must be the first Hermes tick at/after that anchor. [calls page] [audits]

2. **Attack:** "ATTESTED symbols are just self-reported numbers."  
   **Response:** Correct. ATTESTED is self-reported and not oracle-verified. It lives in a separate ledger and is never mixed into VERIFIED stats. [calls page]

3. **Attack:** "Win rate with n=5 means nothing."  
   **Response:** True. We publish `n` with every scorecard. A small sample is a noisy early signal, not proof of edge. Read the coverage numbers, not just the rate. [calls page]

4. **Attack:** "Where is the real PnL?"  
   **Response:** Bobby trades simulated/paper capital. The protocol verifies directional accuracy of calls, not executed P&L. That is the explicit claim. [calls page]

5. **Attack:** "If the recorder key is stolen, the record is ruined."  
   **Response:** A stolen key can issue new commits. It cannot rewrite past commits. We monitor, rotate, and the Safe can pause. Past records remain immutable. [contract]

6. **Attack:** "Pyth goes down and your 'verified' calls stop."  
   **Response:** VERIFIED halts until Hermes/Pyth returns. ATTESTED remains available. Mainnet contract has a pre-approved fallback Pyth address for recovery. [contract]

7. **Attack:** "This is just testnet theater."  
   **Response:** This is Base mainnet. Sepolia canary ran first. Every VERIFIED call links to a real Base transaction and a real Pyth proof. [calls page] [contract]

8. **Attack:** "No one can actually verify this."  
   **Response:** Every call has a tx hash, a signed Pyth proof, and a one-click challenge button. Challenges are permissionless for 7 days. [calls page]

9. **Attack:** "The Safe can change the rules whenever it wants."  
   **Response:** The 2-of-3 Safe owns the contracts and can pause or update parameters. It cannot rewrite on-chain history. Owner addresses and policy are public. [contract]

10. **Attack:** "Bobby is acting as an oracle."  
    **Response:** No. Bobby is an analyzer. VERIFIED is a price-verification layer for self-reported calls, not a price feed for other protocols. [calls page]

11. **Attack:** "100 bps tolerance is too loose."  
    **Response:** It is a starting on-chain parameter, visible and auditable. The challenge window exists precisely to dispute resolves that abuse the tolerance. [audits]

12. **Attack:** "Why should anyone trust Bobby?"  
    **Response:** You shouldn't trust. Verify. Signed Pyth proofs, permissionless challenges, published audits, immutable on-chain source, and published Safe ownership. [audits] [calls page]
