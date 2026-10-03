// Language by visitor country: the pure map, its inline copy in the static home, the precedence in both
// clients, and the /api/geo handler. Offline: the network, storage and DOM are shims; the code under test
// is the shipping source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const compile = file => ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let checks = 0;
const check = (name, action) => { action(); checks++; console.log('ok - ' + name); };
const asyncCheck = async (name, action) => { await action(); checks++; console.log('ok - ' + name); };
const flush = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };

/** Load shipping TypeScript as CommonJS inside a context (relative imports resolve to their .ts source). */
function loader(context) {
  const cache = new Map();
  return function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const request = name => {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), name)).replace(/\.js$/, '');
      for (const candidate of [base + '.ts', base]) if (fs.existsSync(path.join(root, candidate))) return load(candidate);
      throw new Error('Unexpected module ' + name + ' in ' + file);
    };
    vm.runInContext('(function(require,module,exports){' + compile(file) + '\n})', context, { filename: file })(request, module, module.exports);
    return module.exports;
  };
}
const plain = value => JSON.parse(JSON.stringify(value));
const node = loader(vm.createContext({ console }));
const { countryLanguage, GEO_SINGLE, GEO_MULTI } = node('src/lib/geo-language.ts');
const { APP_LANGUAGES, APP_LOCALES, isAppLocale } = node('src/lib/app-language.ts');
const pick = (country, ...browser) => plain(countryLanguage(country, browser));

