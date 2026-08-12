// Bobby Executor — Base (8453) trade service on Fly.io
// Replaces the deleted Digital Ocean droplet. Hardened from day one:
// Bearer auth, action allowlist, no arbitrary params passthrough.
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { base } from 'viem/chains';

const PORT = process.env.PORT || 8080;
const AUTH_TOKEN = process.env.EXECUTOR_TOKEN; // required — refuse to boot without it
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// Uniswap v3 on Base
const QUOTER_V2 = '0x3d4e44eb1374240ce5f1b871ab261cd16335b76a';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH = '0x4200000000000000000000000000000000000006';
const TOKENS = { ETH: WETH, WETH, USDC };
const DECIMALS = { ETH: 18, WETH: 18, USDC: 6 };

if (!AUTH_TOKEN) {
  console.error('[executor] EXECUTOR_TOKEN not set — refusing to start');
  process.exit(1);
}

const client = createPublicClient({ chain: base, transport: http(RPC_URL) });

const quoterAbi = [{
  name: 'quoteExactInputSingle',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{
    name: 'params', type: 'tuple', components: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'fee', type: 'uint24' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
  }],
  outputs: [
    { name: 'amountOut', type: 'uint256' },
    { name: 'sqrtPriceX96After', type: 'uint160' },
    { name: 'initializedTicksCrossed', type: 'uint32' },
    { name: 'gasEstimate', type: 'uint256' },
  ],
}];

const app = express();
app.use(express.json({ limit: '64kb' }));

function safeTokenEqual(provided, expected) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

app.get('/health', (_req, res) => res.json({ ok: true, chain: 8453, service: 'bobby-executor' }));

// Auth on everything else
app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!provided || !safeTokenEqual(provided, AUTH_TOKEN)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

const ACTIONS = {
  async status() {
    const block = await client.getBlockNumber();
    return { chain: 8453, block: block.toString(), rpc: RPC_URL.replace(/\/\/.*@/, '//') };
  },

  async quote({ from = 'ETH', to = 'USDC', amount, fee = 500 }) {
    const tokenIn = TOKENS[from];
    const tokenOut = TOKENS[to];
    if (!tokenIn || !tokenOut) throw new Error(`unsupported token pair ${from}/${to}`);
    if (!amount || Number(amount) <= 0) throw new Error('amount required');
    const amountIn = parseUnits(String(amount), DECIMALS[from]);
    const { result } = await client.simulateContract({
      address: QUOTER_V2,
      abi: quoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    const [amountOut, , , gasEstimate] = result;
    return {
      from, to, amountIn: String(amount),
      amountOut: formatUnits(amountOut, DECIMALS[to]),
      fee, gasEstimate: gasEstimate.toString(),
      source: 'uniswap-v3-quoter-v2', quoter: QUOTER_V2,
    };
  },

  // Swap execution intentionally disabled until the signing key + policy layer
  // (per-trade cap, daily cap, pair allowlist) is reviewed and enabled by Anthony.
  async swap() {
    throw new Error('swap disabled: signing key not provisioned (see services/executor/README.md)');
  },
};

app.post('/api/base', async (req, res) => {
  const { action, params = {} } = req.body || {};
  if (typeof action !== 'string' || !Object.hasOwn(ACTIONS, action)) {
    return res.status(400).json({ error: 'unknown action', allowed: Object.keys(ACTIONS) });
  }
  const handler = ACTIONS[action];
  try {
    const data = await handler(params);
    return res.json({ ok: true, action, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[executor] action failed:', action, message);
    return res.status(422).json({ ok: false, action, error: 'request failed' });
  }
});

app.listen(PORT, () => console.log(`[executor] bobby-executor listening on :${PORT} (Base 8453)`));
