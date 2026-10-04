# App Store 1.7 (63) — localized copy and artwork selection

Prepared 2026-10-04. This is a local release package; App Store save/upload/submission is owned by the root release task. No app code, approved image bytes, simulators, purchases or accounts were changed by this preparation.

## Copy ready to apply

[metadata-1.7-63.json](/private/tmp/bobby-ios17-remediation-20261004/store-localizations/metadata-1.7-63.json) contains EN-US, ES-MX, PT-PT, DE-DE, FR-FR and IT: approved names/subtitles, corrected full descriptions, new promotions, version1.7 release notes, keywords and localized support/privacy URLs. The four-language subset is [metadata-1.7-63-four-new-locales.json](/private/tmp/bobby-ios17-remediation-20261004/store-localizations/metadata-1.7-63-four-new-locales.json). Matching TXT fields are in each locale directory. [review-notes-en.txt](/private/tmp/bobby-ios17-remediation-20261004/store-localizations/review-notes-en.txt) is 2384 characters.

| Locale | Promotion characters | Description characters | New copy prepared |
| --- | ---: | ---: | --- |
| en-US |155|2865|Yes|
| es-MX |156|3102|Yes|
| de-DE |151|3281|Yes|
| fr-FR |155|3324|Yes|
| it |145|3183|Yes|
| pt-PT |141|3171|Yes|

All fields passed [metadata-validation.json](/private/tmp/bobby-ios17-remediation-20261004/store-localizations/metadata-validation.json): names/subtitles≤ 30 UTF-16 units, promotions≤ 170, descriptions/release notes≤ 4000. Keywords also meet a conservative 100 UTF-8 byte limit. No fixed price, performance promise, executed trade, real customer testimonial or physical recognition guarantee was added.

The original translated descriptions came from the approved build 57 package. Its obsolete on-device-only/no-upload assertion was replaced in all six locales: Apple speech recognition prefers an on-device model; the Apple speech service is used only with separate consent when no model is available. Analysis AI permission is distinct. The optional weekly briefing is limited to eligible active paid Pro accounts and separate permissions; no delivery is promised to guests, gifts or trials. Pro usage remains unlimited Quick fair use,60 Deep and 10 Max per 30 days.

Source checks: native `Sources/Nucleo/NucleoSpeech.swift:87-92,217-261,285-295` enforces separate Apple fallback consent; `api/_lib/desk-levels.ts:23-27` declares monthly premium allowances; `api/_lib/briefings/http.ts:212-215` requires paid active Pro eligibility. The report describes implementation facts; purchase lifecycle, speech hardware and report delivery require their own acceptance evidence.

All 12 public support/privacy URLs returned HTTP 200 HTML on2026-10-04. The receipt is [url-checks.json](/private/tmp/bobby-ios17-remediation-20261004/store-localizations/url-checks.json). This is URL reachability, not rendered localization, form delivery or legal adequacy. The first sandbox-only request failed DNS; the authorized public read outside that network sandbox succeeded. No support form was submitted.

## Artwork found and selected

The complete six-language artwork pack is local at:

`/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/Codex/2026-10-02/pa/outputs/build-57/app-store/artwork/{en,es,pt,de,fr,it}/01.png …07.png`

There are 42 PNG files, seven per language. All 42 are 1320 × 2868 RGB with no alpha, and every fresh SHA-256 matches both the package manifest and the corresponding approved build 56 source. Total original artwork is 101,693,052 bytes. Nothing was copied or altered for this audit.

The format and dimensions match Apple's 6.9-inch screenshot slot, which accepts 1–10 PNG/JPG/JPEG screenshots without alpha. [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)

**Select five existing pieces per locale in this order:01, 02, 03, 04, 06. Exclude 05 and 07 for this upload unless their product captures are refreshed.** The 30 selected files retain the approved alternating brand/human/debate/human/human content and original bytes; omitting chart panels leaves two adjacent human panels in the final sequence. If preserving strict alternation is essential, use the first four01/02/03/04and omit06as well. Apple accepts both counts. No order or layout inside an image was edited.

[final-artwork-manifest.json](/private/tmp/bobby-ios17-remediation-20261004/store-localizations/final-artwork-manifest.json) records all 42 absolute originals, hashes, dimensions, availability, provenance and selection/exclusion reasons. Safe space-free upload paths are symlinks under `/private/tmp/bobby-ios17-remediation-20261004/store-localizations/final-artwork/{en-US,es-MX,pt-PT,de-DE,fr-FR,it}/`; they do not duplicate the81,252,499 bytes represented by the selected 30 images.

| Position | Visible content | All six locales present | Selected |
| --- | --- | --- | --- |
|01|Bobby orb, wordmark and think-before-trading slogan|Yes|Yes|
|02|Approved male portrait and question headline|Yes|Yes|
|03|Alpha Hunter/Red Team/CIO debate interface|Yes|Yes|
|04|Approved female portrait and save/reflect/grow headline|Yes|Yes|
|05|Evidence satellites and support/resistance chart|Yes|Excluded for stale provider footer|
|06|Approved male portrait and everyday-companion headline|Yes|Yes|
|07|Wait verdict and support/resistance chart|Yes|Excluded for stale provider footer|