// ---------- 1. the map ----------
check('single-language countries get their language and region', () => {
  const expected = {
    DE: 'de-DE', AT: 'de-DE',
    FR: 'fr-FR', MC: 'fr-FR', GF: 'fr-FR', GP: 'fr-FR', MQ: 'fr-FR', RE: 'fr-FR', YT: 'fr-FR', NC: 'fr-FR', PF: 'fr-FR',
    IT: 'it-IT', SM: 'it-IT', VA: 'it-IT',
    PT: 'pt-PT', BR: 'pt-BR', AO: 'pt-PT', MZ: 'pt-PT', CV: 'pt-PT',
    MX: 'es-MX', ES: 'es-ES', AR: 'es-MX', CO: 'es-MX', CL: 'es-MX', PE: 'es-MX', UY: 'es-MX', VE: 'es-MX', GT: 'es-MX', DO: 'es-MX',
    GB: 'en-GB', IE: 'en-IE', AU: 'en-AU', NZ: 'en-AU',
  };
  for (const [country, locale] of Object.entries(expected)) {
    // The browser language never overrides a single-language country.
    for (const browser of [[], ['ja-JP'], ['es-MX', 'en-US'], ['de-DE']]) assert.deepEqual(pick(country, ...browser), { language: locale.slice(0, 2), locale }, country);
  }
});
check('multilingual countries follow the browser among their languages, then their default', () => {
  assert.deepEqual(pick('CH'), { language: 'de', locale: 'de-DE' });
  assert.deepEqual(pick('CH', 'fr-CH'), { language: 'fr', locale: 'fr-FR' });
  assert.deepEqual(pick('CH', 'it-CH', 'de-CH'), { language: 'it', locale: 'it-IT' });
  assert.deepEqual(pick('CH', 'en-US', 'fr-CH', 'de-CH'), { language: 'fr', locale: 'fr-FR' }, 'the first browser language the country speaks');
  assert.deepEqual(pick('CH', 'en-US', 'es-ES'), { language: 'de', locale: 'de-DE' }, 'default when the browser speaks none of them');
  assert.deepEqual(pick('BE'), { language: 'fr', locale: 'fr-FR' });
  assert.deepEqual(pick('BE', 'de-BE'), { language: 'de', locale: 'de-DE' });
  assert.deepEqual(pick('BE', 'nl-BE', 'fr-BE'), { language: 'en', locale: 'en-US' }, 'a Dutch browser in Belgium reads English');
  assert.deepEqual(pick('US'), { language: 'en', locale: 'en-US' }, 'the United States reads English by default');
  assert.deepEqual(pick('US', 'de-DE'), { language: 'en', locale: 'en-US' }, 'a browser language the United States list does not hold keeps English');
  assert.deepEqual(pick('US', 'es-MX', 'en-US'), { language: 'es', locale: 'es-US' }, 'a Spanish browser in the United States reads Spanish');
  assert.deepEqual(pick('BE', 'fr-BE', 'nl-BE'), { language: 'fr', locale: 'fr-FR' });
  assert.deepEqual(pick('BE', 'en-GB'), { language: 'fr', locale: 'fr-FR' });
  assert.deepEqual(pick('LU'), { language: 'fr', locale: 'fr-FR' });
  assert.deepEqual(pick('LU', 'de'), { language: 'de', locale: 'de-DE' });
  assert.deepEqual(pick('LU', 'lb-LU', 'pt-PT'), { language: 'fr', locale: 'fr-FR' });
  assert.deepEqual(pick('CA'), { language: 'en', locale: 'en-CA' });
  assert.deepEqual(pick('CA', 'fr-CA', 'en-CA'), { language: 'fr', locale: 'fr-FR' });
  assert.deepEqual(pick('CA', 'zh-CN'), { language: 'en', locale: 'en-CA' });
});
check('any other country, and anything that is not a country code, decides nothing', () => {
  for (const value of ['JP', 'NL', 'IN', 'XX', 'ZZ', 'T1', '', 'DEU', 'D', '12', ' DE', null, undefined, 49, {}, ['DE']]) assert.equal(countryLanguage(value, ['de-DE']), null, String(value));
  assert.deepEqual(pick('de'), { language: 'de', locale: 'de-DE' }, 'lowercase code');
  assert.deepEqual(pick('CH', null, undefined, 7, 'FR_ch'), { language: 'fr', locale: 'fr-FR' }, 'junk browser entries are skipped');
});
check('every mapped locale is one the app supports, and no country is mapped twice', () => {
  const seen = new Set();
  for (const [locale, countries] of Object.entries(GEO_SINGLE)) {
    assert.ok(APP_LOCALES.includes(locale), locale);
    for (const country of countries.split(' ')) { assert.match(country, /^[A-Z]{2}$/); assert.ok(!seen.has(country), country); seen.add(country); }
  }
  for (const [country, options] of Object.entries(GEO_MULTI)) {
    assert.match(country, /^[A-Z]{2}$/); assert.ok(!seen.has(country), country); assert.ok(options.length > 1);
    for (const [browser, locale] of options) { assert.match(browser, /^[a-z]{2}$/); assert.ok(APP_LOCALES.includes(locale), locale); }
  }
  for (const country of [...seen, ...Object.keys(GEO_MULTI)]) for (const browser of [[], ['nl'], ['fr'], ['de'], ['it'], ['en']]) {
    const { language, locale } = countryLanguage(country, browser);
    assert.ok(APP_LANGUAGES.includes(language)); assert.ok(isAppLocale(locale, language), country + ' ' + locale);
  }
});

// ---------- 2. parity with the inline copy in the static home ----------
const html = read('public/home/index.html');
const geoStart = html.indexOf('/* geo:start'), geoEnd = html.indexOf('/* geo:end */');
assert.ok(geoStart > 0 && geoEnd > geoStart, 'the static home carries the geo block');
const inline = vm.runInNewContext('(function(){' + html.slice(geoStart, geoEnd) + '\nreturn { GEO_SINGLE: GEO_SINGLE, GEO_MULTI: GEO_MULTI, geoLocale: geoLocale };})()');
check('the home page carries the same maps as the module', () => {
  assert.deepEqual(plain(inline.GEO_SINGLE), plain(GEO_SINGLE));
  assert.deepEqual(plain(inline.GEO_MULTI), plain(GEO_MULTI));
});
check('the home page applies the same rule as the module, for every code and browser order', () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', browsers = [[], ['en-US'], ['de-CH', 'fr'], ['fr-BE', 'nl'], ['nl-BE', 'fr-BE'], ['it_CH'], ['pt-BR'], ['es-419', 'en'], ['FR-ca', 'en-CA'], [null, 'de'], ['ja', 'nl', 'de']];
  let compared = 0;
  for (const a of letters) for (const b of letters) for (const browser of browsers) {
    assert.equal(inline.geoLocale(a + b, browser), countryLanguage(a + b, browser)?.locale ?? '', a + b + ' ' + browser); compared++;
  }
  for (const junk of ['', 'DEU', 'D', '1A', null, undefined]) assert.equal(inline.geoLocale(junk, ['de']), '');
  assert.equal(inline.geoLocale('be', ['nl']), 'en-US');
  assert.equal(compared, 26 * 26 * browsers.length);
});

