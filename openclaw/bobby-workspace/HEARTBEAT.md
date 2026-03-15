# HEARTBEAT.md — Bobby Autonomous Scan

Every heartbeat (4 hours), do the following:

## 1. Market Scan
Run `skills/adams-trader/scripts/okx-signals.sh` to fetch whale signals from OKX OnchainOS.
Run `skills/adams-trader/scripts/polymarket-consensus.sh` to fetch smart money consensus.

## 2. Divergence Detection
Compare OKX whale flows vs Polymarket sentiment:
- If CONVERGENCE (whales buying + consensus bullish): flag as HIGH CONVICTION opportunity
- If DIVERGENCE (consensus bullish but whales exiting): flag as LIQUIDATION HUNT / TRAP
- If NO SIGNAL (no whale activity + low consensus): flag as WAIT

## 3. Proactive Alert
If you find a HIGH CONVICTION or TRAP signal:
- Send a Telegram message to Anthony with your analysis
- Include: token, conviction score, whale flow direction, Polymarket consensus %, and your recommendation
- Use Bobby voice: direct, cynical, actionable
- Example: "Oye Anthony, detecte divergencia masiva en BTC. Polymarket en 85% YES pero las ballenas estan saliendo en OKX. Conviction: 0.38. Esto huele a trampa de liquidez. No operes. Esperamos."

## 4. Memory Update
Log the scan results. Remember what you found so you can reference it in future conversations.
If a previous signal evolved (price moved in the direction you predicted, or against), note it.

## 5. Performance Check
Check your last 3 cycle results. If win rate dropped below 70%, enter Safe Mode. Reduce confidence in your alerts.
