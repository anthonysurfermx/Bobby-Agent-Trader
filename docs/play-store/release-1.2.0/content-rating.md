# Content rating — submission worksheet

Product: Bobby, market education using generative AI. Intended audience: **18 and over**, no child-directed marketing. The owner must complete the live IARC questionnaire honestly; an intended adult audience does not itself assign an IARC rating.

| Topic | Code-backed answer |
|---|---|
| Gambling / simulated gambling | No betting, wagers, casino games or real-money prizes. Market charts and educational AI reads are not executable trades. XP and island equipment are non-cash app progression, not redeemable tokens. |
| Financial transactions | No Android wallet connection, brokerage account, order, swap, custody or transfer. No Google purchase in this release configuration. |
| User-generated content | **Yes:** authenticated users can name/layout/publish an island and visit public islands. This is not a chat or direct-message system. Do not answer No merely because AI is the main feature. |
| UGC controls | Rules must be accepted before publishing; report reasons/details, creator blocking and unblock controls. Reports go to Bobby's queue; blocking is local to the device. `android/app/src/main/java/xyz/bobbyprotocol/android/ui/TraderLandSheet.kt:208`, `:553`, `:572`, `:589`. |
| Generative content | Yes: questions and thesis reviews receive AI text. Report entry points on finished read cards, thesis review, briefings and Profile open the in-app report form, in six languages. No silent question/account attachment. |
| Violence, sexual content, hate, drugs, profanity | No curated app assets depicting these. Open-ended user/AI content can produce prohibited material; declare the interactive/user-content capability and its controls. The owner must verify server safety filters/moderation operations. Do not promise impossible content absence. |
| Location sharing | No GPS permission or person-to-person live location. Interface locale/country and network-derived metadata are separately covered by Data safety. |
| Advertising | None. See [ads.md](ads.md). |

Risk and memory legal paragraphs/notice ids remain unchanged. First read requires risk acceptance; app text does not infer wealth, emotions or a psychological profile. See [financial-features.md](financial-features.md).

Submit the IARC-generated ratings rather than inventing country-specific age ratings in this dossier. [Google content ratings](https://support.google.com/googleplay/android-developer/answer/9859655) and [generative AI policy](https://support.google.com/googleplay/android-developer/answer/13985936).
