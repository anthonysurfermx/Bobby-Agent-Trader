# Generated QA artifact cleanup

The user requested removal of generated tests after QA to avoid further disk pressure. Cleanup completed and was checked at 2026-10-04T13:43:01.370298+00:00.

- Removed all 194 selected temporary targets, including raw xcresults, private review/build copies and the two specified DerivedData caches.
- Deleted the stopped Bobby 1.7 QA and Bobby Subscription QA simulators by their exact UDIDs. Both device directories are now absent. The unrelated iPhone 17 Pro simulator and shared iOS runtime were retained.
- Kept source tests, the small committed evidence package, original App Store artwork, developer SDK/toolchains, unique Swift proposals and the entire signed archive63-r2 directory. The retained archive executable hash still matches its original verification.
- Verified all 309 existing curated evidence hashes before and after deletion. Summaries, individual case inventories, source hashes and selected images remain; full binary xcresults can no longer be reopened locally. Earlier documentation saying raw bundles were retained describes the state before this cleanup.

The original plan estimated 7.395 GiB allocated to the removed artifacts/devices. Available space measured 5.100 GiB before deletion and 11.901 GiB at the final filesystem check. APFS deletion and concurrent activity make allocation totals and net free-space change different measurements.

The first pass stopped at a read-only frozen review copy. Its generated directories were made owner-writable solely for deletion; the retry passed. No original source permissions or external symlink targets were changed.

See [cleanup receipt](storage-cleanup.json). Physical iPhone acceptance and App Review submission remain pending; this cleanup does not close either gate.
