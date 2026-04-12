// ============================================================
// POST /api/deploy-hardness — Deploy HardnessRegistry to X Layer
// One-shot endpoint. Auth required. Deploys the compiled contract bytecode.
// After deploy, this endpoint should be disabled or deleted.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ethers } from 'ethers';

export const config = { maxDuration: 60 };

const XLAYER_RPC = 'https://rpc.xlayer.tech';

// Treasury + resolver hotkey + recorder as 3 resolvers
const RESOLVER_1 = '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea'; // treasury
const RESOLVER_2 = '0xc27Bf54D67165d1C81E3a39B4Dec7DD7F82137e0'; // resolver hotkey
const RESOLVER_THRESHOLD = 2; // 2-of-3 (we need at least 3 resolvers for threshold 3, but with only 2 addresses we use 2-of-2)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Auth
  const secret = process.env.BOBBY_CYCLE_SECRET || process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization;
    const bodySecret = (req.body as Record<string, unknown>)?.secret;
    if (auth !== `Bearer ${secret}` && bodySecret !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const deployerKey = process.env.BOBBY_RECORDER_KEY;
  if (!deployerKey) {
    return res.status(503).json({ error: 'BOBBY_RECORDER_KEY not configured' });
  }

  // Optional: use body to override resolvers
  const body = req.body as Record<string, unknown> || {};
  const resolvers: string[] = Array.isArray(body.resolvers)
    ? body.resolvers.map(String)
    : [RESOLVER_1, RESOLVER_2];
  const threshold = typeof body.threshold === 'number'
    ? body.threshold
    : Math.min(RESOLVER_THRESHOLD, resolvers.length);

  if (resolvers.length < threshold) {
    return res.status(400).json({ error: `Need at least ${threshold} resolvers, got ${resolvers.length}` });
  }

  try {
    const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
    const wallet = new ethers.Wallet(deployerKey, provider);
    const balance = await provider.getBalance(wallet.address);

    console.log(`[DeployHardness] Deployer: ${wallet.address}, Balance: ${ethers.formatEther(balance)} OKB`);

    if (balance < ethers.parseEther('0.01')) {
      return res.status(400).json({
        error: 'Insufficient balance for deploy',
        deployer: wallet.address,
        balance: ethers.formatEther(balance),
      });
    }

    // Read compiled ABI + bytecode
    // We'll use the ABI JSON that Codex generated
    let abi: string[];
    let bytecode: string;

    try {
      // Try to read from forge output
      const fs = await import('fs');
      const path = await import('path');
      const artifactPath = path.join(process.cwd(), 'contracts', 'out', 'HardnessRegistry.sol', 'HardnessRegistry.json');
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      abi = artifact.abi;
      bytecode = artifact.bytecode.object || artifact.bytecode;
    } catch {
      // Fallback: read from abi/ directory
      try {
        const fs = await import('fs');
        const path = await import('path');
        const abiPath = path.join(process.cwd(), 'contracts', 'abi', 'HardnessRegistry.json');
        const abiData = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        abi = abiData.abi || abiData;
        bytecode = abiData.bytecode?.object || abiData.bytecode || '';
      } catch {
        return res.status(500).json({ error: 'Cannot find compiled contract. Run forge build first.' });
      }
    }

    if (!bytecode || bytecode === '0x' || bytecode.length < 100) {
      return res.status(500).json({ error: 'Bytecode not found. Run: cd contracts && forge build' });
    }

    // Deploy
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    console.log(`[DeployHardness] Deploying with ${resolvers.length} resolvers, threshold ${threshold}...`);

    const contract = await factory.deploy(resolvers, threshold, {
      gasLimit: 5000000n,
    });

    const tx = contract.deploymentTransaction();
    console.log(`[DeployHardness] TX sent: ${tx?.hash}`);

    // Wait for confirmation
    await contract.waitForDeployment();
    const address = await contract.getAddress();

    console.log(`[DeployHardness] DEPLOYED at ${address}`);

    return res.status(200).json({
      ok: true,
      contract: 'HardnessRegistry',
      address,
      txHash: tx?.hash,
      deployer: wallet.address,
      resolvers,
      threshold,
      chainId: 196,
      rpc: XLAYER_RPC,
      explorer: `https://www.oklink.com/xlayer/address/${address}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DeployHardness] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
