// Offline regression gate for multilingual input and output. Real iPhone STT/playback
// and generated model prose require separate acceptance; these are not mocked PASS claims.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suites = [
  'test-native-mic-gestures.mjs',
  'test-nucleo-input-pipeline.mjs',
  'test-web-speech-pipeline.mjs',
  'test-language-assets59.mts',
  'test-asset-discovery.mts',
  'test-language-output59.mts',
  'test-native-desk-locales.mts',
  'test-free-voice-locales.mts',
  'test-voice-tool-language.mts',
  'test-web-language-continuity.mjs',
  'test-nucleo-locales.mjs',
  'test-nucleo-regional-format.mjs',
  'test-nucleo-react-locales.mjs',
];
let failures = 0;
for (const suite of suites) {
  const start = Date.now();
  const args = [...(suite.endsWith('.mts') ? ['--import', 'tsx'] : []), `scripts/${suite}`];
  const result = spawnSync(process.execPath, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, RUN_LIVE: '0' },
  });
  const passed = result.status === 0 && !result.error;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${suite} (${((Date.now() - start) / 1000).toFixed(2)}s)`);
  if (passed) {
    const last = (result.stdout || '').trim().split('\n').at(-1);
    if (last) console.log(`  ${last}`);
  } else {
    failures++;
    if (result.error) console.error(result.error.message);
    console.error(((result.stdout || '') + (result.stderr || '')).slice(-12_000));
  }
}
console.log(`${suites.length - failures}/${suites.length} offline language suites passed. Native XCTest is a separate gate.`);
process.exitCode = failures ? 1 : 0;