// ---------- 3. the React client: precedence, cache, one request, one reload ----------
function client({ search = '', stored = {}, languages = ['en-US'], country = 'DE', denied = false, status = 200, hang = false, pathname = '/desk', active = false, body } = {}) {
  const storage = new Map(Object.entries(stored)), calls = { fetch: [], reloads: 0, aborted: 0, writes: [] }, timers = [];
  const localStorage = {
    getItem(key) { if (denied) throw new DOMException('Denied', 'SecurityError'); return storage.get(key) ?? null; },
    setItem(key, value) { if (denied) throw new DOMException('Denied', 'SecurityError'); calls.writes.push(key); storage.set(key, String(value)); },
  };
  const location = { origin: 'https://bobby.test', search, pathname, reload() { calls.reloads++; } };
  const context = vm.createContext({
    console, URL, URLSearchParams, DOMException, localStorage, AbortController,
    navigator: { language: languages[0], languages, userActivation: { hasBeenActive: active } },
    window: { location }, document: { documentElement: { lang: '' } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    fetch: (url, init) => {
      calls.fetch.push({ url, init });
      if (hang) return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => { calls.aborted++; reject(new DOMException('Aborted', 'AbortError')); }));
      return Promise.resolve({ ok: status === 200, status, json: async () => (body === undefined ? { country } : body) });
    },
  });
  return { ...loader(context)('src/lib/client-language.ts'), storage, calls, timers, location, context };
}
check('precedence: a stored choice and ?lang beat the country, the country beats the browser, English is last', () => {
  const geo = { bobby_geo: 'DE' };
  let b = client({ stored: { ...geo, bobby_lang: 'es', bobby_locale: 'es-MX' }, languages: ['fr-FR'] });
  assert.equal(b.clientLanguage(), 'es'); assert.equal(b.clientLocale(), 'es-MX');
  b = client({ stored: geo, search: '?lang=it', languages: ['fr-FR'] });
  assert.equal(b.clientLanguage(), 'it'); assert.equal(b.clientLocale(), 'it-IT');
  // What the code did with ?lang before this change is kept: it still leads over a stored choice.
  b = client({ stored: { ...geo, bobby_lang: 'es' }, search: '?lang=it' });
  assert.equal(b.clientLanguage(), 'it');
  b = client({ stored: geo, languages: ['fr-FR', 'en-US'] });
  assert.equal(b.clientLanguage(), 'de'); assert.equal(b.clientLocale(), 'de-DE');
  b = client({ stored: { bobby_geo: 'JP' }, languages: ['fr-FR', 'en-US'] });
  assert.equal(b.clientLanguage(), 'fr'); assert.equal(b.clientLocale(), 'fr-FR');
  b = client({ stored: { bobby_geo: 'JP' }, languages: ['ja-JP'] });
  assert.equal(b.clientLanguage(), 'en'); assert.equal(b.clientLocale(), 'en-US');
  b = client({ stored: { bobby_geo: 'CH' }, languages: ['en-US', 'it-CH'] });
  assert.equal(b.clientLanguage(), 'it'); assert.equal(b.clientLocale(), 'it-IT');
  for (const browser of [b]) assert.equal(browser.calls.fetch.length, 0);
});
check('the country gives the region: Portugal vs Brazil, Mexico vs Spain', () => {
  for (const [country, browser, locale] of [['PT', 'pt-BR', 'pt-PT'], ['BR', 'pt-PT', 'pt-BR'], ['AO', 'en-US', 'pt-PT'], ['MX', 'es-ES', 'es-MX'], ['ES', 'es-MX', 'es-ES'], ['AR', 'en-US', 'es-MX'], ['GB', 'en-US', 'en-GB'], ['CA', 'en-US', 'en-CA']]) {
    const b = client({ stored: { bobby_geo: country }, languages: [browser] });
    assert.equal(b.clientLocale(), locale, country); b.syncDocumentLanguage(); assert.equal(b.context.document.documentElement.lang, locale);
    assert.equal(b.calls.fetch.length, 0); assert.deepEqual(b.calls.writes, []);
  }
  // A stored region and a region in the URL still win over the country's.
  assert.equal(client({ stored: { bobby_geo: 'BR', bobby_lang: 'pt', bobby_locale: 'pt-PT' } }).clientLocale(), 'pt-PT');
  assert.equal(client({ stored: { bobby_geo: 'ES' }, search: '?lang=es&locale=es-MX' }).clientLocale(), 'es-MX');
  // The country's region applies to a chosen language it speaks, and never to another language.
  assert.equal(client({ stored: { bobby_geo: 'BR' }, search: '?lang=pt', languages: ['en-US'] }).clientLocale(), 'pt-BR');
  assert.equal(client({ stored: { bobby_geo: 'BR' }, search: '?lang=es', languages: ['en-US'] }).clientLocale(), 'es-MX');
});
check('no request at all with a stored choice, with ?lang, with a cached country, or without storage', () => {
  for (const options of [{ stored: { bobby_lang: 'es' } }, { search: '?lang=fr' }, { stored: { bobby_geo: 'DE' } }, { stored: { bobby_geo: 'JP' } }, { denied: true }]) {
    const b = client(options);
    b.clientLanguage(); b.clientLocale(); b.syncDocumentLanguage(); b.clientLanguagePath('/desk');
    assert.equal(b.calls.fetch.length, 0, JSON.stringify(options)); assert.deepEqual(b.calls.writes, []); assert.equal(b.calls.reloads, 0);
  }
});
await asyncCheck('first visit: one request, the country is cached, the page reloads into its language, bobby_lang stays unset', async () => {
  const b = client({ country: 'de', languages: ['en-US'] });
  assert.equal(b.clientLanguage(), 'en', 'the browser language until the country is known');
  b.clientLanguage(); b.clientLocale(); b.syncDocumentLanguage();
  assert.equal(b.calls.fetch.length, 1); assert.equal(b.calls.fetch[0].url, '/api/geo'); assert.equal(b.timers[0].ms, 1500);
  await flush();
  assert.equal(b.storage.get('bobby_geo'), 'DE'); assert.deepEqual(b.calls.writes, ['bobby_geo']); assert.equal(b.storage.has('bobby_lang'), false);
  assert.equal(b.calls.reloads, 1); assert.equal(b.location.search, '', 'the reload carries no ?lang');
  // The reloaded page: the cached country answers synchronously, with no request and no further reload.
  const next = client({ stored: Object.fromEntries(b.storage), languages: ['en-US'] });
  assert.equal(next.clientLanguage(), 'de'); assert.equal(next.clientLocale(), 'de-DE'); await flush();
  assert.equal(next.calls.fetch.length, 0); assert.equal(next.calls.reloads, 0);
});
await asyncCheck('first visit: no reload when the country agrees with the screen; the region is still corrected', async () => {
  const b = client({ country: 'ES', languages: ['es'] });
  assert.equal(b.clientLocale(), 'es-MX'); await flush();
  assert.equal(b.calls.reloads, 0); assert.equal(b.storage.get('bobby_geo'), 'ES'); assert.equal(b.clientLocale(), 'es-ES'); assert.equal(b.context.document.documentElement.lang, 'es-ES');
  const other = client({ country: 'JP', languages: ['fr-FR'] });
  assert.equal(other.clientLanguage(), 'fr'); await flush();
  assert.equal(other.calls.reloads, 0); assert.equal(other.clientLanguage(), 'fr'); assert.equal(other.calls.fetch.length, 1, 'asked once per page');
});
await asyncCheck('failures are ignored: bad status, junk, no country, a hung request (aborted at the timeout), a storage that does not keep the value', async () => {
  for (const options of [{ status: 500 }, { body: { country: null } }, { body: { country: 'Germany' } }, { body: { country: 49 } }, { body: null }, { body: '<html>' }]) {
    const b = client({ languages: ['en-US'], ...options });
    assert.equal(b.clientLanguage(), 'en'); await flush();
    assert.equal(b.calls.reloads, 0); assert.equal(b.storage.has('bobby_geo'), false, JSON.stringify(options)); assert.equal(b.clientLanguage(), 'en');
  }
  const hung = client({ hang: true, languages: ['en-US'] });
  assert.equal(hung.clientLanguage(), 'en'); await flush(); hung.timers[0].fn(); await flush();
  assert.equal(hung.calls.aborted, 1); assert.equal(hung.calls.reloads, 0); assert.equal(hung.clientLanguage(), 'en');
  // A storage that accepts the write and drops it could never stop a reload loop: no reload there.
  const lossy = client({ languages: ['en-US'] });
  lossy.context.localStorage.setItem = () => {};
  assert.equal(lossy.clientLanguage(), 'en'); await flush();
  assert.equal(lossy.calls.reloads, 0); assert.equal(lossy.clientLanguage(), 'en');
});
await asyncCheck('no reload under a sign-in callback or once the visitor is using the page: the country waits for the next load', async () => {
  for (const options of [{ pathname: '/auth/callback' }, { active: true }]) {
    const b = client({ country: 'DE', languages: ['en-US'], ...options });
    assert.equal(b.clientLanguage(), 'en'); await flush();
    assert.equal(b.calls.reloads, 0); assert.equal(b.storage.get('bobby_geo'), 'DE');
    assert.equal(b.clientLanguage(), 'en', 'this page keeps its language: no half-switched screen'); assert.equal(b.clientLocale(), 'en-US');
    assert.equal(client({ stored: Object.fromEntries(b.storage), languages: ['en-US'] }).clientLanguage(), 'de');
  }
});

