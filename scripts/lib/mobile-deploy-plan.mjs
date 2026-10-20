import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Interface, getCreateAddress, keccak256 } from 'ethers';

export const DEPLOYER = '0xC3F836EC06A2202af23e59997A613CA0722F35d1';
export const SAFE = '0x8BE60853F27b944e11486285d95c3e06596553b4';
export const CHAIN = 8453;
export const CONTRACTS = ['BobbyTrackRecordV2', 'BobbyConvictionOracle', 'BobbyAgentEconomyV2', 'BobbyAdversarialBounties', 'HardnessRegistry', 'BobbyAgentRegistry', 'BobbyIntentEscrow'];
export const KEYS = ['trackRecord', 'convictionOracle', 'agentEconomyV2', 'adversarialBounties', 'hardnessRegistry', 'agentRegistry', 'intentEscrow'];
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const quantity = value => '0x' + BigInt(value).toString(16);

export function publicConfig(text) {
  const env = {};
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\s]*)$/.exec(line);
    assert(match, 'Unsupported public configuration syntax');
    env[match[1]] = match[2];
  }
  return env;
}

// Independently reconstruct all creation and call data from the reviewed public
// configuration and compiler artifacts. Never forward arbitrary Foundry input.
export function buildPlan(raw, manifest, artifacts, e) {
  assert.equal(Number(manifest.chainId), CHAIN);
  assert(same(manifest.deployer, DEPLOYER));
  assert(same(manifest.expectedOwner, SAFE));
  assert(same(e.DEPLOYER_ADDRESS, DEPLOYER));
  assert(same(e.OWNER_SAFE_ADDRESS, SAFE));
  assert(same(e.BOUNTY_TREASURY_ADDRESS, SAFE));
  assert.equal(raw.transactions.length, 19, 'Expected exactly 19 transactions');
  const nonce = Number(BigInt(raw.transactions[0].transaction.nonce));
  assert(Number.isSafeInteger(nonce) && nonce >= 0);
  const addresses = CONTRACTS.map((_, i) => getCreateAddress({ from: DEPLOYER, nonce: nonce + i }));
  const params = ['ENTRY_WINDOW_SEC','EXIT_WINDOW_SEC','MAX_EXIT_LAG_SEC','CHALLENGE_WINDOW_SEC','ENTRY_TOL_BPS','EXIT_TOL_BPS','CONF_MAX_BPS'].map(n => e['V2_' + n]);
  const args = [
    [e.BOBBY_ADDRESS, params, ['0xbC16aee60f64864882BC6C4E428e148Fc0E272F5', '0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a'], ['BTC','ETH','SOL'], ['0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43','0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace','0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d']],
    [e.BOBBY_ADDRESS],
    [e.ALPHA_ADDRESS,e.RED_ADDRESS,e.CIO_ADDRESS,e.FEE_MCP_CALL_WEI,e.FEE_DEBATE_PER_AGENT_WEI],
    [e.RESOLVER_ADDRESS,e.ABSOLUTE_MIN_BOUNTY_WEI,e.MIN_BOUNTY_WEI],
    [e.RESOLVER_ADDRESSES.split(','),e.RESOLVER_THRESHOLD,e.ABSOLUTE_MIN_BOUNTY_WEI,e.REGISTRATION_STAKE_WEI,e.MIN_BOUNTY_WEI],
    [],
    [CHAIN,e.ESCROW_MAX_SIZE_USD,DEPLOYER,e.CIO_ADDRESS,e.ARBITER_ADDRESS,e.KEEPER_ADDRESS,e.RESOLVER_ADDRESS],
  ];
  const expected = CONTRACTS.map((name, i) => {
    const artifact = artifacts[name];
    assert(artifact?.bytecode?.object?.startsWith('0x'), 'Missing compiler creation bytecode');
    assert(same(addresses[i], manifest.addresses[KEYS[i]]), 'Manifest creation address mismatch');
    return { label: 'Deploy ' + name, to: null, data: artifact.bytecode.object + new Interface(artifact.abi).encodeDeploy(args[i]).slice(2), contractAddress: addresses[i], contractName: name, function: null };
  });
  const add = (index, signature, value) => expected.push({ label: CONTRACTS[index] + ': ' + signature + ' = ' + value, to: addresses[index], data: new Interface(['function ' + signature]).encodeFunctionData(signature, [value]), contractAddress: null, contractName: CONTRACTS[index], function: signature });
  add(4, 'setHardnessScorer(address)', e.HARDNESS_SCORER_ADDRESS);
  add(3, 'setTreasury(address)', SAFE);
  add(3, 'setChallengeBond(uint96)', e.CHALLENGE_BOND_WEI);
  add(4, 'setTreasury(address)', SAFE);
  add(4, 'setBountyChallengeBond(uint96)', e.CHALLENGE_BOND_WEI);
  for (let i = 0; i < 7; i++) add(i, 'transferOwnership(address)', SAFE);
  const transactions = expected.map((want, i) => {
    const found = raw.transactions[i];
    const tx = found.transaction;
    assert.equal(found.transactionType, i < 7 ? 'CREATE' : 'CALL');
    assert(same(tx.from, DEPLOYER), 'Unexpected sender');
    assert.equal(Number(BigInt(tx.chainId)), CHAIN, 'Unexpected chain');
    assert.equal(Number(BigInt(tx.nonce)), nonce + i, 'Nonconsecutive nonce');
    assert.equal(BigInt(tx.value || '0x0'), 0n, 'Deployment must not transfer ETH value');
    assert(same(tx.to || '', want.to || ''), 'Unexpected target');
    assert(same(tx.input || tx.data, want.data), 'Data differs from independent reconstruction');
    if (i < 7) {
      assert.equal(found.contractName, want.contractName);
      assert(same(found.contractAddress, want.contractAddress));
    } else {
      assert.equal(found.function, want.function, 'Call metadata differs from expected operation');
      assert.equal(found.contractName, want.contractName);
      assert(same(new Interface(['function ' + want.function]).encodeFunctionData(want.function, found.arguments), want.data));
    }
    return { ...want, nonce: nonce + i, from: DEPLOYER, value: '0x0', chainId: '0x2105', inputHash: keccak256(want.data) };
  });
  return { chainId: CHAIN, deployer: DEPLOYER, safe: SAFE, startNonce: nonce, transactions };
}

export function assertSession(session) {
  const ns = session.namespaces?.eip155;
  assert(ns?.methods?.includes('eth_sendTransaction'), 'Wallet does not support deployment requests');
  assert(ns.accounts?.length > 0, 'No wallet account');
  for (const account of ns.accounts) assert(same(account, 'eip155:8453:' + DEPLOYER), 'Connect only the reviewed deployer on Base');
}

export function assertMined(tx, receipt, live) {
  assert(receipt && live, 'Missing transaction or receipt');
  assert.equal(receipt.status, '0x1', 'Transaction reverted');
  assert(same(receipt.transactionHash, live.hash));
  assert(same(receipt.from, DEPLOYER) && same(live.from, DEPLOYER));
  assert.equal(Number(BigInt(live.chainId)), CHAIN);
  assert.equal(Number(BigInt(live.nonce)), tx.nonce);
  assert.equal(BigInt(live.value), 0n);
  assert(same(live.to || '', tx.to || '') && same(receipt.to || '', tx.to || ''));
  assert.equal(keccak256(live.input), tx.inputHash, 'Wallet changed deployment data');
  if (tx.contractAddress) assert(same(receipt.contractAddress, tx.contractAddress));
  assert(receipt.blockHash && !/^0x0+$/.test(receipt.blockHash));
}
