// Exercise shipping discovery from typed/dictated multilingual prose, offline.
// This proves text-to-instrument routing and confirmation, not microphone accuracy.
import assert from 'node:assert/strict';
import handler from '../api/bobby-asset-search.js';
import { __setTestCatalog, resolveOkxAssetFromText } from '../src/lib/okx-asset-search.js';
import { resolveRegionalStock } from '../src/lib/regional-stocks.js';

const spot = (base: string) => ({ instId: `${base}-USDT`, instType: 'SPOT' as const, state: 'live', baseCcy: base, quoteCcy: 'USDT' });
const equity = (base: string) => ({ instId: `${base}-USDT-SWAP`, instType: 'SWAP' as const, state: 'live', ctValCcy: base, settleCcy: 'USDT', instCategory: '3' });
__setTestCatalog([
  ...['BTC','ETH','SOL','SONIC','MAIN','NET','XAUT','XAG','ONE','NEAR','HOT','GAS','OR','DE','ADA','TON','SEI','SUI','DAI','UMA','ENS','ONT','STABLE','PERP','COMP','DASH','MANA'].map(spot),
  ...['NVDA','PLTR','USO','SAP','TSLA','COST'].map(equity),
]);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Unexpected network: multilingual discovery must use the fixture catalogue/local listings'); };

const locales = [
  { lang: 'es', locale: 'es-MX', country: 'MX', bitcoin: '¿Cuáles son los riesgos de Bitcoin hoy?', nvidia: '¿Qué opinas de NVIDIA esta semana?', ethereum: 'Analiza Ethereum.', empty: '¿Qué puedo hacer hoy?' },
  { lang: 'en', locale: 'en-US', country: 'US', bitcoin: 'What are the main risks in Bitcoin right now?', nvidia: "What do you think of NVIDIA’s current chart?", ethereum: 'Analyse Ethereum.', empty: 'What can I do today?' },
  { lang: 'fr', locale: 'fr-FR', country: 'FR', bitcoin: 'Quels sont les risques du Bitcoin aujourd’hui ?', nvidia: 'Que penses-tu de NVIDIA cette semaine ?', ethereum: 'Que penses-tu de l’Ethereum ?', empty: 'Que puis-je faire aujourd’hui ?' },
  { lang: 'pt', locale: 'pt-PT', country: 'PT', bitcoin: 'Quais são os riscos do Bitcoin hoje?', nvidia: 'Vale a pena analisar NVIDIA agora?', ethereum: 'Analisa Ethereum, por favor.', empty: 'O que posso fazer hoje?' },
  { lang: 'pt', locale: 'pt-BR', country: 'BR', bitcoin: 'Quais são os riscos do Bitcoin hoje?', nvidia: 'Vale a pena analisar NVIDIA agora?', ethereum: 'Analise Ethereum, por favor.', empty: 'O que posso fazer hoje?' },
  { lang: 'it', locale: 'it-IT', country: 'IT', bitcoin: 'Quali sono i rischi di Bitcoin oggi?', nvidia: 'Cosa pensi di NVIDIA questa settimana?', ethereum: 'Cosa pensi dell’Ethereum?', empty: 'Che cosa posso fare oggi?' },
  { lang: 'de', locale: 'de-DE', country: 'DE', bitcoin: 'Wie sieht der Bitcoin-Preis heute aus?', nvidia: 'Was hältst du von NVIDIA diese Woche?', ethereum: 'Bitte analysiere Ethereum.', empty: 'Was kann ich heute machen?' },
];
let checks = 0;
const failures: string[] = [];
async function check(label: string, run: () => unknown | Promise<unknown>) {
  try { await run(); checks++; } catch (error) { failures.push(`${label}: ${error instanceof Error ? error.message : error}`); }
}
async function request(q: string, region: typeof locales[number]) {
  let status = 0; let payload: any;
  const headers: Record<string,string> = {};
  const response = { setHeader(k: string, v: string) { headers[k] = v; }, status(n: number) { status = n; return this; }, json(body: any) { payload = body; return this; } };
  await handler({ method: 'POST', body: { q, language: region.lang, locale: region.locale, country: region.country }, query: {} } as any, response as any);
  assert.equal(status, 200);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(payload.query, q.trim()); // Unicode question remains intact.
  return payload;
}

