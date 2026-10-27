#!/usr/bin/env node
// CI dependency gate. The bar is the one `npm audit --audit-level=high` sets over the whole tree, build tooling
// included, with one difference: an advisory can be listed below when no fixed release exists and it cannot be reached
// in what we ship. Every exception names its advisory, says why, and expires; after that date the gate fails again, so
// an exception is re-examined instead of forgotten. Anything else rated high or critical fails the build.
import { spawnSync } from 'node:child_process';

const EXCEPTIONS = [
  {
    id: 'GHSA-mrhx-c7xc-m3w5',
    until: '2026-11-30',
    why: 'zod, memory exhaustion when an array schema validates a huge array: zod 3 records an issue for every failing '
      + 'element even after .max() has failed. No zod 3 release is fixed (3.25.76 is the last); the fix is zod 4.6.6. '
      + 'The API validates request bodies with zod 3 only after a byte cap measured on the parsed body (write-guard '
      + '16 KB by default, companion-turn 8 KB, push-news 4 KB, briefings 2 KB), which bounds one failed parse to '
      + 'about 16k issues, 12 ms and 3 MB. The other copies (@reown/appkit-wallet and @walletconnect/ethereum-provider '
      + 'in the browser, @vercel/cli-config reading the local CLI config) never validate a request body. Expires when '
      + 'the API moves to zod 4.6.6 (option B of the PR that added it).',
  },
];

const today = process.env.AUDIT_GATE_TODAY || new Date().toISOString().slice(0, 10);
const run = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let report;
try { report = JSON.parse(run.stdout); } catch { report = null; }
if (!report || report.error || !report.metadata?.vulnerabilities) {
  console.error('audit-gate: npm audit did not return a report', report?.error ?? run.stderr?.slice(0, 400));
  process.exit(2);
}

// A package is rated by its own advisories or by those of what it depends on: collect the advisories themselves.
const advisories = new Map();
for (const pkg of Object.values(report.vulnerabilities ?? {})) {
  for (const via of pkg.via ?? []) {
    if (!via || typeof via !== 'object') continue;
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    advisories.set(String(via.url ?? '').split('/').pop() || String(via.source), via);
  }
}
const rated = report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical;
if (rated > 0 && advisories.size === 0) {
  console.error(`audit-gate: npm rates ${rated} packages high or critical but names no advisory; failing closed.`);
  process.exit(1);
}

const blocking = [];
for (const [id, via] of advisories) {
  const exception = EXCEPTIONS.find((e) => e.id === id);
  if (exception && today <= exception.until) {
    console.log(`audit-gate: excepted until ${exception.until}: ${id} (${via.name}). ${exception.why}`);
    continue;
  }
  blocking.push(`${id}  ${via.severity}  ${via.name} ${via.range ?? ''}  ${via.title ?? ''}${exception ? `  [exception expired ${exception.until}]` : ''}`);
}
for (const exception of EXCEPTIONS) {
  if (!advisories.has(exception.id)) console.log(`audit-gate: ${exception.id} is no longer reported; remove its exception.`);
}
if (blocking.length) {
  console.error(`audit-gate: ${blocking.length} high or critical ${blocking.length === 1 ? 'advisory' : 'advisories'}:`);
  for (const line of blocking) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`audit-gate: no high or critical advisory outside the listed exceptions (${advisories.size} excepted).`);
