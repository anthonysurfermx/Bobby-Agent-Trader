#!/usr/bin/env node
// Labels from the shipping sources, for all six screenshot-test languages.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ios = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = file => JSON.parse(fs.readFileSync(path.join(ios, file), 'utf8'));
const table = page => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(ios, 'Nucleo/src', page, '40-strings.js'), 'utf8'), context);
  return context.STR;
};
const app = table('app'), onboarding = table('onboarding');
const copy = load('Resources/Nucleo/companion-copy.json');
const interest = load('Resources/Nucleo/companion-questions.json').questions.find(q => q.id === 'interest');
const labels = Object.fromEntries(['en','es','fr','pt','it','de'].map(lang => [lang, {
  app: app[lang], onboarding: onboarding[lang],
  companion: Object.fromEntries(Object.entries(copy.texts).map(([key, row]) => [key, row[lang]])),
  interest: interest.text[lang], crypto: interest.options.find(o => o.id === 'crypto').label[lang]
}]));
const target = path.join(ios, 'UITests/RedesignLabels.json');
const expected = JSON.stringify(labels, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== expected) throw new Error('RedesignLabels.json is stale; run ios/Bobby/scripts/redesign-labels.mjs');
  console.log('Redesign labels: six languages match shipping sources');
} else fs.writeFileSync(target, expected);