The six full-set contact boards were visually reviewed. DE 05/07 and FR 05/07 were also viewed at full 1320 × 2868 resolution: support subtitles are complete; German `über Unterstützung` fits, French 05 wraps `au-dessus / du support`, and French 07 keeps the complete label on one line. All chart panels show 1H or its localized equivalent and a generic Bitcoin timing question. No 4H/1D/1W mislabel or clipped support text was found in these artwork files.

**The remaining discrepancy is specific:** all 12 historical chart panels visibly include `OKX`, while current build 63 `ios/Bobby/Nucleo/src/app/55-read.js:276-278` removes OKX/OKB/XLayer provider names from the chart footer. Those panels therefore differ from the current UI and are excluded. The current renderer still plots a white price line using real closes, so the historic line shape alone is not the reason for exclusion.

## Provenance and missing current assets

These are approved historical illustrative artwork, not newly captured build 63 screenshots. Build 57 copied approved build 56 bytes. Its manifest retains the earlier build 55 imagegen translations and resampling history for DE/FR/IT. The original EN/ES/PT editorial pack uses build 40 UI captures; ES/PT headlines are translated but the internal app UI remains English. DE/FR/IT internal UI text was localized historically with imagegen. Generated human portraits are illustrative models, not customer testimonials.

The original editorial README explicitly calls the captures visual drafts and recommends replacing internal screens with localized release captures before submission. The selected historical non-chart frames show currently supported product concepts, but this selection does not establish current-build pixel accuracy. Preserve that provenance in the release review. No fresh build 63 localized chart panels were found in the targeted asset roots. Fresh full-localization hardware/UI acceptance is a separate native QA task.

[assets-inventory.json](/private/tmp/bobby-ios17-remediation-20261004/store-localizations/assets-inventory.json) inventories 456 PNG/JPG files across the moved Documents output packs, moved primary `docs/app-store` and canonical candidate `docs/app-store`. All 456 had allocated local content; zero iCloud placeholders were found in these targeted roots. The iCloud Documents alias points to `/Users/mrrobot/Documents`; no placeholder content was read and no bulk hydration was requested. This is a targeted project inventory, not a claim that all iCloud/Downloads directories were searched.

## Existing generator for future refreshed chart captures

The approved editable composition is:

`/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/GitHub/Bobby-Agent-Trader/docs/app-store/nucleo-editorial-v2/index.html`

Its `render.py` uses installed Chrome to render 1320 × 2868. `--lang` supports `en`, `es`, `pt` and `all` only. For output positions 05 and 07, the underlying image inputs are `assets/ui/03-evidence-satellites-chart.png` and `assets/ui/04-verdict-wait.png`. The source index maps original slide IDs into final editorial positions via `order=['01','02','03','06','04','07','05']`; do not substitute the wrong file based on original IDs.

After root finishes native QA, capture actual build 63 evidence and Wait screens in the desired language, with known fixture/live provenance and without consent overlays. In an isolated copy of the editorial assets, replace only those two product capture inputs, preserving framing, photos, typography and headline copy. Render only positions 05 and 07for EN/ES/PT with `python3 render.py --lang en --only05` and `--only07` (use spaces: `--only 05`, `--only 07`). Repeat for the other supported renderer languages. DE/FR/IT need true localized source captures plus the same editorial composition; the historical generator records are imagegen text edits, not an existing deterministic six-language screenshot pipeline. Do not claim a current automatic six-language renderer exists.

No generator, browser, image editing, Xcode or simulator run was executed for this package preparation.

## Exact sources

- Build57listing/artwork package, `metadata.json`, `image-manifest.json`, `artwork-report.md`, `README.md`: `/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/Codex/2026-10-02/pa/outputs/build-57/app-store/`.
- Approved byte-identical sources: same `outputs/build-56/app-store/artwork/` relative files.
- Original generation/localization history: same `outputs/build-55/app-store/artwork-generation-prompts.json` and image manifest.
- Editable composition/provenance: `/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/GitHub/Bobby-Agent-Trader/docs/app-store/nucleo-editorial-v2/{README.md,index.html,render.py,COPY.json}`.
- Canonical native candidate: `/Users/mrrobot/.codex/worktrees/bobby-android-parity-ios17/Bobby-Agent-Trader`, documented HEAD be3e8b1389294e7d477a77b87e107f044ea3f55e, product code a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2.

Repeat local generation of text and verification with `prepare-metadata.py` and `validate-assets.py`; the latter hashes existing local files and creates symlinks, without editing originals. Audit contact boards are separate derived review previews and must not be uploaded as App Store screenshots.
