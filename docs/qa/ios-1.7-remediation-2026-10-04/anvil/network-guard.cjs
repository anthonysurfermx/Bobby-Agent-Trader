// QA-only process observer. Permit TCP solely to this suite's owned Anvil port.
const fs = require('node:fs');
const net = require('node:net');
const childProcess = require('node:child_process');
const strict = require('node:assert/strict');
const { syncBuiltinESMExports } = require('node:module');
const port = Number(process.env.BOBBY_ANVIL_QA_PORT);
const output = process.env.BOBBY_ANVIL_QA_AUDIT;
const assertions = { calls: 0, failures: 0, byOperation: {} };
function record(value) {
  if (output) fs.appendFileSync(output, JSON.stringify({ pid: process.pid, ...value }) + '\n');
}
function destination(args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (first && typeof first === 'object') return first;
  if (typeof first === 'number') return { port: first, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (typeof first === 'string') return { path: first };
  return {};
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const target = destination(args);
  if (target.path && !target.port) {
    // tsx uses local Unix IPC; it is not a network destination.
    return connect.apply(this, args);
  }
  const host = target.host || target.hostname || 'localhost';
  const allowed = ['127.0.0.1', 'localhost', '::1'].includes(host) && Number(target.port) === port;
  record({ type: 'tcp', host, port: Number(target.port), allowed });
  if (!allowed) throw new Error('QA TCP blocked: only owned localhost Anvil is permitted');
  return connect.apply(this, args);
};
const originalSpawn = childProcess.spawn;
childProcess.spawn = function (executable, args = [], options) {
  if (executable === 'anvil' || executable.endsWith('/anvil')) {
    const portIndex = args.indexOf('--port');
    if (portIndex < 0 || Number(args[portIndex + 1]) !== port || args.includes('--fork-url')) {
      throw new Error('QA requires owned local Anvil port and no fork');
    }
    args = [...args, '--host', '127.0.0.1', '--chain-id', '31337'];
    const child = originalSpawn.call(this, executable, args, options);
    record({ type: 'anvil-spawn', childPid: child.pid, executable, args });
    child.on('exit', (code, signal) => record({ type: 'anvil-exit', childPid: child.pid, code, signal }));
    return child;
  }
  return originalSpawn.call(this, executable, args, options);
};
for (const operation of ['equal', 'deepEqual', 'ok', 'match', 'throws', 'rejects']) {
  const original = strict[operation];
  strict[operation] = function (...args) {
    const fromSuite = new Error().stack.includes('/anvil/scripts/test-');
    if (!fromSuite) return original.apply(this, args);
    assertions.calls++;
    assertions.byOperation[operation] = (assertions.byOperation[operation] || 0) + 1;
    try {
      const answer = original.apply(this, args);
      if (answer && typeof answer.then === 'function') {
        return answer.catch(error => { assertions.failures++; throw error; });
      }
      return answer;
    } catch (error) { assertions.failures++; throw error; }
  };
}
syncBuiltinESMExports();
process.on('exit', code => record({ type: 'node-exit', code, assertions }));
