import assert from 'node:assert/strict';
import { Communicate } from 'edge-tts-universal';

// The voice tables read their overrides at import time: start from a clean
// deployment so the assertions describe the shipped defaults.
for (const name of ['TTS_EDGE_VOICE_ES', 'TTS_EDGE_VOICE_EN', 'TTS_EDGE_VOICE_PT', 'TTS_INSTRUCTIONS', 'TTS_OPENAI_VOICE', 'TTS_OPENAI_MODEL', 'TTS_PROVIDER']) delete process.env[name];
const oldKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-only';

const { buildInstructions, generateSpeech, resolveEdgeVoice, resolveOpenAIVoice, ttsProviderOrder } = await import('../api/_lib/tts.js');

type Gender = 'female' | 'male';
const GENDERS: Gender[] = ['female', 'male'];
const VIBES = [undefined, 'direct', 'analytical', 'wise'];

// "female" is the coral persona and "male" the ash persona.
const OPENAI: Record<Gender, string> = { female: 'nova', male: 'verse' };

// Language x region -> the Edge neural voice of each gender, and what the
// persona text must (and must not) say about the speaker. Languages without
// markers share one neutral text that only describes the voice.
const CASES: Array<{ lang: string; locale: string; edge: Record<Gender, string>; says?: Record<Gender, string[]>; language: string }> = [
  { lang: 'en', locale: 'en-US', edge: { female: 'en-US-AriaNeural', male: 'en-US-GuyNeural' }, language: 'English',
    says: { female: ['22-year-old woman', 'looking out for her'], male: ['23-year-old guy', 'looking out for him'] } },
  { lang: 'es', locale: 'es-MX', edge: { female: 'es-MX-DaliaNeural', male: 'es-MX-JorgeNeural' }, language: 'Español',
    says: { female: ['una chava', 'mejor amiga', 'extranjera', 'locutora', 'agresiva', 'sonar fría'], male: ['un chavo', 'mejor amigo', 'extranjero', 'locutor,', 'agresivo', 'sonar frío'] } },
  { lang: 'es', locale: 'es-ES', edge: { female: 'es-ES-ElviraNeural', male: 'es-ES-AlvaroNeural' }, language: 'Español',
    says: { female: ['una chava', 'mejor amiga'], male: ['un chavo', 'mejor amigo'] } },
  { lang: 'es', locale: 'es-US', edge: { female: 'es-US-PalomaNeural', male: 'es-US-AlonsoNeural' }, language: 'Español',
    says: { female: ['una chava', 'mejor amiga'], male: ['un chavo', 'mejor amigo'] } },
  { lang: 'pt', locale: 'pt-BR', edge: { female: 'pt-BR-FranciscaNeural', male: 'pt-BR-AntonioNeural' }, language: 'Português brasileiro',
    says: { female: ['uma jovem brasileira', 'sua melhor amiga', 'fluida, próxima', 'zero locutora', 'soar fria'], male: ['um jovem brasileiro', 'seu melhor amigo', 'fluido, próximo', 'zero locutor.', 'soar frio'] } },
  { lang: 'pt', locale: 'pt-PT', edge: { female: 'pt-PT-RaquelNeural', male: 'pt-PT-DuarteNeural' }, language: 'português europeu' },
  { lang: 'fr', locale: 'fr-FR', edge: { female: 'fr-FR-DeniseNeural', male: 'fr-FR-HenriNeural' }, language: 'français' },
  { lang: 'it', locale: 'it-IT', edge: { female: 'it-IT-ElsaNeural', male: 'it-IT-DiegoNeural' }, language: 'italiano' },
  { lang: 'de', locale: 'de-DE', edge: { female: 'de-DE-KatjaNeural', male: 'de-DE-ConradNeural' }, language: 'Deutsch' },
];

/** Every vibe of one (language, gender): the text names its own gender and never the other one. */
function assertGendered(c: typeof CASES[number], gender: Gender, voice: string, persona: string | undefined) {
  const other: Gender = gender === 'female' ? 'male' : 'female';
  const all = VIBES.map((vibe) => buildInstructions(c.lang, vibe, voice, persona, c.locale));
  for (const text of all) {
    assert.ok(text.includes(c.language), `${c.locale} ${gender}: instructions are in the request's language`);
    for (const marker of c.says?.[other] ?? []) assert.ok(!text.includes(marker), `${c.locale} ${gender}: must not say "${marker}"`);
  }
  for (const marker of c.says?.[gender] ?? []) assert.ok(all.some((text) => text.includes(marker)), `${c.locale} ${gender}: says "${marker}"`);
  // The masculine agreement of a vibe line is the Portuguese-wide one, so the
  // neutral European base still needs the check.
  if (c.lang === 'pt') assert.ok(all.every((text) => !text.includes(gender === 'female' ? 'soar frio' : 'soar fria')), `${c.locale} ${gender}: vibe line agrees`);
}

