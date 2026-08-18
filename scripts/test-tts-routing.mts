import assert from 'node:assert/strict';
import { resolveEdgeVoice, ttsProviderOrder } from '../api/_lib/tts.js';

const tests: Array<{ name: string; run: () => void }> = [
  {
    name: 'selected Edge voice wins over an OpenAI deployment preference',
    run: () => {
      assert.deepEqual(ttsProviderOrder('openai', 'es-MX-JorgeNeural'), ['edge', 'openai']);
      assert.equal(resolveEdgeVoice('es', 'cio', 'es-MX-JorgeNeural'), 'es-MX-JorgeNeural');
    },
  },
  {
    name: 'invalid voice uses the Bobby identity and never reaches the synthesizer',
    run: () => {
      assert.deepEqual(ttsProviderOrder('openai', 'not-an-allowed-voice'), ['edge', 'openai']);
      assert.equal(resolveEdgeVoice('es', 'cio', 'not-an-allowed-voice'), 'es-MX-DaliaNeural');
    },
  },
  {
    name: 'calls without a selected voice preserve the deployment provider order',
    run: () => {
      assert.deepEqual(ttsProviderOrder('openai'), ['openai', 'edge']);
      assert.deepEqual(ttsProviderOrder('edge'), ['edge', 'openai']);
    },
  },
  {
    name: 'every iOS voice id resolves unchanged',
    run: () => {
      for (const voice of [
        'es-MX-DaliaNeural',
        'es-MX-JorgeNeural',
        'es-US-PalomaNeural',
        'es-US-AlonsoNeural',
      ]) {
        assert.equal(resolveEdgeVoice('es', 'cio', voice), voice);
      }
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}

console.log(`${tests.length}/${tests.length} TTS routing checks passed`);
