import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlan, publicConfig, CONTRACTS, digest } from './lib/mobile-deploy-plan.mjs';

const output = resolve(process.argv[2] || 'output/mobile-deploy');
const raw = JSON.parse(readFileSync('contracts/broadcast/DeployBase.s.sol/8453/dry-run/run-latest.json', 'utf8'));
const manifest = JSON.parse(readFileSync('contracts/deployments/8453.json', 'utf8'));
const artifacts = Object.fromEntries(CONTRACTS.map(name => {
  const artifact = JSON.parse(readFileSync(`contracts/out/${name}.sol/${name}.json`, 'utf8'));
  return [name, { abi: artifact.abi, bytecode: artifact.bytecode }];
}));
const config = publicConfig(readFileSync('deploy/base-mainnet.env.example', 'utf8'));
const plan = buildPlan(raw, manifest, artifacts, config);
const packet = { raw, manifest, artifacts, config, plan };
mkdirSync(output, { recursive: true, mode: 0o700 });
writeFileSync(resolve(output, 'packet.json'), JSON.stringify(packet) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ packet: resolve(output, 'packet.json'), packetSha256: digest(packet), planSha256: digest(plan), transactions: plan.transactions.length, startNonce: plan.startNonce }, null, 2));