const oldFetch = globalThis.fetch;
const oldStream = Communicate.prototype.stream;
const paid: Array<{ voice: string; instructions: string }> = [];
const free: string[] = [];
let checks = 0;

globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://api.openai.com/v1/audio/speech');
  const body = JSON.parse(String(init?.body));
  paid.push({ voice: body.voice, instructions: body.instructions });
  return new Response(Buffer.alloc(1000), { status: 200 });
};
Communicate.prototype.stream = async function* () {
  const wireVoice = (this as unknown as { ttsConfig: { voice: string } }).ttsConfig.voice;
  const match = wireVoice.match(/^Microsoft Server Speech Text to Speech Voice \(([a-z]{2}-[A-Z]{2}), ([A-Za-z]+Neural)\)$/);
  assert.ok(match, 'Communicate must receive a valid provider voice');
  free.push(`${match[1]}-${match[2]}`);
  yield { type: 'audio', data: new Uint8Array(1024) };
} as typeof oldStream;

try {
  for (const c of CASES) {
    for (const gender of GENDERS) {
      // Persona path (mode "persona"): the OpenAI voice and the text it is told to be.
      assert.equal(resolveOpenAIVoice(gender), OPENAI[gender]);
      const speech = await generateSpeech('Bobby', { lang: c.lang, locale: c.locale, voice: gender, format: 'mp3', preservePersona: true });
      const sent = paid.pop();
      assert.equal(speech?.provider, 'openai');
      assert.equal(sent?.voice, OPENAI[gender], `${c.locale} ${gender}: OpenAI voice`);
      assert.equal(sent?.instructions, buildInstructions(c.lang, undefined, OPENAI[gender], gender, c.locale));
      assertGendered(c, gender, OPENAI[gender], gender);

      // Free path (mode "free"): the Edge neural voice that reaches the wire.
      assert.equal(resolveEdgeVoice(c.lang, gender, undefined, c.locale), c.edge[gender], `${c.locale} ${gender}: Edge voice`);
      const edge = await generateSpeech('Bobby', { lang: c.lang, locale: c.locale, voice: gender, format: 'mp3', provider: 'edge' });
      assert.equal(edge?.provider, 'edge');
      assert.equal(free.pop(), c.edge[gender], `${c.locale} ${gender}: Edge voice on the wire`);
      assert.equal(paid.length, 0, 'The free path never reaches the paid provider');
      checks++;
    }
    // The preference is an alias, not a new persona: same text as coral / ash.
    for (const vibe of VIBES) {
      assert.equal(buildInstructions(c.lang, vibe, OPENAI.female, 'female', c.locale), buildInstructions(c.lang, vibe, resolveOpenAIVoice('coral'), 'coral', c.locale));
      assert.equal(buildInstructions(c.lang, vibe, OPENAI.male, 'male', c.locale), buildInstructions(c.lang, vibe, resolveOpenAIVoice('ash'), 'ash', c.locale));
    }
    // The neutral texts are one string for both genders; the gendered ones differ.
    const [fem, masc] = GENDERS.map((gender) => buildInstructions(c.lang, 'wise', OPENAI[gender], gender, c.locale));
    assert.equal(fem === masc, !c.says, `${c.locale}: ${c.says ? 'gendered' : 'neutral'} persona text`);
  }
  // A request without a region keeps today's defaults: European Portuguese, Mexican Spanish.
  assert.equal(resolveEdgeVoice('pt', 'male'), 'pt-PT-DuarteNeural');
  assert.equal(resolveEdgeVoice('pt', 'female'), 'pt-PT-RaquelNeural');
  assert.equal(resolveEdgeVoice('es', 'male'), 'es-MX-JorgeNeural');
  assert.equal(resolveEdgeVoice('en', 'male', undefined, 'en-GB'), 'en-US-GuyNeural');

  // A client Edge voice never turns an explicit gender into the other one.
  for (const c of CASES) {
    for (const gender of GENDERS) {
      const other: Gender = gender === 'female' ? 'male' : 'female';
      assert.equal(resolveEdgeVoice(c.lang, gender, c.edge[other], c.locale), c.edge[gender], `${c.locale} ${gender}: other-gender edgeVoice is dropped`);
    }
  }
  assert.equal(resolveEdgeVoice('es', 'male', 'es-US-PalomaNeural', 'es-MX'), 'es-MX-JorgeNeural');
  assert.equal(resolveEdgeVoice('es', 'female', 'es-US-PalomaNeural', 'es-MX'), 'es-US-PalomaNeural', 'A menu voice of the same gender is still the user\'s choice');
  assert.equal(resolveEdgeVoice('es', 'male', 'es-US-AlonsoNeural', 'es-MX'), 'es-US-AlonsoNeural');
  assert.equal(resolveEdgeVoice('fr', 'male', 'not-an-allowed-voice', 'fr-FR'), 'fr-FR-HenriNeural');
  // The dropped voice must not flip the chain to the free provider either.
  let speech = await generateSpeech('Bobby', { lang: 'es', voice: 'male', edgeVoice: 'es-MX-DaliaNeural', format: 'mp3' });
  assert.deepEqual([speech?.provider, paid.pop()?.voice, free.length], ['openai', 'verse', 0]);
  speech = await generateSpeech('Bobby', { lang: 'es', voice: 'male', edgeVoice: 'es-MX-DaliaNeural', format: 'mp3', provider: 'edge' });
  assert.deepEqual([speech?.provider, free.pop(), paid.length], ['edge', 'es-MX-JorgeNeural', 0]);
  speech = await generateSpeech('Bobby', { lang: 'es', voice: 'female', edgeVoice: 'es-US-PalomaNeural', format: 'mp3' });
  assert.deepEqual([speech?.provider, free.pop(), paid.length], ['edge', 'es-US-PalomaNeural', 0]);

  // Every other voice id resolves exactly as before the preference existed.
  const UNCHANGED: Record<string, string> = {
    alpha: 'verse', red: 'shimmer', cio: 'echo', coral: 'nova', ballad: 'echo', sage: 'shimmer', ash: 'verse',
    nova: 'nova', echo: 'echo', shimmer: 'shimmer', verse: 'verse', alloy: 'alloy', marin: 'marin', cedar: 'cedar',
    onyx: 'onyx', fable: 'fable', mellow: 'ash',
  };
  const DEFAULT_EDGE: Record<string, string> = {
    'en-US': 'en-US-AriaNeural', 'es-MX': 'es-MX-DaliaNeural', 'es-ES': 'es-MX-DaliaNeural', 'es-US': 'es-MX-DaliaNeural',
    'pt-BR': 'pt-BR-FranciscaNeural', 'pt-PT': 'pt-PT-RaquelNeural', 'fr-FR': 'fr-FR-DeniseNeural', 'it-IT': 'it-IT-ElsaNeural', 'de-DE': 'de-DE-KatjaNeural',
  };
  const MENU = [
    'es-MX-DaliaNeural', 'es-MX-JorgeNeural', 'es-US-PalomaNeural', 'es-US-AlonsoNeural', 'en-US-AriaNeural', 'en-US-GuyNeural',
    'fr-FR-DeniseNeural', 'fr-FR-HenriNeural', 'pt-PT-RaquelNeural', 'pt-PT-DuarteNeural', 'pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural',
    'it-IT-ElsaNeural', 'it-IT-DiegoNeural', 'de-DE-KatjaNeural', 'de-DE-ConradNeural',
  ];
  assert.equal(Object.keys(UNCHANGED).length, 17);
  for (const [voice, openai] of Object.entries(UNCHANGED)) {
    assert.equal(resolveOpenAIVoice(voice), openai, `${voice}: OpenAI voice unchanged`);
    for (const c of CASES) {
      assert.equal(resolveEdgeVoice(c.lang, voice, undefined, c.locale), DEFAULT_EDGE[c.locale], `${voice} ${c.locale}: Edge identity unchanged`);
      // A companion keeps honoring the user's menu voice, whatever its gender.
      for (const menuVoice of MENU) assert.equal(resolveEdgeVoice(c.lang, voice, menuVoice, c.locale), menuVoice, `${voice}: menu voice ${menuVoice} honored`);
      // A feminine companion voice gets the feminine text and a masculine one the masculine text.
      if (voice !== 'mellow') assertGendered(c, ['nova', 'shimmer', 'alloy', 'marin', 'fable'].includes(openai) ? 'female' : 'male', openai, voice);
    }
  }
  assert.equal(resolveOpenAIVoice(undefined), 'nova');
  assert.equal(resolveEdgeVoice('es'), 'es-MX-DaliaNeural');
  assert.deepEqual(ttsProviderOrder('openai'), ['openai', 'edge']);
  assert.equal(buildInstructions('pt', 'analytical', undefined, undefined, 'pt-BR').includes('um jovem brasileiro'), true, 'No voice, no gender: the base text is the one shipped today');

  console.log(`${checks} language x gender cases on both paths, edgeVoice guard and ${Object.keys(UNCHANGED).length} unchanged voices passed`);
} finally {
  globalThis.fetch = oldFetch;
  Communicate.prototype.stream = oldStream;
  if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
}
