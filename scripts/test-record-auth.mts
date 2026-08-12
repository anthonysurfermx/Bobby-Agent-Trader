import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  RECORD_SECRET_HEADER,
  recordAuthHeaders,
  requireRecordAuth,
} from '../api/_lib/record-auth.js';
import {
  internalAuthHeaders,
  isInternalRequest,
  requireInternalAuth,
} from '../api/_lib/request-security.js';

function responseRecorder() {
  const state: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  } as unknown as VercelResponse;
  return { response, state };
}

function requestWith(secret?: string): VercelRequest {
  return {
    headers: secret ? { [RECORD_SECRET_HEADER]: secret } : {},
  } as unknown as VercelRequest;
}

function internalRequest(secret?: string, bearer = false): VercelRequest {
  return {
    headers: secret
      ? bearer ? { authorization: `Bearer ${secret}` } : { 'x-internal-secret': secret }
      : {},
  } as unknown as VercelRequest;
}

const previous = process.env.XLAYER_RECORD_SECRET;
const previousInternal = process.env.INTERNAL_API_SECRET;
const previousCycle = process.env.BOBBY_CYCLE_SECRET;
const previousCron = process.env.CRON_SECRET;

try {
  delete process.env.XLAYER_RECORD_SECRET;
  {
    const { response, state } = responseRecorder();
    assert.equal(requireRecordAuth(requestWith(), response), false);
    assert.equal(state.status, 503, 'missing server secret must fail closed');
    assert.deepEqual(recordAuthHeaders(), {}, 'callers must not invent an empty auth header');
  }

  process.env.XLAYER_RECORD_SECRET = 'test-record-secret';
  {
    const { response, state } = responseRecorder();
    assert.equal(requireRecordAuth(requestWith(), response), false);
    assert.equal(state.status, 401, 'missing caller secret must be unauthorized');
  }
  {
    const { response, state } = responseRecorder();
    assert.equal(requireRecordAuth(requestWith('wrong-secret'), response), false);
    assert.equal(state.status, 401, 'wrong caller secret must be unauthorized');
  }
  {
    const { response, state } = responseRecorder();
    assert.equal(requireRecordAuth(requestWith('test-record-secret'), response), true);
    assert.equal(state.status, undefined, 'valid auth must not write an error response');
    assert.deepEqual(recordAuthHeaders(), { [RECORD_SECRET_HEADER]: 'test-record-secret' });
  }

  delete process.env.INTERNAL_API_SECRET;
  delete process.env.BOBBY_CYCLE_SECRET;
  delete process.env.CRON_SECRET;
  {
    const { response, state } = responseRecorder();
    assert.equal(requireInternalAuth(internalRequest(), response), false);
    assert.equal(state.status, 503, 'missing internal secrets must fail closed');
    assert.equal(isInternalRequest(internalRequest('anything')), false);
  }

  process.env.INTERNAL_API_SECRET = 'dedicated-internal-secret';
  process.env.BOBBY_CYCLE_SECRET = 'cycle-secret';
  process.env.CRON_SECRET = 'cron-secret';
  {
    const { response, state } = responseRecorder();
    assert.equal(requireInternalAuth(internalRequest('wrong'), response), false);
    assert.equal(state.status, 401, 'wrong internal secret must be unauthorized');
  }
  for (const secret of ['dedicated-internal-secret', 'cycle-secret', 'cron-secret']) {
    const { response, state } = responseRecorder();
    assert.equal(requireInternalAuth(internalRequest(secret), response), true);
    assert.equal(state.status, undefined, `configured secret ${secret} must be accepted`);
  }
  assert.equal(isInternalRequest(internalRequest('cron-secret', true)), true, 'bearer auth must be supported');
  assert.deepEqual(internalAuthHeaders(), { 'x-internal-secret': 'dedicated-internal-secret' });

  console.log('record-auth: 11/11 checks passed');
} finally {
  if (previous === undefined) delete process.env.XLAYER_RECORD_SECRET;
  else process.env.XLAYER_RECORD_SECRET = previous;
  if (previousInternal === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = previousInternal;
  if (previousCycle === undefined) delete process.env.BOBBY_CYCLE_SECRET;
  else process.env.BOBBY_CYCLE_SECRET = previousCycle;
  if (previousCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousCron;
}