try {
  for (const region of locales) {
    for (const [text, symbol] of [[region.bitcoin,'BTC'],[region.nvidia,'NVDA'],[region.ethereum,'ETH']] as const) {
      for (const question of [text, text.toLocaleLowerCase(), text.normalize('NFD')]) {
        await check(`${region.locale} resolver ${question}`, async () => {
          const hit = await resolveOkxAssetFromText(question);
          assert.equal(hit?.instrument.symbol, symbol);
          assert.equal(hit?.matchKind, 'exact');
          assert.equal(hit?.needsConfirmation, false);
        });
        await check(`${region.locale} HTTP ${question}`, async () => {
          const result = await request(question, region);
          assert.equal(result.resolved?.symbol, symbol);
          assert.equal(result.resolution?.matchKind, 'exact');
          assert.equal(result.resolution?.needsConfirmation, false);
        });
      }
    }
    await check(`${region.locale} no named asset`, async () => {
      const result = await request(region.empty, region);
      assert.ok(!result.resolved || result.resolution?.needsConfirmation, 'ordinary vocabulary must never start an unconfirmed asset analysis');
    });
    for (const [typo, symbol] of [['bitcoinn','BTC'],['ethereun','ETH'],['palantr','PLTR']] as const) {
      await check(`${region.locale} typo needs confirmation ${typo}`, async () => {
        const result = await request(typo, region);
        assert.equal(result.resolved?.symbol, symbol);
        assert.equal(result.resolution?.needsConfirmation, true);
        assert.equal(result.resolution?.matchKind, 'fuzzy');
      });
    }
  }
  const regional = [
    ['fr-FR','Que penses-tu de L’Oréal ?', 'OR.PA', 'EUR', 'Euronext Paris'],
    ['fr-FR','Analyse MC.PA.', 'MC.PA', 'EUR', 'Euronext Paris'],
    ['pt-PT','Quais são os riscos de EDP.LS?', 'EDP.LS', 'EUR', 'Euronext Lisbon'],
    ['pt-PT','Analisa Galp Energia.', 'GALP.LS', 'EUR', 'Euronext Lisbon'],
    ['pt-BR','Como está a Petrobras hoje?', 'PETR4.SA', 'BRL', 'B3 São Paulo'],
    ['pt-BR','Analise VALE3.SA.', 'VALE3.SA', 'BRL', 'B3 São Paulo'],
    ['it-IT','Cosa pensi di ENEL.MI?', 'ENEL.MI', 'EUR', 'Euronext Milan'],
    ['it-IT','Analizza Intesa Sanpaolo.', 'ISP.MI', 'EUR', 'Euronext Milan'],
    ['de-DE','Bitte analysiere SAP.DE.', 'SAP.DE', 'EUR', 'Xetra'],
    ['de-DE','Was hältst du von Siemens?', 'SIE.DE', 'EUR', 'Xetra'],
    ['fr-FR','Que penses-tu d’Enel ?', 'ENEL.MI', 'EUR', 'Euronext Milan'],
    ['it-IT','Cosa pensi dell’Enel?', 'ENEL.MI', 'EUR', 'Euronext Milan'],
    ['pt-PT','Quais são os riscos da EDP hoje?', 'EDP.LS', 'EUR', 'Euronext Lisbon'],
    ['de-DE','Wie sieht der Siemens-Kurs aus?', 'SIE.DE', 'EUR', 'Xetra'],
  ] as const;
  for (const [locale, question, symbol, currency, exchange] of regional) {
    const region = locales.find(row => row.locale === locale)!;
    await check(`${locale} cash listing resolver ${question}`, () => assert.equal(resolveRegionalStock(question)?.symbol, symbol));
    await check(`${locale} cash listing HTTP ${question}`, async () => {
      const result = await request(question, region);
      assert.equal(result.resolved?.symbol, symbol);
      assert.equal(result.resolved?.currency, currency);
      assert.equal(result.resolved?.exchange, exchange);
      assert.equal(result.resolved?.provider, 'yahoo');
      assert.equal(result.resolution?.needsConfirmation, false);
      assert.equal(result.resolved?.last, null);
    });
  }
  for (const literal of ['ONE','NEAR','HOT','GAS','OR','DE','SAP']) {
    await check(`explicit homonym ticker ${literal}`, async () => assert.equal((await resolveOkxAssetFromText(literal))?.instrument.symbol, literal));
  }
  for (const [text, symbol] of [['Bitcoin-Preis','BTC'],['Ethereum-Kurs','ETH'],['Bitcoin-Preis?','BTC'],['BTC-USDT','BTC'],['l’Ethereum','ETH'],["dell'Ethereum",'ETH']] as const) {
    await check(`isolated asset expression ${text}`, async () => {
      const hit = await resolveOkxAssetFromText(text);
      assert.equal(hit?.instrument.symbol, symbol);
      assert.equal(hit?.matchKind, 'exact');
      assert.equal(hit?.needsConfirmation, false);
    });
  }
  for (const question of ['Can you give a gas-free Bitcoin analysis?', 'Is a near-term Bitcoin review useful?', 'Could you review a one-week Bitcoin chart?']) {
    await check(`hyphenated ordinary words cannot replace named Bitcoin: ${question}`, async () => {
      const result = await request(question, locales[1]);
      assert.equal(result.resolved?.symbol, 'BTC');
      assert.equal(result.resolution?.needsConfirmation, false);
    });
  }
  await check('near-term without an asset never analyzes the NEAR token', async () => {
    const result = await request('Please give a near-term view', locales[1]);
    assert.ok(!result.resolved || result.resolution?.needsConfirmation);
  });
  await check('bare VALE remains ambiguous', () => assert.equal(resolveRegionalStock('vale'), null));
  // A ticker that is an everyday word of the interface language is the asset only alone or in capitals.
  const region = (locale: string) => locales.find(row => row.locale === locale)!;
  for (const [locale, question, symbol] of [
    ['fr-FR','Quel est ton avis sur Nvidia ?','NVDA'], ['fr-FR','Quel est ton avis sur Tesla ?','TSLA'], ['fr-FR','Quels risques ont les actions Tesla ?','TSLA'],
    ['it-IT','Sei sicuro che Bitcoin salirà?','BTC'], ['it-IT','L’effetto dei tassi sui Bitcoin','BTC'], ['it-IT','Sei ottimista su Tesla?','TSLA'], ['it-IT','Dai dati, come va Ethereum?','ETH'],
    ['pt-PT','É uma boa altura para comprar Tesla?','TSLA'], ['pt-BR','Sei que o Bitcoin caiu, e agora?','BTC'],
    ['de-DE','Was hältst du von Tesla?','TSLA'],
    ['fr-FR','Que penses-tu de TON ?','TON'], ['it-IT','Cosa pensi di SUI?','SUI'], ['fr-FR','ton','TON'], ['it-IT','sei','SEI'], ['it-IT','sui','SUI'], ['it-IT','dai','DAI'], ['pt-PT','uma','UMA'],
    ['en-US','TON','TON'], ['es-MX','ENS','ENS'], ['en-US','SAP','SAP'], ['fr-FR','OR','OR'],
  ] as const) {
    await check(`${locale} homonym ticker: ${question}`, async () => {
      const result = await request(question, region(locale));
      assert.equal(result.resolved?.symbol, symbol);
      assert.equal(result.resolution?.needsConfirmation, false);
    });
  }
  for (const [locale, question] of [
    ['fr-FR','Quel est ton avis sur le marché ?'], ['fr-FR','C’est le moment d’investir ?'], ['it-IT','Come sta il mercato oggi?'], ['it-IT','Sei sicuro?'],
    ['pt-PT','É uma boa altura para investir?'], ['de-DE','Was ist mit dem Markt?'], ['de-DE','Wie steht das Gas heute?'], ['de-DE','Kann man jetzt kaufen?'],
  ] as const) {
    await check(`${locale} filler never names an asset: ${question}`, async () => {
      const result = await request(question, region(locale));
      assert.equal(result.resolved, null);
    });
  }
  // A local company named inside a sentence resolves at home; elsewhere the short name stays the other listing.
  await check('de-DE SAP inside a sentence is the Xetra listing', async () => {
    assert.equal((await request('Was hältst du von SAP?', region('de-DE'))).resolved?.symbol, 'SAP.DE');
    assert.equal((await request('SAP', region('de-DE'))).resolved?.symbol, 'SAP.DE');
    assert.equal((await request('What do you think of SAP?', region('en-US'))).resolved?.symbol, 'SAP');
    assert.equal(resolveRegionalStock('SAP'), null);
  });
  await check('search-as-you-type keeps cash listings beside the crypto catalogue', async () => {
    assert.deepEqual((await request('Siem', region('de-DE'))).results.map((row: any) => row.symbol), ['SIE.DE']);
    assert.ok((await request('SAP', region('en-US'))).results.some((row: any) => row.symbol === 'SAP.DE'));
    assert.ok(!(await request('TON', region('fr-FR'))).results.some((row: any) => row.symbol === 'MC.PA'));
    assert.ok(!(await request('ENS', region('de-DE'))).results.some((row: any) => row.symbol === 'SIE.DE'));
  });
  for (const symbol of ['MC.PA','OR.PA','EDP.LS','GALP.LS','PETR4.SA','VALE3.SA','ISP.MI','ENEL.MI','SAP.DE','SIE.DE']) {
    await check(`canonical cash listing ${symbol}`, async () => {
      assert.equal(resolveRegionalStock(symbol)?.symbol, symbol);
      assert.equal((await request(symbol, locales[1])).resolved?.symbol, symbol);
    });
  }
} finally { globalThis.fetch = originalFetch; }
console.log(JSON.stringify({ checksPassed: checks, checksFailed: failures.length, failures, evidence: 'Actual text resolver and HTTP discovery; local fixture catalogue, no microphone or AI' }, null, 2));
assert.equal(failures.length, 0, `${failures.length} multilingual asset checks failed`);
