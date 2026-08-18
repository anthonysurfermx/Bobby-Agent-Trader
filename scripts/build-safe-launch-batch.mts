import { existsSync, readFileSync } from 'node:fs';
import { getAddress } from 'ethers';

type Action = 'accept' | 'pause' | 'unpause';

const actionArg = process.argv.find((arg) => arg.startsWith('--action='));
const action = (actionArg?.split('=')[1] || '') as Action;
const chainArg = process.argv.find((arg) => arg.startsWith('--chain-id='));
const chainId = Number(chainArg?.split('=')[1] || 8453);

if (!['accept', 'pause', 'unpause'].includes(action)) {
  throw new Error('action must be accept, pause, or unpause');
}
if (![8453, 84532].includes(chainId)) throw new Error('chain-id must be 8453 or 84532');

const manifestPath = `contracts/deployments/${chainId}.json`;
if (!existsSync(manifestPath)) throw new Error(`${manifestPath} is missing`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, any>;

const safe = String(manifest.expectedOwner || '');
if (!/^0x[0-9a-fA-F]{40}$/.test(safe) || /^0x0+$/.test(safe)) {
  throw new Error('manifest expectedOwner must be the reviewed Safe address');
}

const contracts = [
  'trackRecord',
  'convictionOracle',
  'agentEconomyV2',
  'adversarialBounties',
  'hardnessRegistry',
  'agentRegistry',
  'intentEscrow',
] as const;

type ContractInput = { internalType: string; name: string; type: string };
type BuilderTransaction = {
  to: string;
  value: string;
  data: null;
  contractMethod: {
    inputs: ContractInput[];
    name: string;
    payable: boolean;
  };
  contractInputsValues: Record<string, string>;
};

const transactions: BuilderTransaction[] = [];
for (const key of contracts) {
  const to = String(manifest.addresses?.[key] || '');
  if (!/^0x[0-9a-fA-F]{40}$/.test(to) || /^0x0+$/.test(to)) {
    throw new Error(`manifest address ${key} is invalid`);
  }

  if (action === 'accept') {
    transactions.push({
      to: getAddress(to),
      value: '0',
      data: null,
      contractMethod: { inputs: [], name: 'acceptOwnership', payable: false },
      contractInputsValues: {},
    });
  } else if (key === 'agentRegistry') {
    // AgentRegistry has no runtime mutation surface that requires a pause.
    continue;
  } else if (key === 'intentEscrow') {
    transactions.push({
      to: getAddress(to),
      value: '0',
      data: null,
      contractMethod: {
        inputs: [{ internalType: 'bool', name: 'paused', type: 'bool' }],
        name: 'setPaused',
        payable: false,
      },
      contractInputsValues: { paused: String(action === 'pause') },
    });
  } else {
    transactions.push({
      to: getAddress(to),
      value: '0',
      data: null,
      contractMethod: { inputs: [], name: action, payable: false },
      contractInputsValues: {},
    });
  }
}

console.log(JSON.stringify({
  version: '1.0',
  chainId: String(chainId),
  createdAt: Date.now(),
  meta: {
    name: `Bobby Protocol ${action} (${chainId})`,
    description: `${transactions.length} reviewed ${action} calls generated from ${manifestPath}`,
    txBuilderVersion: '1.18.0',
    createdFromSafeAddress: getAddress(safe),
    createdFromOwnerAddress: '',
    checksum: '',
  },
  transactions,
}, null, 2));
