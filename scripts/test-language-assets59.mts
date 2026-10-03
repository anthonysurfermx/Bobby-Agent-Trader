// Exercise shipping discovery from typed/dictated multilingual prose, offline.
// This proves text-to-instrument routing and confirmation, not microphone accuracy.
import assert from 'node:assert/strict';
import handler from '../api/bobby-asset-search.js';
import { __setTestCatalog, resolveOkxAssetFromText } from '../src/lib/okx-asset-search.js';
import { regionalMentions, resolveRegionalStock } from '../src/lib/regional-stocks.js';

const spot = (base: string) => ({ instId: `${base}-USDT`, instType: 'SPOT' as const, state: 'live', baseCcy: base, quoteCcy: 'USDT' });
const equity = (base: string) => ({ instId: `${base}-USDT-SWAP`, instType: 'SWAP' as const, state: 'live', ctValCcy: base, settleCcy: 'USDT', instCategory: '3' });
const perp = (base: string) => ({ instId: `${base}-USDT-SWAP`, instType: 'SWAP' as const, state: 'live', ctValCcy: base, settleCcy: 'USDT', instCategory: '1' });
__setTestCatalog([
  ...['BTC','ETH','SOL','SONIC','MAIN','NET','XAUT','XAG','ONE','NEAR','HOT','GAS','OR','DE','ADA','TON','SEI','SUI','DAI','UMA','ENS','ONT','STABLE','PERP','COMP','DASH','MANA','MEME'].map(spot),
  ...['NVDA','PLTR','USO','SAP','TSLA','COST'].map(equity),
]);
// The shape of the live catalogue on 2026-10-03: TON, DAI, OR and SAP are NOT listed, and the tickers that collide
// with everyday words are (MEME, LINK, NEAR, ONE, GAS, FLOW, MASK, PEOPLE, SAFE, NOT, O, the HYUNDAI that holds "DAI").
const LIVE_SHAPED = [
  ...['BTC','ETH','SOL','XRP','DOGE','ADA','LINK','DOT','NEAR','ONE','GAS','FLOW','MASK','PEOPLE','MEME','SUI','SEI','UMA','GRT','CRV','COMP',
    'ONDO','ORBS','ORDI','SAFE','PUMP','MOVE','CORE','DATA','NOT','TRUMP','HYPE','ALGO','TIA','TAO','XAUT','PAXG','BCH','ETC','SONIC','XLM',
    'DOOD','KITE','STX','AI','OL','USDC','ATH','NFT','GMT','LUNA','MINA','LEO','FOGO','ROBO','ZEN','ACH','SAND','ACT','ENS','ONT','MON','PEPE',
    'WIF','ICP','AGLD'].map(spot),
  ...['HYUNDAI','NET','COIN','COST','META','USO','SONY','NVDA','TSLA','AAPL','MSTR','KO','IWM','DELL','OUST','ON','BOT','APP','WEN','ARM',
    'PLTR','TSM','SMCI','POPMART','OPENAI','SPCX','SPY','QQQ'].map(equity),
  ...['ORDER','TRUST','XAG','O','USDT','APR','CAP','WAL','SHELL','SAPIEN'].map(perp),
  // Listed tickers that an accented everyday word turned into when its accented letters were dropped ("été" → T,
  // "até" → AT, "côté" → CT, "clé" → CL, "mãe" → ME, "maría" → MARA), and the Spanish/Portuguese verb "usar".
  ...['T','AT','CT','ME','LDO','VINE','BRETT'].map(spot), ...['USAR','MARA','ZM','MRNA'].map(equity), perp('CL'),
];
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
async function post(body: Record<string, unknown>) {
  let status = 0; let payload: any;
  const headers: Record<string,string> = {};
  const response = { setHeader(k: string, v: string) { headers[k] = v; }, status(n: number) { status = n; return this; }, json(body: any) { payload = body; return this; } };
  await handler({ method: 'POST', body, query: {} } as any, response as any);
  assert.equal(status, 200);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(payload.query, String(body.q).trim()); // Unicode question remains intact.
  return payload;
}
const request = (q: string, region: typeof locales[number]) => post({ q, language: region.lang, locale: region.locale, country: region.country });

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

  // ---- Review round 2: ordinary prose is never analysed as an asset nobody asked about. ----
  // "Exactly, without confirmation" is one unambiguous request; anything else is offered (needsConfirmation) or nothing.
  const exactly = (locale: string, question: string, symbol: string) => check(`${locale} names ${symbol}: ${question}`, async () => {
    const result = await request(question, region(locale));
    assert.equal(result.resolved?.symbol, symbol);
    assert.equal(result.resolution?.needsConfirmation, false);
    assert.equal(result.resolution?.candidates, undefined);
    assert.equal(result.results[0]?.symbol, symbol, 'the resolved asset leads the rows');
  });
  const nothing = (locale: string, question: string) => check(`${locale} names nothing: ${question}`, async () => {
    const result = await request(question, region(locale));
    assert.equal(result.resolved, null);
    assert.equal(result.resolution, null);
    // A client that falls back to the first row must find none to analyse.
    assert.deepEqual(result.results, []);
  });
  const offered = (locale: string, question: string, symbols: readonly string[]) => check(`${locale} offers ${symbols.join(' + ')}: ${question}`, async () => {
    const result = await request(question, region(locale));
    assert.equal(result.resolved?.symbol, symbols[0]);
    assert.equal(result.resolution?.needsConfirmation, true);
    if (symbols.length > 1) {
      assert.deepEqual(result.resolution?.candidates, symbols);
      assert.deepEqual(result.results.slice(0, symbols.length).map((row: any) => row.symbol), symbols);
    }
  });
  const commodity = (locale: string, question: string, symbol: string, note: string) => check(`${locale} commodity ${symbol}: ${question}`, async () => {
    for (const text of [question, question.normalize('NFD'), question.toLocaleLowerCase()]) {
      const result = await request(text, region(locale));
      assert.equal(result.resolved?.symbol, symbol);
      assert.equal(result.resolution?.matchKind, 'proxy');
      assert.equal(result.resolution?.needsConfirmation, true);
      assert.equal(result.resolution?.proxyNote, note);
    }
  });
  const GOLD = { en: 'Tether Gold (XAUT), a tokenized gold product', es: 'Tether Gold (XAUT), oro tokenizado', pt: 'Tether Gold (XAUT), ouro tokenizado',
    fr: 'Tether Gold (XAUT), de l’or tokenisé', it: 'Tether Gold (XAUT), oro tokenizzato', de: 'Tether Gold (XAUT), tokenisiertes Gold' };
  const OIL = { en: 'United States Oil Fund (USO), an oil ETF — not spot oil', fr: 'United States Oil Fund (USO), un ETF pétrolier — pas le pétrole au comptant',
    de: 'United States Oil Fund (USO), ein Öl-ETF — kein Spot-Öl', pt: 'United States Oil Fund (USO), um ETF de petróleo — não é petróleo à vista' };

  // 6. What worked keeps working (first catalogue: TON, DAI, SAP and OR are listed there).
  await exactly('en-US', 'How does Bitcoin look today?', 'BTC');
  await exactly('es-MX', '¿Cómo ves Bitcoin hoy?', 'BTC');
  await exactly('fr-FR', 'Que vois-tu sur LVMH aujourd’hui ?', 'MC.PA');
  await exactly('fr-FR', "Que vois-tu sur LVMH aujourd'hui ?", 'MC.PA');
  await exactly('de-DE', 'Was hältst du von SAP?', 'SAP.DE');
  await exactly('it-IT', 'Come vedi Intesa Sanpaolo oggi?', 'ISP.MI');
  for (const row of locales) for (const ticker of ['TON', 'SUI', 'DAI', 'MEME']) await exactly(row.locale, ticker, ticker);

  __setTestCatalog(LIVE_SHAPED);

  // 1. Italian "intesa" is a word: only the full name or the ticker names the bank inside a sentence.
  for (const question of ['Non c’è intesa sul mercato.', "Non c'è intesa sul mercato.", 'Siamo d’intesa sui rischi?', "Siamo d'intesa sui rischi?", 'Analizza intesa']) {
    await nothing('it-IT', question);
    await check(`cash listing resolver ignores the word: ${question}`, () => assert.equal(resolveRegionalStock(question, 'it', 'it-IT', 'IT'), null));
  }
  await offered('it-IT', 'intesa', ['ISP.MI']);
  await offered('it-IT', 'Intesa', ['ISP.MI']);
  await exactly('it-IT', 'Come vedi Intesa Sanpaolo oggi?', 'ISP.MI');
  await exactly('it-IT', 'Analizza ISP.MI.', 'ISP.MI');
  await exactly('it-IT', 'Intesa Sanpaolo', 'ISP.MI');

  // 2. Two assets in one question are never picked between silently.
  await offered('fr-FR', 'Analyse Bitcoin et LVMH', ['BTC', 'MC.PA']);
  await offered('fr-FR', 'Analyse LVMH et Bitcoin', ['MC.PA', 'BTC']);
  await offered('fr-FR', 'Analyse LVMH et Siemens', ['MC.PA', 'SIE.DE']);
  await offered('fr-FR', 'LVMH ou L’Oréal ?', ['MC.PA', 'OR.PA']);
  await offered('de-DE', 'Was hältst du von SAP und Bitcoin?', ['SAP.DE', 'BTC']);
  await offered('it-IT', 'Enel o Intesa Sanpaolo?', ['ENEL.MI', 'ISP.MI']); // "o" is a conjunction, not the ticker O.
  await offered('en-US', 'Compare Bitcoin and Ethereum', ['BTC', 'ETH']);
  await offered('es-MX', '¿Bitcoin o Ethereum?', ['BTC', 'ETH']);
  await offered('fr-FR', 'J’hésite entre Nvidia et Tesla', ['NVDA', 'TSLA']);
  await offered('en-US', 'Do NOT buy Bitcoin', ['BTC', 'NOT']); // The full name leads, the everyday word in capitals follows.
  await exactly('en-US', 'show me the graph of Bitcoin', 'BTC');
  await exactly('de-DE', 'Zeig mir den Graph von Bitcoin', 'BTC');
  await exactly('en-US', 'graph', 'GRT');
  await exactly('en-US', 'Is it safe to buy Bitcoin now?', 'BTC');
  await exactly('en-US', 'What is the next move for Ethereum?', 'ETH');
  await exactly('en-US', 'Bitcoin Cash outlook', 'BCH'); // One asset with a two-word name, not Bitcoin.
  await exactly('en-US', 'What about Ethereum Classic?', 'ETC');
  await exactly('en-US', 'Price of BTC in USDT', 'BTC'); // The quote currency is not a second asset.
  await exactly('en-US', 'BTC/USDT 4h analysis', 'BTC');
  await check('a lone word left of a sentence is not a whole query', async () => {
    assert.equal(regionalMentions('Enel o Intesa Sanpaolo?', 'it', 'it-IT', 'IT').rest.trim().replace(/\s+/g, ' '), 'o ?');
    assert.equal(await resolveOkxAssetFromText(' o ?', { language: 'it', sentence: true }), null);
    assert.equal((await resolveOkxAssetFromText('o', { language: 'it' }))?.instrument.symbol, 'O');
  });

  // 3. A ticker that is an everyday word of the language counts only alone or in capitals.
  for (const [locale, question] of [
    ['es-MX', 'el meme del dia'], ['es-MX', 'el meme del día'], ['es-MX', 'el sol de hoy'], ['es-MX', '¿Qué pasa con el gas?'], ['es-MX', 'mándame el link'],
    ['es-MX', 'mi meta es ahorrar más'], ['es-MX', '¿Hay algo nuevo?'], ['es-MX', 'los memes del día'],
    ['pt-PT', 'o meme do dia'], ['pt-BR', 'o meme do dia'], ['pt-PT', 'o sol de hoje'], ['pt-PT', 'É uma boa altura?'], ['pt-BR', 'o que move o mercado?'],
    ['en-US', 'what is the meme of the day'], ['en-US', 'is one enough'], ['en-US', 'people near me talk about gas'], ['en-US', 'send me the link'],
    ['en-US', 'go with the flow'], ['en-US', 'the mask is off'], ['en-US', 'Which coin should I buy?'], ['en-US', 'What’s the best strategy today?'],
    ['en-US', 'How will Trump affect the market?'],
    ['fr-FR', 'le mème du jour'], ['fr-FR', 'Quel est ton avis ?'], ['fr-FR', 'Le résultat net est stable'], ['fr-FR', 'C’est juste de la hype ?'],
    ['it-IT', 'il meme del giorno'], ['it-IT', 'Sei sicuro dei dati sui mercati?'], ['it-IT', 'Quanto vale la metà?'],
    ['de-DE', 'das Meme des Tages'], ['de-DE', 'Wie steht das Gas?'], ['de-DE', 'Schick mir den Link'], ['de-DE', 'Wen meinst du?'],
  ] as const) await nothing(locale, question);
  for (const row of locales) await exactly(row.locale, 'MEME', 'MEME');
  for (const ticker of ['NEAR', 'ONE', 'GAS', 'FLOW', 'MASK', 'PEOPLE', 'LINK', 'MEME']) {
    await exactly('en-US', ticker, ticker);
    await exactly('en-US', ticker.toLowerCase(), ticker);
    await exactly('en-US', `What about ${ticker}?`, ticker);
  }
  await exactly('es-MX', 'sol', 'SOL');
  await exactly('es-MX', '¿Qué opinas de SOL?', 'SOL');
  await exactly('es-MX', '¿Qué opinas de MEME?', 'MEME');
  await exactly('pt-PT', 'Como está a UMA?', 'UMA');
  await exactly('it-IT', 'Cosa pensi di SUI?', 'SUI');
  await exactly('es-MX', 'el meme del día: ¿y Bitcoin?', 'BTC');
  await exactly('es-MX', '¿Qué opinas de Solana?', 'SOL');
  await exactly('en-US', 'What about Chainlink?', 'LINK');

  // 4. No guess from filler or from an everyday word. HYUNDAI holds "DAI" and DAI itself is not listed.
  await nothing('it-IT', 'Dai dati cosa vedi?');
  await check('a caller that sends only its locale is still read in its language', async () => {
    const result = await post({ q: 'Dai dati cosa vedi?', locale: 'it-IT' });
    assert.equal(result.resolved, null);
    assert.deepEqual(result.results, []);
  });
  await check('resolver alone: Dai dati cosa vedi?', async () => assert.equal(await resolveOkxAssetFromText('Dai dati cosa vedi?', { language: 'it' }), null));
  await nothing('fr-FR', 'Que penses-tu de TON ?'); // TON is not listed: no look-alike (ONDO) in its place.
  await nothing('en-US', 'Buy or sell?'); // "sell" is not Russell.
  await nothing('fr-FR', 'Peux-tu analyser le CAC 40 ?');
  await nothing('en-US', 'Is this just hype?');
  await check('typed alone, a word that is no ticker is at most offered', async () => {
    for (const [locale, word] of [['it-IT', 'dai'], ['fr-FR', 'ton'], ['es-MX', 'son']] as const) {
      const result = await request(word, region(locale));
      assert.ok(!result.resolved || result.resolution?.needsConfirmation, `${word} must not start an analysis`);
    }
  });

  // 5. Gold and oil in the language of the question: the same proxy as English and Spanish, with its note.
  for (const question of ['Quel est le prix de l’or ?', "Quel est le prix de l'or ?", 'Analyse l’or', 'l’or', 'Quel est le cours de l’or aujourd’hui ?']) await commodity('fr-FR', question, 'XAUT', GOLD.fr);
  for (const question of ['Analysiere Öl.', 'Wie steht der Ölpreis?', 'Was kostet Rohöl?', 'Öl']) await commodity('de-DE', question, 'USO', OIL.de);
  for (const question of ['Wie steht Gold heute?', 'Wie ist der Goldpreis?']) await commodity('de-DE', question, 'XAUT', GOLD.de);
  await commodity('fr-FR', 'Et le pétrole ?', 'USO', OIL.fr);
  await commodity('pt-PT', 'Como está o ouro hoje?', 'XAUT', GOLD.pt);
  await commodity('pt-BR', 'Qual é o preço do petróleo?', 'USO', OIL.pt);
  await commodity('it-IT', 'Com’è l’oro oggi?', 'XAUT', GOLD.it);
  await commodity('es-MX', '¿Cómo ves el oro hoy?', 'XAUT', GOLD.es);
  await commodity('en-US', 'What is the price of gold?', 'XAUT', GOLD.en);
  await commodity('en-US', 'How is oil today?', 'USO', OIL.en);
  await offered('fr-FR', 'L’or ou Bitcoin ?', ['XAUT', 'BTC']);
  await offered('fr-FR', 'Analyse L’Oréal et l’or', ['OR.PA', 'XAUT']);
  await exactly('fr-FR', 'Que penses-tu de L’Oréal ?', 'OR.PA');
  for (const [locale, question] of [['en-US', 'or'], ['en-US', 'Buy or sell?'], ['en-US', 'Bitcoin or Ethereum?'], ['en-US', 'OR'], ['fr-FR', 'or'], ['fr-FR', 'une règle d’or pour investir'], ['de-DE', 'or']] as const) {
    await check(`${locale} the bare word "or" is never gold: ${question}`, async () => {
      const result = await request(question, region(locale));
      assert.notEqual(result.resolved?.symbol, 'XAUT');
      assert.notEqual(result.resolution?.matchKind, 'proxy');
      assert.ok(!result.resolved || result.resolution?.needsConfirmation, 'and it never starts an analysis in the live-shaped catalogue');
    });
  }

  // 7. An accented word folds to its base letters, it never loses them: "été" is not T, "até" is not AT. These
  // were whole tickers, analysed without confirmation (in production until this round).
  for (const [locale, question] of [
    ['fr-FR', 'Le marché a été calme aujourd’hui ?'], ['fr-FR', 'Que se passe-t-il de l’autre côté ?'], ['fr-FR', 'Quelle est la clé du marché ?'],
    ['pt-PT', 'Até quando esperar?'], ['pt-BR', 'A minha mãe perguntou pelo mercado'], ['es-MX', '¿Alguien notó el cambio?'], ['es-MX', 'María pregunta por el mercado'],
    ['es-MX', '¿Cuánto costó la caída?'], ['es-MX', 'quiero usar el análisis'], ['pt-PT', 'Inicia sessão para usar o analisador'],
    ['pt-PT', 'O robô decide por mim?'], ['pt-PT', 'Tenho lido muito sobre isto'], ['fr-FR', 'C’est la méta du moment'], ['es-MX', 'vine a ver cómo está el mercado'],
    ['es-MX', 'una estrategia moderna'], ['it-IT', 'una strategia moderna'], ['de-DE', 'Ich habe ein Brett vor dem Kopf'],
    // Loanwords used in every language: "inflación core", "zoom out".
    ['es-MX', '¿Cómo viene la inflación core?'], ['en-US', 'zoom out on the weekly chart'], ['fr-FR', 'Fais un zoom sur la semaine'],
  ] as const) {
    await check(`${locale} an accented or everyday word never starts an analysis: ${question}`, async () => {
      for (const text of [question, question.normalize('NFD'), question.toLocaleLowerCase()]) {
        const result = await request(text, region(locale));
        assert.ok(!result.resolved || result.resolution?.needsConfirmation === true, `${text} → ${result.resolved?.symbol} without confirmation`);
      }
    });
  }
  for (const [locale, question] of [['fr-FR', 'Le marché a été calme aujourd’hui ?'], ['pt-PT', 'Até quando esperar?'], ['es-MX', 'quiero usar el análisis']] as const) await nothing(locale, question);
  for (const ticker of ['T', 'AT', 'CT', 'USAR', 'CORE']) await exactly('fr-FR', ticker, ticker);
  await exactly('es-MX', '¿Qué opinas de CORE?', 'CORE');
  await exactly('en-US', 'zoom', 'ZM');
  await exactly('pt-PT', 'Lido', 'LDO');
  await exactly('es-MX', 'Moderna', 'MRNA');
  await exactly('es-MX', '¿Qué opinas de MRNA?', 'MRNA');
  await exactly('fr-FR', 'Que penses-tu de META ?', 'META');
  await exactly('en-US', 'What about ZOOM?', 'ZM');
  await exactly('es-MX', '¿Qué opinas de USAR?', 'USAR');
  await exactly('es-MX', 'USAR', 'USAR');
  await exactly('es-MX', '¿Cómo ves Bitcoin después de que subió?', 'BTC');
  await exactly('fr-FR', 'Le Bitcoin a été rejeté ?', 'BTC');

  // 6. What worked keeps working in the live-shaped catalogue too.
  await exactly('en-US', 'How does Bitcoin look today?', 'BTC');
  await exactly('es-MX', '¿Cómo ves Bitcoin hoy?', 'BTC');
  await exactly('fr-FR', 'Que vois-tu sur LVMH aujourd’hui ?', 'MC.PA');
  await exactly('de-DE', 'Was hältst du von SAP?', 'SAP.DE');
  await exactly('it-IT', 'Come vedi Intesa Sanpaolo oggi?', 'ISP.MI');
  await exactly('it-IT', 'SUI', 'SUI');
  await exactly('fr-FR', 'Que penses-tu de Solana ?', 'SOL');
} finally { globalThis.fetch = originalFetch; }
console.log(JSON.stringify({ checksPassed: checks, checksFailed: failures.length, failures, evidence: 'Actual text resolver and HTTP discovery; local fixture catalogue, no microphone or AI' }, null, 2));
assert.equal(failures.length, 0, `${failures.length} multilingual asset checks failed`);