// ---------- 4. the static home: the same precedence, one switch on a first visit, none later ----------
function home({ search = '', stored = {}, languages = ['en-US'], country = 'DE', denied = false, status = 200 } = {}) {
  const storage = new Map(Object.entries(stored)), calls = { fetch: [], writes: [], applied: [] }, timers = [];
  const element = () => { const attributes = {}; return { attributes, innerHTML: '', setAttribute(key, value) { attributes[key] = String(value); }, getAttribute: key => attributes[key] ?? null, addEventListener() {}, querySelectorAll: () => [], classList: { add() {}, remove() {} }, contains: () => false, focus() {} }; };
  const byId = {}, documentElement = {};
  let lang = '';
  Object.defineProperty(documentElement, 'lang', { get: () => lang, set(value) { lang = value; calls.applied.push(value); } });
  const document = { title: 'Bobby', documentElement, querySelector: () => null, querySelectorAll: () => [], getElementById: id => (byId[id] ??= element()), addEventListener() {}, activeElement: null };
  const localStorage = {
    getItem(key) { if (denied) throw new DOMException('Denied', 'SecurityError'); return storage.get(key) ?? null; },
    setItem(key, value) { if (denied) throw new DOMException('Denied', 'SecurityError'); calls.writes.push(key); storage.set(key, String(value)); },
  };
  const fetch = (url, init) => { calls.fetch.push({ url, init }); return Promise.resolve({ ok: status === 200, json: async () => ({ country }) }); };
  const window = { fetch, AbortController };
  const context = vm.createContext({ console, URL, URLSearchParams, RegExp, DOMException, AbortController, document, localStorage, fetch, window, location: { search, origin: 'https://bobby.test' },
    navigator: { language: languages[0], languages }, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, requestAnimationFrame() {} });
  const marker = html.indexOf('/* geo:start'), start = html.lastIndexOf('<script>', marker), end = html.indexOf('</script>', marker);
  vm.runInContext(html.slice(start + '<script>'.length, end), context, { filename: 'public/home/index.html' });
  return { i18n: window.BobbyI18n, storage, calls, timers };
}
check('home: the same precedence and the same regions as the React client', () => {
  const cases = [
    [{ stored: { bobby_geo: 'DE', bobby_lang: 'es', bobby_locale: 'es-MX' }, languages: ['fr-FR'] }, 'es', 'es-MX'],
    [{ stored: { bobby_geo: 'DE' }, search: '?lang=it', languages: ['fr-FR'] }, 'it', 'it-IT'],
    [{ stored: { bobby_geo: 'DE', bobby_lang: 'es' }, search: '?lang=it' }, 'it', 'it-IT'],
    [{ stored: { bobby_geo: 'DE' }, languages: ['fr-FR', 'en-US'] }, 'de', 'de-DE'],
    [{ stored: { bobby_geo: 'JP' }, languages: ['fr-FR'] }, 'fr', 'fr-FR'],
    [{ stored: { bobby_geo: 'JP' }, languages: ['ja-JP'] }, 'en', 'en-US'],
    [{ stored: { bobby_geo: 'CH' }, languages: ['en-US', 'it-CH'] }, 'it', 'it-IT'],
    [{ stored: { bobby_geo: 'BE' }, languages: ['nl-BE'] }, 'en', 'en-US'],
    [{ stored: { bobby_geo: 'PT' }, languages: ['pt-BR'] }, 'pt', 'pt-PT'],
    [{ stored: { bobby_geo: 'BR' }, languages: ['pt-PT'] }, 'pt', 'pt-BR'],
    [{ stored: { bobby_geo: 'ES' }, languages: ['es-MX'] }, 'es', 'es-ES'],
    [{ stored: { bobby_geo: 'MX' }, languages: ['es-ES'] }, 'es', 'es-MX'],
    [{ stored: { bobby_geo: 'BR', bobby_lang: 'pt', bobby_locale: 'pt-PT' } }, 'pt', 'pt-PT'],
    [{ stored: { bobby_geo: 'ES' }, search: '?lang=es&locale=es-MX' }, 'es', 'es-MX'],
    [{ stored: { bobby_geo: 'BR' }, search: '?lang=pt', languages: ['en-US'] }, 'pt', 'pt-BR'],
    [{ stored: { bobby_geo: 'BR' }, search: '?lang=es', languages: ['en-US'] }, 'es', 'es-MX'],
    // Unchanged without a country: Portuguese reads the browser's region, the others keep their default.
    [{ stored: { bobby_geo: 'JP' }, languages: ['pt-BR'] }, 'pt', 'pt-BR'],
    [{ stored: { bobby_lang: 'pt' }, languages: ['en-US'] }, 'pt', 'pt-PT'],
    [{ stored: { bobby_lang: 'en' }, languages: ['en-GB'] }, 'en', 'en-US'],
    [{ denied: true, languages: ['de-AT'] }, 'de', 'de-DE'],
  ];
  for (const [options, language, locale] of cases) {
    const page = home(options), react = client(options);
    assert.equal(page.i18n.lang(), language, JSON.stringify(options)); assert.equal(page.i18n.locale(), locale, JSON.stringify(options));
    assert.equal(page.calls.fetch.length, 0, 'no request: ' + JSON.stringify(options)); assert.deepEqual(page.calls.writes, []);
    assert.equal(page.calls.applied.length, 1, 'painted once, never switched');
    // The React client agrees wherever the home's own rules did not already differ (it reads the browser's region for every language).
    if (!(options.stored?.bobby_lang === 'en' && options.languages?.[0] === 'en-GB')) { assert.equal(react.clientLanguage(), language); assert.equal(react.clientLocale(), locale, JSON.stringify(options)); }
  }
});
await asyncCheck('home: a first visit asks once, caches the country, switches once, and never writes bobby_lang', async () => {
  const first = home({ country: 'DE', languages: ['en-US'] });
  assert.equal(first.i18n.lang(), 'en'); assert.equal(first.calls.fetch.length, 1); assert.equal(first.calls.fetch[0].url, '/api/geo'); assert.equal(first.timers[0].ms, 1500);
  await flush();
  assert.equal(first.i18n.lang(), 'de'); assert.equal(first.i18n.locale(), 'de-DE'); assert.deepEqual(first.calls.applied, ['en-US', 'de-DE']);
  assert.deepEqual(first.calls.writes, ['bobby_geo']); assert.equal(first.storage.get('bobby_geo'), 'DE'); assert.equal(first.storage.has('bobby_lang'), false);
  const later = home({ stored: Object.fromEntries(first.storage), languages: ['en-US'] });
  await flush();
  assert.equal(later.i18n.lang(), 'de'); assert.deepEqual(later.calls.applied, ['de-DE'], 'later visits paint the right language first: no flash'); assert.equal(later.calls.fetch.length, 0);
  // Same language, other region: one quiet correction.
  const spain = home({ country: 'ES', languages: ['es-ES'] });
  assert.equal(spain.i18n.locale(), 'es-MX'); await flush(); assert.equal(spain.i18n.locale(), 'es-ES');
  // Nothing to switch, nothing switched; failures and a late answer leave the page alone.
  const same = home({ country: 'US', languages: ['en-US'] }); await flush(); assert.deepEqual(same.calls.applied, ['en-US']); assert.equal(same.storage.get('bobby_geo'), 'US');
  const failed = home({ status: 500, languages: ['en-US'] }); await flush(); assert.deepEqual(failed.calls.applied, ['en-US']); assert.equal(failed.storage.has('bobby_geo'), false);
  const unknown = home({ country: null, languages: ['en-US'] }); await flush(); assert.deepEqual(unknown.calls.applied, ['en-US']); assert.equal(unknown.storage.has('bobby_geo'), false);
  const late = home({ country: 'DE', languages: ['en-US'] }); late.timers[0].fn(); await flush();
  assert.deepEqual(late.calls.applied, ['en-US']); assert.equal(late.storage.get('bobby_geo'), 'DE', 'kept for the next visit');
});

