// Offline release audit: execute real auth-page code with inert providers and timers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const repository = path.resolve(__dirname, '..');
const source = filename => fs.readFileSync(path.join(repository, filename), 'utf8');
const sharedSource = source('src/lib/companions/web-translations.ts');
const shared = JSON.parse(sharedSource.slice(sharedSource.indexOf('= {') + 2).replace(/;\s*$/, ''));
// Use the committed production catalog; no work files or real account data.
const catalog = shared;
let tests = 0;
function environment(language, options = {}) {
  const calls = { oauth: [], assigned: [], navigated: [], history: [], toast: [], getSession: 0, legacyCallback: 0, refresh: 0 };
  const states = [], effects = [], timers = [];
  const storage = options.storage || new Map();
  if (!options.storage && options.persistedLanguage !== null) storage.set('bobby_lang', language);
  const params = new URLSearchParams({ ...(options.omitLanguageQuery ? {} : { lang: language }), ...(options.params || {}) });
  const location = { origin: 'https://bobbyprotocol.example', search: '?' + params, hash: options.hash || '', href: 'https://bobbyprotocol.example/auth/callback?' + params + (options.hash || ''), assign: value => calls.assigned.push(value) };
  const context = vm.createContext({ URL, URLSearchParams, navigator: { language: options.deviceLanguage || (language === 'pt' ? 'pt-BR' : language) }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, window: { location, history: { replaceState: (_state, _title, url) => calls.history.push(url) }, setTimeout: fn => timers.push(fn) }, document: { title: 'Audit' }, setTimeout: fn => timers.push(fn), console: { error() {}, log() {} }, fetch: () => { throw new Error('Network is forbidden in the offline audit'); } });
  const transpile = filename => ts.transpileModule(source(filename), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const cache = {};
  const react = {
    useState(initial) { const index = states.length; states.push(typeof initial === 'function' ? initial() : initial); return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useEffect(fn) { effects.push(fn); }, useMemo(fn) { return fn(); }, useRef(value) { return { current: value }; }, useCallback(fn) { return fn; },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const auth = { async signInWithOAuth(input) { calls.oauth.push(input); if (options.oauthError) return { error: new Error('Inert provider unavailable') }; return { data: { url: options.providerUrl || 'https://test.supabase.co/auth/v1/authorize?provider=' + input.provider } }; }, async getSession() { calls.getSession++; if (options.sessionError) throw new Error('Inert session unavailable'); return { data: { session: options.session ? { user: { id: 'inert-audit-user' } } : null } }; } };
  const toast = Object.fromEntries(['info','error','success'].map(kind => [kind, message => calls.toast.push({ kind, message })]));
  const requireModule = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react-helmet-async') return { Helmet: 'Helmet' };
    if (name === 'react-router-dom') return { useNavigate: () => (path, settings) => calls.navigated.push({ path, settings }), useSearchParams: () => [params] };
    if (name === '@/lib/bobby-db-client') return { bobbySupabase: () => ({ auth }) };
    if (name === '@/lib/track') return { track() {} };
    if (name === '@/lib/access-client') return { takeReturn: () => options.back || null };
    if (name === '@/hooks/useAuth') return { useAuth: () => ({ async handleAuthCallback() { calls.legacyCallback++; return { error: options.legacyError || null }; }, async refreshUser() { calls.refresh++; return null; } }) };
    if (name === 'sonner') return { toast };
    if (name === 'lucide-react') return { Loader2: 'Loader2', CheckCircle2: 'CheckCircle2', AlertCircle: 'AlertCircle', ShieldCheck: 'ShieldCheck' };
    if (name === '@/components/ui/card') return { Card: 'Card', CardContent: 'CardContent' };
    if (name === '@/components/ui/alert') return { Alert: 'Alert', AlertDescription: 'AlertDescription' };
    if (name === './web-translations') return { WEB_TRANSLATIONS: catalog };
    if (name === '../app-language' || name === './app-language') return load('src/lib/app-language.ts');
    if (name === '../client-language' || name === '@/lib/client-language') return load('src/lib/client-language.ts');
    if (name === '@/lib/companions/i18n') return load('src/lib/companions/i18n.ts');
    if (name === './geo-language') return load('src/lib/geo-language.ts');
    throw new Error('Unexpected dependency: ' + name);
  };
  function load(filename) { if (cache[filename]) return cache[filename]; const module = { exports: {} }; cache[filename] = module.exports; const wrapper = vm.runInContext('(function(require,module,exports){' + transpile(filename) + '\n})', context); wrapper(requireModule, module, module.exports); cache[filename] = module.exports; return module.exports; }
  return { calls, states, effects, timers, storage, render: filename => load(filename).default(), i18n: () => load('src/lib/companions/i18n.ts') };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function nodes(node, type) { const found = []; if (!node || typeof node !== 'object') return found; if (node.type === type) found.push(node); for (const child of [node.props?.children].flat(Infinity)) found.push(...nodes(child, type)); return found; }
const signin = 'src/pages/BobbySignInPage.tsx', callback = 'src/pages/AuthCallback.tsx';
(async () => {
 for (const language of ['en','es','fr','pt','it','de']) {
  let env = environment(language), tree = env.render(signin), text = env.i18n();
  assert.equal(nodes(tree, 'title')[0].props.children, text.t('Sign in | Bobby', 'Iniciar sesión | Bobby'));
  assert.equal(nodes(tree, 'Helmet')[0].props.htmlAttributes.lang, language === 'pt' ? 'pt-BR' : ({en:'en-US',es:'es-MX',fr:'fr-FR',it:'it-IT',de:'de-DE'})[language]);
  assert.deepEqual(nodes(tree, 'a').map(node => new URL(node.props.href, 'https://bobbyprotocol.example').pathname), ['/', '/desk', '/privacy']); tests++;
  for (const [index, provider] of [[0,'apple'],[1,'google']]) {
   env = environment(language); tree = env.render(signin); nodes(tree,'button')[index].props.onClick(); await flush();
   assert.equal(env.calls.oauth[0].provider, provider); const redirect = new URL(env.calls.oauth[0].options.redirectTo); assert.equal(redirect.origin + redirect.pathname, 'https://bobbyprotocol.example/auth/callback'); assert.equal(redirect.searchParams.get('source'),'bobby'); assert.equal(redirect.searchParams.get('lang'), language); assert.equal(env.calls.oauth[0].options.skipBrowserRedirect,true); assert.equal(env.calls.assigned.length,1);
   env.timers.forEach(timer => timer());
   const brand = provider === 'apple' ? 'Apple' : 'Google';
   assert.equal(env.states[1], env.i18n().t(`The browser did not open ${brand}. Tap the link below to continue.`, `El navegador no abrió ${brand}. Toca el enlace de abajo para continuar.`));
   if(!['en','es'].includes(language)) assert(!env.states[1].startsWith('The browser'));
   tests++;
  }
  env = environment(language, { providerUrl: 'https://attacker.example/authorize' }); tree = env.render(signin); nodes(tree,'button')[0].props.onClick(); await flush();
  assert.equal(env.calls.assigned.length,0); assert.equal(env.states[1],env.i18n().t('That sign-in method is not available right now. Try the other one.','Ese método de acceso no está disponible ahora. Prueba el otro.')); tests++;
  env = environment(language,{ session:true, hash:'#access_token=INERT&refresh_token=INERT', back:'/redeem?lang='+language }); env.render(callback); env.effects[0](); env.effects[0](); await flush(); env.timers.forEach(timer=>timer());
  assert.equal(env.calls.getSession,1); assert.equal(env.calls.legacyCallback,0); const destination = new URL(env.calls.navigated[0].path, 'https://bobbyprotocol.example'); assert.equal(destination.pathname,'/redeem'); assert.equal(destination.searchParams.get('lang'), language); assert.equal(env.states[0],'success'); assert.equal(env.states[1],env.i18n().t('Signed in. Returning…','Sesión iniciada. Volviendo…')); assert(env.calls.history.every(url=>!url.includes('token')&&!url.includes('#'))); tests++;
  env = environment(language,{params:{error:'access_denied'}}); env.render(callback); env.effects[0](); await flush(); env.timers.forEach(timer=>timer());
  assert.equal(env.calls.getSession,0); assert.equal(env.states[1],env.i18n().t('Access denied. Please try again.','Acceso denegado. Por favor intenta de nuevo.')); assert.equal(env.calls.navigated[0].path,'/login'); assert(env.calls.history.every(url=>!url.includes('error='))); tests++;
  env = environment(language); env.render(callback); env.effects[0](); await flush(); env.timers.forEach(timer=>timer());
  assert.equal(env.states[1],env.i18n().t('Authentication parameters are missing.','Parámetros de autenticación faltantes.')); assert.equal(env.calls.navigated[0].path,'/login'); tests++;
  env = environment(language,{params:{code:'INERT_CODE'},legacyError:{code:'invalid_grant',message:'invalid_grant'}}); env.render(callback); env.effects[0](); await flush(); env.timers.forEach(timer=>timer());
  assert.equal(env.states[1],env.i18n().t('Invalid or already used link.','Enlace inválido o ya utilizado.')); assert.equal(env.calls.navigated[0].path,'/login'); assert.equal(env.calls.refresh,0); assert(env.calls.history.every(url=>!url.includes('code='))); tests++;
  env = environment(language,{params:{code:'INERT_CODE',type:'signup',redirect_to:'//attacker.example/steal'}}); env.render(callback); env.effects[0](); await flush(); env.timers.forEach(timer=>timer());
  assert.equal(env.calls.navigated[0].path,'/'); assert.equal(env.states[1],'¡Cuenta verificada exitosamente!'); tests++;
  env = environment(language,{params:{code:'INERT_CODE'},sessionError:true}); env.render(callback); env.effects[0](); await flush(); env.timers.forEach(timer=>timer());
  assert.equal(env.states[1],env.i18n().t('An unexpected error occurred.','Ocurrió un error inesperado.')); assert.equal(env.calls.navigated[0].path,'/login'); tests++;
  env = environment(language,{params:{error:'legacy_provider_error',error_description:'Legacy provider diagnostic'}}); env.render(callback); env.effects[0](); await flush(); env.timers.forEach(timer=>timer());
  assert.equal(env.states[1],'Legacy provider diagnostic'); assert.equal(env.calls.navigated[0].path,'/login'); assert.equal(env.calls.legacyCallback,0); tests++;
  env = environment(language,{params:{code:'INERT_RECOVERY',type:'recovery'}}); env.render(callback); env.effects[0](); await flush(); env.timers.forEach(timer=>timer());
  assert.equal(env.calls.legacyCallback,1); assert.equal(env.calls.navigated[0].path,'/reset-password?token=INERT_RECOVERY&type=recovery'); assert.equal(env.states[1],'Verificación exitosa. Ahora puedes cambiar tu contraseña.'); tests++;
 }
 const selected = environment('fr', { persistedLanguage:null, deviceLanguage:'en-US' });
 const selectedTree = selected.render(signin); nodes(selectedTree,'button')[0].props.onClick(); await flush();
 assert.equal(selected.storage.get('bobby_lang'),'fr'); assert.equal(selected.storage.get('bobby_locale'),'fr-FR');
 const returned = environment('en',{ omitLanguageQuery:true, storage:selected.storage, deviceLanguage:'en-US', params:{error:'access_denied'} });
 returned.render(callback); returned.effects[0](); await flush();
 assert.equal(returned.states[1],'Accès refusé. Veuillez réessayer.'); tests++;
 const brazilStore = new Map([['bobby_lang','pt-BR']]);
 const brazil = environment('pt',{ omitLanguageQuery:true, storage:brazilStore, deviceLanguage:'en-US' });
 const brazilTree=brazil.render(signin); nodes(brazilTree,'button')[0].props.onClick(); await flush();
 assert.equal(brazil.storage.get('bobby_lang'),'pt'); assert.equal(brazil.storage.get('bobby_locale'),'pt-BR'); tests++;
 const result={result:'PASS',checks:tests,languages:['en','es','fr','pt','it','de'],networkCalls:0,realLogins:0,scope:['localized page/title/status','Apple/Google provider arguments','allowed Supabase host guard','blocked navigation fallback','device-selected pt-BR HTML locale','StrictMode single processing','preserved return and login destinations','sensitive URL cleanup','legacy signup copy retained','open-redirect rejection','URL-selected locale survives OAuth return']};
 console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
