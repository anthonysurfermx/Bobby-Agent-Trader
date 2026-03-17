// Deploy BobbyTrackRecord to X Layer (Chain ID 196)
// Run: node contracts/deploy.js
//
// Prerequisites:
// 1. Set PRIVATE_KEY env var (deployer wallet with OKB for gas)
// 2. Set BOBBY_ADDRESS env var (Bobby's authorized recorder)
//
// X Layer RPC: https://rpc.xlayer.tech
// Explorer: https://www.oklink.com/xlayer

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'https://rpc.xlayer.tech';
const CHAIN_ID = 196;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY env var');
    process.exit(1);
  }

  const bobbyAddress = process.env.BOBBY_ADDRESS || '0x0000000000000000000000000000000000000000';

  console.log('Connecting to X Layer...');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  console.log(`Connected: Chain ID ${network.chainId}`);

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} OKB`);

  if (balance === 0n) {
    console.error('No OKB balance! Send OKB to deployer first.');
    process.exit(1);
  }

  // Compile inline (simple contract — no hardhat needed)
  // For production, use hardhat or foundry
  console.log('Deploying BobbyTrackRecord...');

  // ABI and bytecode would come from solc compilation
  // For now, output instructions
  console.log(`
=== DEPLOYMENT INSTRUCTIONS ===

Option 1: Remix IDE (easiest)
1. Go to https://remix.ethereum.org
2. Create new file: BobbyTrackRecord.sol
3. Paste the contract code
4. Compile with Solidity 0.8.19+
5. Deploy tab → Environment: "Injected Provider"
6. Add X Layer network to MetaMask:
   - RPC: https://rpc.xlayer.tech
   - Chain ID: 196
   - Symbol: OKB
7. Deploy with constructor arg: ${bobbyAddress}
8. Copy the contract address

Option 2: Hardhat
  npx hardhat init
  npx hardhat compile
  npx hardhat run scripts/deploy.js --network xlayer

After deployment, set CONTRACT_ADDRESS in your .env
and the Resolution Engine will start recording on-chain.

Explorer: https://www.oklink.com/xlayer/address/<contract_address>
  `);
}

main().catch(console.error);