// ---------- 5. GET /api/geo ----------
const geoSource = read('api/geo.ts');
const api = loader(vm.createContext({ console: { log() { throw new Error('the handler must not log'); }, error() { throw new Error('the handler must not log'); } } }))('api/geo.ts');
function call(method, headers) {
  const res = { headers: {}, statusCode: 0, body: undefined, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  api.default({ method, headers }, res); return res;
}
check('/api/geo returns the country header as two uppercase letters, or null', () => {
  for (const [value, country] of [['DE', 'DE'], ['de', 'DE'], [' br ', 'BR'], [['MX', 'US'], 'MX'], ['XX', 'XX'], ['', null], [undefined, null], ['DEU', null], ['D', null], ['4 ', null], ['D1', null], ['<script>', null], ['de-DE', null]]) {
    const res = call('GET', { 'x-vercel-ip-country': value, 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.7' });
    assert.equal(res.statusCode, 200); assert.deepEqual(plain(res.body), { country }, String(value));
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.ok(!JSON.stringify(res.body).includes('203.0.113.7'));
  }
});
check('/api/geo is GET only and never touches the address', () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', undefined]) {
    const res = call(method, { 'x-vercel-ip-country': 'DE' });
    assert.equal(res.statusCode, 405); assert.equal(typeof res.body.error, 'string'); assert.equal(res.body.country, undefined); assert.equal(res.headers['cache-control'], 'private, no-store');
  }
  assert.deepEqual(plain(api.config), { maxDuration: 5 });
  const code = geoSource.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n');
  assert.ok(!/forwarded|real-ip|remoteAddress|socket|console\.|process\.env/i.test(code), 'only the country header is read; nothing is logged');
  assert.deepEqual([...code.matchAll(/headers\[['"]([^'"]+)['"]\]/g)].map(match => match[1]), ['x-vercel-ip-country']);
  assert.ok(JSON.parse(read('tsconfig.api.json')).include.includes('api/geo.ts'), 'type-checked with the other handlers');
});
check('neither client stores or sends anything but the country code', () => {
  const clientSource = read('src/lib/client-language.ts');
  assert.deepEqual([...clientSource.matchAll(/fetch\(([^,)]+)/g)].map(match => match[1]), ["'/api/geo'"]);
  assert.ok(!/setItem\(['"]bobby_lang['"]/.test(clientSource.slice(0, clientSource.indexOf('export function rememberClientLanguage'))), 'country detection never writes the choice');
});

console.log(`\n${checks} geo language checks passed`);
