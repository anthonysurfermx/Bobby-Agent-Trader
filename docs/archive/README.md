# Legacy protocol archives

This directory stores content-addressed, read-only snapshots of protocol state
that must remain independently auditable after a chain cutover.

## X Layer TrackRecord baseline

`xlayer-track-record-68036174.json` captures BobbyTrackRecord on X Layer
(chain 196) at block `68,036,174`, block hash
`0x54036591917c04495a7e4aa1f774de713a88007fd85beacb4f254ca3391c67a6`.
It contains every indexed commitment and trade available through contract
storage at that block: 2,038 commitments, 1 trade, 1 win, 0 losses and 2,037
pending commitments.

Verify it with:

```bash
cd docs/archive
shasum -a 256 -c xlayer-track-record-68036174.json.sha256
```

The exporter can also replay the same pinned block and compare the live
canonical state with this legacy v1 archive without writing anything:

```bash
npm run export:xlayer-track-record -- \
  --verify=docs/archive/xlayer-track-record-68036174.json
```

This is a pre-cutover baseline, not the final cutover snapshot. Run
the exporter again only after every X Layer writer is quiet—not merely after
the backend freeze flag is set. The final capture uses a confirmed block by
default; choose and record the release confirmation policy explicitly:

```bash
npm run export:xlayer-track-record -- \
  --confirmations=64 \
  --include-events \
  --write
```

Use `--finalized` instead of `--confirmations` only when the selected RPC
supports the finalized block tag. The exporter prefers EIP-1898 canonical
block-hash reads and safely falls back to a pinned block number plus a final
canonical hash recheck. It refuses to overwrite either member of an archive
pair and publishes the JSON and digest through fsynced temporary files and
atomic renames.

Archive v2 has no wall-clock generation field, so the same block, flags and
canonical state produce the same bytes and digest. It never serializes the RPC
endpoint. Before `--write`, URLs containing basic auth, query parameters,
fragments or non-root paths are rejected because those locations commonly
contain provider credentials. Use a credential-stripping local proxy when an
archive provider requires a key.

Event logs are not embedded in this baseline because the public archival RPC
used for the export caps `eth_getLogs` ranges at 100 blocks. The complete state
arrays, aggregate counters, contract code hash and pinned block hash are
included, but this baseline therefore has **state provenance only**, not event
provenance.

For the final archive, prefer a suitable archive RPC and `--include-events`;
the exporter then requires contiguous `TradeCommitted`/`TradeResolved` IDs and
matching on-chain totals. If full event retrieval remains impossible, a
state-only archive is acceptable only when its digest, block number/hash and
the reason events are absent are anchored in a signed release attestation or a
Safe transaction. In either case, publish the SHA-256 outside this repository
and run `--verify=<final.json>` before launch authorization.
