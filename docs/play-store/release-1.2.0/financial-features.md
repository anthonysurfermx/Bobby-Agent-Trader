# Financial features — Bobby Android 1.2.0 (10)

Requested declaration: **“My app doesn’t provide any financial features.”** Code supports absence of the listed regulated services. Bobby provides educational asset/market explanations, charts and the person's own written theses. This is not a prediction/return promise, personal recommendation or portfolio execution service.

| Listed feature family | Android finding |
|---|---|
| Banking, loans, credit, payday lending | None. No balance/income/credit collection or lending endpoint. |
| Payments, wallet, transfer | None. No wallet SDK, custody, send/receive funds, exchange checkout or swap route. Android external actions are OAuth, public privacy/support, explicit shares and (when configured) Google subscription management. |
| Crypto/NFT/stock trading or portfolio management | None executable. Asset lookup/candles/debate/thesis review contain market information. No holdings amounts, broker links, trade tickets, signatures or wallet actions. Naming an asset is not an executed transaction. |
| Rewards/incentives of financial value | None. Reads/XP/companions/islands are non-redeemable service/game progression; invitations can grant service reads, not money or tokens. |
| Financial advisory services | Not offered as a regulated or personalized service. Risk acceptance precedes processing; claims are educational, evidence/time-qualified, with no guaranteed result. Do not market this app as individualized investment guidance. |
| Insurance / other regulated financial service | None found in Android sources. |

Evidence: `android/app/src/main/java/xyz/bobbyprotocol/android/data/BobbyRepository.kt` endpoint inventory; `nucleo/NucleoSession.kt:423` gated read; `MainActivity.kt` external-route allowlist; `billing/BillingPolicy.kt` Google-only management; `ui/TraderLandSheet.kt` island mutations only. Server/web trading surfaces elsewhere in the repository do not become Android capabilities unless Android routes to them; no such route was found in the shipping page/native controls.

Owner must answer the actual current Console questionnaire. If Google categorizes educational market analysis under **Other**, explain exactly these functions and follow its requested classification; do not add a trading/advisory declaration merely to hide a review issue, and do not treat this worksheet as approval. General Android word searches are not proof of what production AI will generate; day-one testers must report unsafe/promissory outputs.

[Google financial services policy](https://support.google.com/googleplay/android-developer/answer/9876821) and [Financial features declaration](https://support.google.com/googleplay/android-developer/answer/13849271).
