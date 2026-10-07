#!/usr/bin/env node
/* global NucleoReadModel -- a global of the Núcleo page, read inside page.evaluate */
// Measures the real shipping SVG and buildChart in Chrome; all browser requests are blocked.
// PLAYWRIGHT_MODULE=/absolute/playwright/index.mjs node scripts/qa/test-ios17-support-subtitle.mjs
// --source-ref=<commit> reproduces clipping before the fix. --font-file=<local Geist .woff2> adds that real face.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const option = key => process.argv.find(arg => arg.startsWith(key + '='))?.slice(key.length + 1);
const root = option('--root') || fileURLToPath(new URL('../../', import.meta.url));
const sourceRef = option('--source-ref');
const read = path => sourceRef ? execFileSync('git', ['show', `${sourceRef}:${path}`], { cwd: root, encoding: 'utf8' }) : readFileSync(root + '/' + path, 'utf8');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route('**/*', route => route.abort());
const fontFile = option('--font-file');
const faces = ['system-ui'];
if (fontFile) faces.push('Geist');
const result = { at: new Date().toISOString(), root, sourceRef: sourceRef || 'working-tree', browser: browser.version(), viewport: { width: 390, height: 844 }, network: 'blocked', fontFile: fontFile || null, geist: fontFile ? 'measured from supplied local face' : 'not verified: no local Geist face supplied', sourceHashes: {}, cases: [] };
const check = (out, label, assertion) => { try { assertion(); out.checks.push({ label, status: 'passed' }); } catch (error) { out.checks.push({ label, status: 'failed', message: error.message }); } };
try {
  for (const tree of ['ios/Bobby/Nucleo', 'nucleo']) {
    const source = read(tree + '/src/app/55-read.js');
    const template = read(tree + '/src/app/template.html');
    const translations = read(tree + '/src/shared/20-read-model.js');
    for (const [path, text] of [['src/app/55-read.js', source], ['src/app/template.html', template], ['src/shared/20-read-model.js', translations]]) result.sourceHashes[tree + '/' + path] = createHash('sha256').update(text).digest('hex');
    const chart = template.match(/<svg\s+id="chart"[\s\S]*?<\/svg>/)?.[0];
    assert.ok(chart, 'shipping chart SVG exists');
    const start = source.indexOf('var CH = null');
    const end = source.indexOf('function lutAt(', start);
    assert.ok(start >= 0 && end > start, 'shipping chart renderer exists');
    await page.setContent('<style>html,body{margin:0;background:#0B0A09}#stage{position:relative;width:390px;height:844px;overflow:hidden}#chart{position:absolute;left:0;top:0}</style><div id="stage">' + chart + '</div>');
    await page.addScriptTag({ content: translations });
    await page.addScriptTag({ content: `
      var D = document, el = {}, LOCALE = 'en-US';
      document.querySelectorAll('[id]').forEach(function(node){ el[node.id] = node; });
      el.cG = [el.cG0, el.cG1]; el.cGT = [el.cG0T, el.cG1T];
      function fin(x){ return typeof x === 'number' && isFinite(x); }
      function f2(x){ return x.toFixed(2); }
      function att(node, key, value){ node.setAttribute(key, value); }
      function tt(){ return '1H'; } function whenLabel(){ return ''; }
      ${source.slice(start, end)}
      window.drawSupport = function(subtitle, direction){
        var closes = Array.from({length:48}, function(_, i){ return 100 + Math.sin(i / 4) * 2; });
        closes[47] = 100;
        buildChart({closes:closes,domain:[90,110],gridlines:[95,105],now:{price:100,label:'$100.00'},lines:[],band:null,
          bracket: subtitle === null ? null : {to:direction === 'above' ? 98 : 102,label:direction === 'above' ? '+2.0%' : '−2.0%',sub:subtitle},source:{timeframe:'1H'}}, {}, 0);
        el.cBr.setAttribute('opacity','1'); el.cPrice.setAttribute('opacity','1');
        var node=el.cBrS, spans=Array.from(node.querySelectorAll('tspan'));
        return { text:spans.length ? spans.map(function(s){return s.textContent;}).join(' ') : node.textContent,
          lines:(spans.length ? spans : [node]).map(function(line){var b=line.getBoundingClientRect();return {text:line.textContent,width:line.getComputedTextLength(),x:+line.getAttribute('x'),y:+line.getAttribute('y'),left:b.left,right:b.right,top:b.top,bottom:b.bottom};}),
          spanCount:spans.length, delta:{text:el.cBrT.textContent,bounds:el.cBrT.getBoundingClientRect().toJSON()},
          bracketX:+el.cBrL.getAttribute('x1'), priceX:+el.cPrice.getAttribute('x'), nowX:+el.cNow.getAttribute('cx'), path:el.cLine.getAttribute('d'), stageWidth:el.stage.getBoundingClientRect().width };
      };
    ` });
    let path;
    for (const face of faces) {
      if (face === 'Geist') {
        const encoded = readFileSync(fontFile).toString('base64');
        await page.evaluate(async encoded => { const face = new FontFace('Geist', `url(data:font/woff2;base64,${encoded})`, { weight: '400' }); await face.load(); document.fonts.add(face); }, encoded);
      }
      await page.locator('#cBrS').evaluate((node, face) => node.setAttribute('font-family', face), face);
      await page.locator('#cBrT').evaluate((node, face) => node.setAttribute('font-family', face), face);
      for (const language of ['en', 'es', 'fr', 'pt', 'it', 'de']) {
        for (const direction of ['above', 'below']) {
          const subtitle = await page.evaluate(({language, direction}) => NucleoReadModel.t(language, 'chart.' + direction + 'Support'), { language, direction });
          const beforeWidth = await page.locator('#cBrS').evaluate((node, text) => { node.textContent = text; return node.getComputedTextLength(); }, subtitle);
          const measured = await page.evaluate(({subtitle, direction}) => window.drawSupport(subtitle, direction), { subtitle, direction });
          const out = { tree, face, language, direction, subtitle, beforeWidth, measured, checks: [] }; result.cases.push(out);
          check(out, 'keeps complete localized subtitle', () => assert.equal(measured.text, subtitle));
          check(out, 'each subtitle line fits the 90 px budget with 4 px viewport margin', () => { for (const line of measured.lines) { assert.ok(line.width <= 90.1, `line is ${line.width.toFixed(2)} px`); assert.ok(line.right <= 386.1, `right edge is ${line.right.toFixed(2)} px`); assert.equal(line.x, 296); } });
          check(out, 'wraps measured long copy into exactly two tspans', () => assert.equal(measured.spanCount, beforeWidth > 90 ? 2 : 0));
          check(out, 'subtitle and delta remain separate', () => { assert.equal(measured.delta.text, direction === 'above' ? '+2.0%' : '−2.0%'); assert.ok(measured.delta.bounds.right <= 386.1, 'delta overflows viewport'); assert.ok(measured.lines[0].top >= measured.delta.bounds.bottom, 'subtitle overlaps delta'); for(let i=1;i<measured.lines.length;i++) assert.ok(measured.lines[i].top >= measured.lines[i-1].bottom, 'subtitle lines overlap'); });
          check(out, 'preserves chart composition at 390 px', () => { path ||= measured.path; assert.equal(measured.path,path); assert.equal(measured.stageWidth,390); assert.equal(measured.bracketX,290); assert.equal(measured.priceX,270); assert.equal(measured.nowX,280); });
        }
      }
      for (const [name, subtitle] of [['long-to-short', 'above support'], ['empty-subtitle', ''], ['no-bracket', null]]) {
        await page.evaluate(() => window.drawSupport('unter der Unterstützung', 'below'));
        const measured = await page.evaluate(subtitle => window.drawSupport(subtitle, 'above'), subtitle);
        const out={tree,face,transition:name,measured,checks:[]};result.cases.push(out);
        check(out, 'replaces the prior wrapped subtitle completely', () => { assert.equal(measured.spanCount,0); assert.equal(measured.text,subtitle || ''); if(subtitle === null) assert.equal(measured.delta.text,''); });
      }
    }
  }
} finally { await browser.close(); }
result.scenarios = result.cases.length;
result.assertions = result.cases.flatMap(out => out.checks).length;
result.failures = result.cases.flatMap(out => out.checks.filter(check => check.status === 'failed').map(check => ({ tree:out.tree,face:out.face,language:out.language,direction:out.direction,transition:out.transition,...check })));
result.passed = result.assertions - result.failures.length;
if (option('--json-report')) writeFileSync(option('--json-report'), JSON.stringify(result,null,2) + '\n');
console.log(`Support subtitle DOM: ${result.passed}/${result.assertions} assertions passed across ${result.scenarios} scenarios; ${result.failures.length} failed. Geist: ${result.geist}.`);
for (const failure of result.failures) console.error(JSON.stringify(failure));
process.exitCode = result.failures.length ? 1 : 0;
