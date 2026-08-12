import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  RECORD_SECRET_HEADER,
  recordAuthHeaders,
  requireRecordAuth,
} from '../api/_lib/record-auth.js';

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

const previous = process.env.XLAYER_RECORD_SECRET;

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

  console.log('record-auth: 4/4 checks passed');
} finally {
  if (previous === undefined) delete process.env.XLAYER_RECORD_SECRET;
  else process.env.XLAYER_RECORD_SECRET = previous;
}
