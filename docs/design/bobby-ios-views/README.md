# bObby iOS views — first visual pass

These are 390 × 844 captures of the bundled iOS engines at fixed development-harness moments. They use local fixtures; values and spoken analysis are not live. They are for reviewing the in-app views, not App Store artwork.

Reference: [Open on Recent](https://recent.design/i/b2uk51z-open). The pass borrows the quiet black canvas, generous spacing, and clear type hierarchy. The Deep core sphere, external companion avatar, reading flow, and approved interactions remain the product's own.

| File | In-app moment |
| --- | --- |
| `01-birth-es.png` | First appearance of bObby |
| `02-companion-picker-es.png` | Companion selection |
| `03-home-es.png` | Daily home |
| `04-debate-en.png` | Three-agent debate |
| `05-verdict-en.png` | Wait verdict and chart |
| `06-thesis-en.png` | Thesis before saving |
| `07-squad-en.png` | Squad face |

Source of truth: `ios/Bobby/Nucleo/src/app/`, `ios/Bobby/Nucleo/src/onboarding/`, and native views under `ios/Bobby/Sources/`. Rebuild bundled pages with `python3 ios/Bobby/Nucleo/build.py --release` before any future archive.
