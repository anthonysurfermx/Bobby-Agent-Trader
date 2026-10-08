// Android-specific contracts layered over the canonical iOS 1.7 renderer.
// Samples and measured DOM stubs are test-only; no product assets or network are changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const languages = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const risk = JSON.parse(read('risk-notice.json'));
function strings(page) {
  const source = read(`src/${page}/40-strings.js`);
  return vm.runInNewContext(source + '; STR', {});
}
function model() {
  const context = { console };
  context.globalThis = context; context.window = context; context.self = context;
  vm.runInNewContext(read('src/shared/20-read-model.js'), context);
  return context.NucleoReadModel;
}

test('all six language permission screens describe Android local dictation without another platform', () => {
  for (const page of ['app', 'onboarding']) {
    const table = strings(page);
    for (const language of languages) {
      const body = table[language]['perm.body'];
      assert.match(body, /Android/);
      assert.doesNotMatch(body, /Apple|iOS|iPhone|Safari/);
      assert.ok(body.length > 55, `${page} ${language}: complete permission explanation`);
    }
  }
});

test('native sign-in remains generic and subscription confirmation names Google Play in all languages', () => {
  const readModel = model(), onboarding = strings('onboarding');
  for (const language of languages) {
    assert.doesNotMatch(readModel.t(language, 'gate.signinCta'), /Apple/);
    assert.doesNotMatch(onboarding[language]['sheet.apple'], /Apple/);
    assert.match(readModel.t(language, 'gate.proPending'), /Google Play/);
    assert.doesNotMatch(readModel.t(language, 'gate.proPending'), /App Store/);
  }
  for (const file of ['app/55-read.js', 'onboarding/82-render-dom.js', 'onboarding/template.html']) {
    assert.doesNotMatch(read('src/' + file), /\\uF8FF|&#xF8FF;/);
  }
});

test('risk version 6 retains provider disclosure and local audio policy in six languages', () => {
  assert.equal(risk.version, 6);
  assert.deepEqual(Object.keys(risk.statements).sort(), [...languages].sort());
  for (const language of languages) {
    assert.equal(risk.statements[language].length, 4);
    const body = risk.statements[language][0].body;
    for (const provider of ['OpenAI', 'Anthropic', 'Microsoft', 'Android']) assert.ok(body.includes(provider), `${language}: ${provider}`);
    assert.doesNotMatch(body, /Apple|iPhone|Safari/);
  }
  const french = JSON.stringify(risk.statements.fr), portuguese = JSON.stringify(risk.statements.pt);
  assert.doesNotMatch(french, /\b(vous|votre|vos)\b/i);
  assert.doesNotMatch(portuguese, /\b(você|sua|seu|suas|seus|mantenha|toque|deslize|solte|pergunte|escreva)\b/i);
  assert.match(risk.statements.pt[3].body, /Se precisares de aconselhamento, consulta um profissional autorizado/);
  assert.doesNotMatch(portuguese, /Se precisar\b|\bconsulte\b/i);
});

test('renderer keeps the pure-orb fallback and never bundles a development mock source', () => {
  const gl = read('src/app/20-gl.js');
  assert.match(gl, /fbImg\.style\.opacity = COMP_IN_GLASS \? '' : '0'/);
  assert.match(gl, /else fbImg\.removeAttribute\('src'\)/);
  assert.equal(fs.existsSync(path.join(root, 'src/shared/90-dev-mock-bridge.js')), false);
  const builder = read('build.py');
  assert.match(builder, /connect-src 'none'/);
  assert.match(builder, /DEV_ONLY_PAGES = \{"contract"\}/);
  assert.match(builder, /risk_source = risk_notice_source\(\)/);
  assert.match(builder, /shutil\.copyfile\(risk_source, os\.path\.join\(OUT, "risk-notice\.json"\)\)/);
});

test('the actual ordered shipping scripts compile for both pages without writing generated assets', () => {
  const shared = fs.readdirSync(path.join(root, 'src/shared')).filter(name => name.endsWith('.js') && !(name.startsWith('9') && name.includes('-dev-'))).sort();
  for (const page of ['app', 'onboarding']) {
    const parts = fs.readdirSync(path.join(root, 'src', page)).filter(name => name.endsWith('.js')).sort();
    const script = [...shared.map(name => read('src/shared/' + name)), ...parts.map(name => read('src/' + page + '/' + name))].join('\n').replaceAll('__COMPANIONS_JSON__', '[]');
    const result = spawnSync(process.execPath, ['--check'], { input: script, encoding: 'utf8' });
    assert.equal(result.status, 0, `${page}: ${result.stderr}`);
  }
});

test('builder rejects obsolete, incomplete or foreign-platform consent without generating assets', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-risk-source-test-'));
  try {
    const candidates = [
      ['obsolete', { ...risk, version: 5 }],
      ['invalid envelope', { ...risk, v: true }],
      ['not an object', []],
      ['missing language', { ...risk, statements: { ...risk.statements, fr: undefined } }],
      ['foreign platform', { ...risk, statements: { ...risk.statements, en: [{ ...risk.statements.en[0], body: risk.statements.en[0].body + ' Apple speech service.' }, ...risk.statements.en.slice(1)] } }],
      ['missing provider', { ...risk, statements: { ...risk.statements, en: [{ ...risk.statements.en[0], body: risk.statements.en[0].body.replace('Microsoft', '') }, ...risk.statements.en.slice(1)] } }],
    ];
    const code = "import runpy,sys; module=runpy.run_path(sys.argv[1],run_name='android_builder_validation'); module['risk_notice_source'](sys.argv[2])";
    const valid = path.join(directory, 'valid.json');
    fs.writeFileSync(valid, JSON.stringify(risk));
    assert.equal(spawnSync('python3', ['-B', '-c', code, path.join(root, 'build.py'), valid], { encoding: 'utf8' }).status, 0);
    for (const [name, notice] of candidates) {
      const file = path.join(directory, name.replaceAll(' ', '-') + '.json');
      fs.writeFileSync(file, JSON.stringify(notice));
      const result = spawnSync('python3', ['-B', '-c', code, path.join(root, 'build.py'), file], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, /six-language on-device consent contract/, name);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a chip is 40 px to the eye and answers to 48 dp under a finger on the most common Android screen', () => {
  // The stage is 390 x 844 px, scaled to fit the WebView (app/10-core.js: fitS = min(w / 390, h / 844)). The page is
  // drawn between the status bar and the navigation bar: on a 360 x 800 dp phone that leaves about 707 dp of height
  // (measured on the CI emulator, where a 40 px chip is 67 device pixels at 2 px per dp).
  const css = read('src/app/template.html');
  const chip = css.match(/\.chip\{([^}]*)\}/);
  assert.ok(chip, 'the chip rule');
  assert.match(chip[1], /position:absolute/, 'the tap area is laid out against the chip itself');
  const tall = Number(chip[1].match(/(?:^|;)height:(\d+)px/)[1]);
  assert.equal(tall, 40, 'what the eye sees is unchanged');
  const area = css.match(/\.chip::before\{([^}]*)\}/);
  assert.ok(area, 'a chip has a tap area of its own');
  assert.match(area[1], /content:''/);
  assert.match(area[1], /position:absolute;left:0;right:0/, 'as wide as the chip, no wider: it never reaches a neighbour');
  const above = Number(area[1].match(/top:-(\d+)px/)[1]), below = Number(area[1].match(/bottom:-(\d+)px/)[1]);
  const scale = Math.min(360 / 390, 707 / 844);
  assert.ok((tall + above + below) * scale >= 48, `${tall + above + below} px at ${scale.toFixed(3)} is ${((tall + above + below) * scale).toFixed(1)} dp`);
  // It stays clear of what is around the row: the pill below the idle row, and nothing a tap could miss above it.
  const idleTop = Number(read('src/app/55-read.js').match(/var CHIP_TOP = (\d+)/)[1]);
  const pillTop = Number(css.match(/#pill\{[^}]*top:(\d+)px/)[1]);
  assert.ok(idleTop + tall + below < pillTop, 'the tap area ends above the pill');
  // The two-line question chip is a chip too (min-height 40 px): the same rule covers it, and "Got it" on the nudge.
  assert.match(css, /\.chip\.ask\{height:auto;min-height:40px/);
  assert.match(css, /\.chip\.nudge\{/);
});
