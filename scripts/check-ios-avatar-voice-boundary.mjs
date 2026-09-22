import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Avatar narration must never pull the separate web/PTS conversational client
// into the native Bobby target. Check the complete target, not only its UI.
const root = new URL('../ios/Bobby/', import.meta.url);
const forbidden = /webSocketTask\s*\(|RTCPeerConnection|requestRecordPermission|SFSpeechRecognizer|NSMicrophoneUsageDescription|NSSpeechRecognitionUsageDescription|\/v1\/realtime|\/api\/(?:pts-realtime-session|realtime-session|explain)(?:["'/?]|$)/;
function inspect(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) inspect(path);
    else if (/\.(swift|plist)$/.test(path)) assert.doesNotMatch(readFileSync(path, 'utf8'), forbidden, path);
  }
}
inspect(fileURLToPath(new URL('Sources/', root)));
assert.doesNotMatch(readFileSync(new URL('project.yml', root), 'utf8'), forbidden);
console.log('Native Bobby: no microphone, speech recognition, Live session, or ChatGPT route.');
