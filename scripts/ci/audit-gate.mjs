#!/usr/bin/env node
// CI dependency gate. The bar is the one `npm audit --audit-level=high` sets over the whole tree, build tooling
// included, with one difference: an advisory can be listed below when no fixed release exists and it cannot be reached
// in what we ship. Every exception names its advisory, says why, and expires; after that date the gate fails again, so
// an exception is re-examined instead of forgotten. Anything else rated high or critical fails the build.
import { spawnSync } from 'node:child_process';

const EXCEPTIONS = [
  {
    id: 'GHSA-vfj7-8cjw-p6xm',
    until: '2026-10-17',
    why: 'braces, stack exhaustion on deeply nested brace patterns. Every release is affected and no fixed one exists. '
      + 'It is only reached by build tooling (tailwindcss, chokidar, fast-glob, the @vercel/node typings) with glob '
      + 'patterns written in this repository, never with input from a user at runtime.',
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
