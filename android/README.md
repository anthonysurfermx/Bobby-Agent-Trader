# Bobby on Android — Trusted Web Activity

Android ships the web app, not a port. A Trusted Web Activity is a full-screen Chrome
instance with no browser UI, wrapped in an Android package. It runs `bobbyprotocol.xyz`
in the user's own Chrome, which means the Android app is never behind the web: the desk,
the debate, the record, Trader Land, Google sign-in, EN/ES and Base swaps are whatever
production is serving that minute.

The decision and its trade-offs are written up in
[`docs/play-store/2026-09-17-play-readiness.md`](../docs/play-store/2026-09-17-play-readiness.md).

## What is already in the repo

| Piece | Where | State |
|---|---|---|
| Web app manifest + service worker | `vite.config.ts`, `src/sw.ts` | in this branch, needs to be deployed |
| Digital Asset Links | `public/.well-known/assetlinks.json` | **fingerprint is a placeholder** |
| Bubblewrap config | `android/twa-manifest.json` | ready |
| Store assets | `docs/play-store/final/` | ready |
| Listing copy | `docs/play-store/listing-en.md`, `listing-es.md` | ready |

## Package name

`xyz.bobbyprotocol.app` — deliberately not `…twa`. A package name can never be changed
once published, and if Android ever moves to a native build we want it to ship as an
update to the same listing rather than a second app with the reviews starting at zero.

## Build order (the order matters)

1. **Merge and deploy this branch.** The TWA reads `https://bobbyprotocol.xyz/manifest.webmanifest`
   at build time. Until the PWA layer is in production there is nothing to wrap.
   Confirm with `curl -sI https://bobbyprotocol.xyz/manifest.webmanifest` (expect 200 and
   `application/manifest+json`) and `curl -s https://bobbyprotocol.xyz/.well-known/assetlinks.json`
   (expect the JSON below, not `<!doctype html>` — Vercel's SPA rewrite runs after the
   filesystem check, so a real file wins, but verify rather than assume).

2. **Install the toolchain.** This machine has neither, as of 2026-09-17:
   ```bash
   brew install --cask temurin@17
   npm i -g @bubblewrap/cli
   ```
   `bubblewrap` offers to download the Android SDK itself on first run (~500 MB).

3. **Generate the project and the upload key.**
   ```bash
   cd android && bubblewrap init --manifest https://bobbyprotocol.xyz/manifest.webmanifest
   ```
   Answer the prompts to match `twa-manifest.json` (or drop that file in place and run
   `bubblewrap update`). Bubblewrap creates `android.keystore` — **that file and its
   passwords are the upload key. Back them up outside the repo; they are gitignored.**
   Losing the upload key is recoverable through Play support; losing it without Play App
   Signing enrolled is not.

4. **Build the bundle.**
   ```bash
   bubblewrap build
   ```
   Produces `app-release-bundle.aab` (upload this) and `app-release-signed.apk`
   (for sideloading onto a real phone to test).

5. **Create the app in Play Console and upload the AAB.** Play App Signing is on by
   default; Google re-signs the app with its own key.

6. **Take the fingerprint back from Play.** Play Console → *Test and release* → *Setup* →
   *App signing* → copy the **SHA-256 certificate fingerprint of the app signing key**
   (not the upload key). Put it in `public/.well-known/assetlinks.json`, replacing
   `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`, and deploy. Verify with:
   ```bash
   curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://bobbyprotocol.xyz&relation=delegate_permission/common.handle_all_urls"
   ```

   If this step is skipped or the fingerprint is wrong, the app still runs — but Chrome
   shows a URL bar across the top and it looks like a browser, which is both ugly and the
   shape of app Play rejects as a webview wrapper.

## Things to test on a real device before submitting

Chrome Custom Tabs, not a WebView, so the web's own permission prompts apply and Chrome
already holds the Android permissions. That is the theory; none of it is verified for
this app yet:

- **Microphone.** The desk's dictation and Bobby Live both need `getUserMedia`. Confirm
  the prompt appears inside the TWA and that audio actually reaches the model. If it does
  not, this is the one feature that would force a native shell.
- **Wallet handoff.** A swap opens the wallet app and must come back to Bobby, not to a
  browser tab. Test with the wallet the audience actually uses.
- **Google sign-in.** OAuth redirects leave the TWA's scope and return; confirm the
  session lands on `/desk` and not in a stranded Custom Tab.
- **Back button** at the start URL should exit the app, not leave a blank screen.
- **No URL bar anywhere.** If one appears, Digital Asset Links did not verify.

## Getting it onto your own phone

Three ways, cheapest first.

### 1. Install the web app (works the moment this branch is in production)

On the Android phone, open `https://bobbyprotocol.xyz/desk` in Chrome → ⋮ → **Install app**
(older Chrome says *Add to Home screen*). With the manifest live it installs standalone:
own icon, own task in the recents switcher, no URL bar, starts on `/desk`. That is the
same Chrome rendering the same web app the TWA will wrap — what you see there is what the
Play build looks like, minus the Play plumbing.

If Chrome offers a plain bookmark instead of *Install app*, the manifest is not live yet.

### 2. Sideload the signed APK (after `bubblewrap build`)

`bubblewrap build` writes `app-release-signed.apk` next to the bundle. Copy it to the
phone, allow the file manager to install unknown apps, tap it.

One catch: Digital Asset Links must list the key that signed *that* APK, which for a local
build is your own upload key, not Play's. Print its fingerprint with

```bash
keytool -list -v -keystore android/android.keystore -alias android | grep SHA256
```

and add it to `public/.well-known/assetlinks.json` as a second entry in
`sha256_cert_fingerprints` — the field is an array and Google accepts several, so the test
build and the Play build can both verify from the same file. Without it the app runs with
a URL bar across the top.

### 3. Internal testing on Play (the real thing)

Once the AAB is uploaded, Play Console → *Testing* → *Internal testing* takes up to 100
testers and goes live in minutes, not days, with no review queue. The testers install from
the Play Store itself, so this is the only one of the three that exercises the actual
delivery path: Play App Signing, the store listing, the install flow and the update flow.

Internal testing is also not the same thing as the closed test that a personal developer
account has to run for 14 days before it can apply for production — that one is a separate
track with its own 12-tester requirement.
