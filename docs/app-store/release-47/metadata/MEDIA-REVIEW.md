# Approved editorial ZIP — submission review

Reviewed on 30 September 2026. The originals are preserved. No screenshot or metadata was uploaded or saved in App Store Connect in this pass; native browser control reported a locked Mac and manual unlock was requested.

## Verified package

- Package: `../nucleo-editorial-v2/Bobby-App-Store-three-languages.zip`.
- Twenty-one localized PNGs, seven each in English, Spanish and European Portuguese. All are 1320 × 2868, RGB8 and opaque. Each extracted screenshot matches its ZIP entry; hashes are in `media-manifest.json`.
- The dimensions are listed for the 6.9-inch iPhone slot in [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
- No visible NVIDIA/NVDA or OpenAI/ChatGPT references were found. Functional examples show Bitcoin/BTC. OKX is shown as a data source inside the product UI.
- Photographic subjects are illustrative models, according to the package's provenance; they are not customer testimonials.

## Review risks requiring a media decision

| Exported position | Content | Implication |
| --- | --- | --- |
| 01 | Bobby wordmark/orb identity | Primarily title art; replace or combine with current app use for the screenshot slot. |
| 02, 04, 06 | Full photographic portraits and headlines | No app use is shown. Retain the approved photography as artwork, but incorporate a real current product capture if used as App Store screenshots. |
| 03 | Three-agent debate | Shows product use; re-check against the submitted build and localized capture. |
| 05 | Evidence/chart | Shows product use; re-check against the submitted build and localized capture. |
| 07 | Wait verdict | Shows product use; re-check against the submitted build and localized capture. |

[Apple 2.3.3](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata) asks screenshots to show the app in use and permits text/image overlays. The portrait-only and identity compositions therefore present an avoidable review risk. This is an assessment, not a prediction of an Apple decision.

The package README and COPY.json identify the internal product captures as **build 40, English**. The ES/PT exports translate the editorial headlines, not the interface shown inside them. They are not verified captures of the final build 45. The current app interface supports English and Spanish; the Portuguese description explicitly states those interface languages. Do not mark Portuguese as an app-interface language merely because its store listing is localized.

Examples include a historical Bitcoin price/timestamp; they do not establish a current quote or a financial return. The copy does not claim guaranteed investment outcomes. The final Wait headline could be softened to “Pause. Review. Decide.” in a future media revision; no editorial artwork was changed during this pass.

## Mapping caution

`COPY.json` retains original composition IDs. `index.html` exports them in the order `01, 02, 03, 06, 04, 07, 05`. Use the actual exported filenames when assigning screenshots; COPY entry 04 is not the headline on exported screenshot 04.

## Remaining remote work

The new promotional text and full localized metadata are available beside this report. Saving those drafts will not itself resolve China availability, required Apple account-revocation configuration or the other release gates in the [remediation report](../../audits/app-review-remediation-2026-09-30/README.md). No upload or App Review submission is recorded here.
