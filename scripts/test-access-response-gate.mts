import assert from 'node:assert/strict';
import { AccessResponseGate } from '../src/lib/access-response-gate.ts';

const gate = new AccessResponseGate();
let owner = 'account-A';
let shown: string | null = null;
const delayed = () => {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => { resolve = done; });
  return { promise, resolve };
};
const load = async (requestedOwner: string, response: Promise<string>) => {
  const ticket = gate.start(requestedOwner);
  const value = await response;
  if (gate.accept(ticket, owner) && gate.isCurrent(ticket)) shown = value;
};

const oldAccount = delayed();
const slowA = load(owner, oldAccount.promise);
owner = 'account-B';
gate.invalidate();
shown = null; // auth-change callback clears the old account immediately
await load(owner, Promise.resolve('B: no gifts'));
oldAccount.resolve('A: 20 gifted reads and Pro');
await slowA;
assert.equal(shown, 'B: no gifts', 'a slow A response cannot show A benefits after switching to B');

const olderB = delayed();
const slowB = load(owner, olderB.promise);
await load(owner, Promise.resolve('B: 10 gifted reads'));
olderB.resolve('B: no gifts');
await slowB;
assert.equal(shown, 'B: 10 gifted reads', 'an older same-account GET cannot overwrite the newest balance');

const beforeRead = delayed();
const pendingGet = load(owner, beforeRead.promise);
const readTicket = gate.commitRead();
if (gate.isCurrent(readTicket)) shown = 'B: 9 gifted reads';
beforeRead.resolve('B: 10 gifted reads');
await pendingGet;
assert.equal(shown, 'B: 9 gifted reads', 'a pre-read GET cannot restore spent credits');

console.log('access-response-gate: 3 races passed');
