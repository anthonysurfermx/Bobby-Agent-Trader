# Final generated bundle audit

The current generated iOS Release and public web Núcleo resources reproduce **byte for byte across 42 files**: four HTML pages, two iOS metadata files and 36 web voice clips. The private rebuild uses the actual repository builders with output paths redirected in memory. Their timestamp input is seeded from the delivered `builtAt` metadata so nondeterministic clock fields can also be compared exactly. No source, delivered resource or build configuration was modified by this audit. The 4,846,903 bytes of private fresh outputs were removed.

All four pages exclude fixture payloads, the dev mock script and the contract page. The delivered iOS directory declares `release: true` and contains no fixtures directory or `contract.html`. The actual candle timeframe, mismatched-overlay guard and final-candle timestamp mapping are present in the generated pages; web transport declares its hourly constant and response metadata.

The shipping chart SVG, read model and renderer were extracted directly from the final iOS `app.html` and web `index.html`, then measured in headless Chrome with every network request blocked. **126/126 assertions passed across 30 scenarios**, covering above/below support captions in all six languages and long-to-short, empty and no-bracket transitions. Long text wraps through measured SVG `<tspan>` lines. Font evidence is `system-ui`; Geist and physical iPhone/WebKit remain unverified.

Evidence: `final-bundle-manifest.json` (all resource hashes and exact comparisons), `final-bundle-summary.json` (small summary and HTML hashes), `final-bundle-audit.log`, `final-bundle-subtitle-results.json`, and `final-bundle-subtitle.log`. The separate physical inventory is `iphone-live-chart-support-gates.md`.

This audit covers generated workspace deliverables. Root owns native integration, archive resource identity, TestFlight processing/installation and physical live acceptance. No live backend requests, CUA interaction, archive/upload, phone install, source edits or commits were performed by this audit agent.
