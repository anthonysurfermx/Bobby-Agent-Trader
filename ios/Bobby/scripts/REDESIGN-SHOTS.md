# Redesign simulator evidence

Run from any directory. The script requires Xcode, an installed iOS simulator runtime, Python 3 and the existing package cache. Generate the project with `cd ios/Bobby && xcodegen generate` after adding/removing test files.

```sh
# Every current scene, Spanish, both phones, default text size; delete only newly created phones.
ios/Bobby/scripts/redesign-shots.sh --language es --device all --text-size default \
  --output ../_harness/redesign-2026-10-10/staging-i0 --cleanup

# A named state, German, small phone, one text-size step up.
ios/Bobby/scripts/redesign-shots.sh --language de --device se --text-size +1 \
  --tests RedesignShots/test05MemoryConsent,RedesignShots/test04EducationalAnswer \
  --output ../_harness/redesign-2026-10-10/review-plus1 --cleanup
```

Languages: en/es/fr/pt/it/de. `--test`/`--tests` accepts a class or Class/method; repeat the argument or comma-separate selectors. RedesignShots reads the injected language and labels generated from shipping copy (`node ios/Bobby/scripts/redesign-labels.mjs`; CI checks freshness). Other UI tests may hard-code a language: choose a matching method when using those. Every existing testLive method is excluded, even if its class is selected.

Both `Bobby-Redesign-SE3` and `Bobby-Redesign-17Pro` are created when missing. Only one is booted at a time. The runner refuses to disturb another booted phone and uses the shared harness simulator lock. `--cleanup` deletes only phones it created in this invocation; a reused phone remains shut down. DerivedData and SourcePackages reuse the paths from the brief, overridable by flags. Signing remains enabled. No archive or Apple upload occurs.

Each device writes `<device>-<lang>` (or `-plus1`) under the requested output root, with numbered PNGs, manifest.json, test.log and index.md. build.log is shared at the root. Existing PNG output is refused to avoid mixing evidence. Export completes before result bundles are removed; simulator cleanup runs on errors too. A failing UI assertion makes the command fail even if attachments export.

The UI driver waits for visible Apple Intelligence notification text before attaching a screenshot and dismisses the fresh keyboard introduction. The index begins with **Visual review: pending**. Look at each full capture, record any inherited clipping/misleading wording, then replace that line with the review time and outcome before moving the run into its saved baseline folder. These are build-69 reference states, not assertions that every existing layout already meets the redesign's future stage-to-points guarantees.

| Attachment | Offline fixture / entry |
| --- | --- |
| 01-daily-idle | companion-plain, app |
| 02-typing | companion-plain, app + typed question |
| 03-waiting-general-question | companion-waiting; explanation response delayed 35s, within the existing timeout |
| 04-educational-answer | companion-plain |
| 05-memory-consent | companion, first explanation |
| 06-question-from-bobby | companion, accept memory |
| 07-answer-with-notes | companion + DEBUG fixture-only -qa-redesign-notes |
| 08-companion-failure-retry | companion-error |
| 09-notes-screen | companion + -qa-redesign-notes; Profile → Memory → educational notes |
| 10-ambiguous-asset-confirmation | companion, type Ethereun; fixture resolves fuzzy ETH |
| 11-first-run-ready | default, reset onboarding, no accepted risk notice |
| 12-first-run-consent-beat | same ready screen, tap BTC; capture before hold-to-agree |

The notes seed exists only behind DEBUG and the offline-fixtures check. It cannot seed a live or Release app. Existing fixture scenarios are unchanged. Every HTTP(S) request is intercepted by NucleoFixtureProtocol; no paid model or real market server is used by RedesignShots.
