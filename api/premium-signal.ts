// ============================================================
// GET /api/premium-signal — x402 Payment-Gated Premium Signals
// Returns 402 Payment Required for non-paying users
// After x402 payment, returns premium trading intelligence
// This demonstrates x402 integration for the OKX X Layer Hackathon
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

// x402 payment payload — tells the client what payment is required
const X402_PAYLOAD = {
  version: '1.0',
  accepts: [{
    scheme: 'x402',
    network: 'eip155:196', // X Layer
    token: '0x0000000000000000000000000000000000000000', // Native OKB
    maxAmountRequired: '1000000000000000', // 0.001 OKB
    resource: '/api/premium-signal',
    description: 'Access Bobby Agent Trader premium signals — real-time multi-agent debate analysis',
    payTo: '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea', // Bobby's X Layer wallet
    validUntil: new Date(Date.now() + 3600000).toISOString(), // 1 hour
  }],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  // Check for x402 payment proof in headers
  const paymentHeader = req.headers['x-payment'] || req.headers['x-402-payment'];

  if (!paymentHeader) {
    // No payment — return 402 with payment requirements
    const payloadBase64 = Buffer.from(JSON.stringify(X402_PAYLOAD)).toString('base64');

    res.setHeader('X-Payment-Required', payloadBase64);
    res.setHeader('Content-Type', 'application/json');

    return res.status(402).json({
      error: 'Payment Required',
      message: 'This endpoint requires x402 payment on X Layer (Chain 196)',
      protocol: 'x402',
      network: 'eip155:196',
      amount: '0.001 OKB',
      payTo: '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea',
      description: 'Access premium multi-agent trading signals',
      payload: payloadBase64,
    });
  }

  // Payment proof provided — verify TX on X Layer
  const txHash = String(paymentHeader).trim();

  try {
    // Verify the transaction on X Layer RPC
    const XLAYER_RPC = 'https://rpc.xlayer.tech';
    const BOBBY_WALLET = '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea';
    const MIN_PAYMENT = BigInt('100000000000000'); // 0.0001 OKB minimum

    let verified = false;
    let verificationDetails: any = { txHash, method: 'x402_onchain_verification' };

    if (txHash.startsWith('0x') && txHash.length === 66) {
      // Real TX hash — verify on-chain
      const receiptRes = await fetch(XLAYER_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt',
          params: [txHash],
        }),
      });
      const receipt = await receiptRes.json();

      if (receipt.result && receipt.result.status === '0x1') {
        // TX succeeded — check it was to Bobby's wallet or contracts
        const txRes = await fetch(XLAYER_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 2, method: 'eth_getTransactionByHash',
            params: [txHash],
          }),
        });
        const tx = await txRes.json();

        if (tx.result) {
          const to = (tx.result.to || '').toLowerCase();
          const value = BigInt(tx.result.value || '0');
          const validRecipient = to === BOBBY_WALLET.toLowerCase() ||
            to === '0xf841b428e6d743187d7be2242eccc1078fde2395' || // TrackRecord
            to === '0xa4704e92e9d9eca646716c14a124907c356c78d7';   // AgentEconomy

          // Accept either: value transfer to Bobby OR contract interaction (commit/debate fee)
          if (validRecipient && (value >= MIN_PAYMENT || tx.result.input?.length > 10)) {
            verified = true;
            verificationDetails = {
              ...verificationDetails,
              status: 'verified',
              chain: 'X Layer (196)',
              to,
              value: (Number(value) / 1e18).toFixed(6) + ' OKB',
              block: parseInt(receipt.result.blockNumber, 16),
            };
          } else {
            verificationDetails.status = 'invalid_recipient_or_amount';
            verificationDetails.to = to;
            verificationDetails.value = (Number(value) / 1e18).toFixed(6) + ' OKB';
          }
        }
      } else {
        verificationDetails.status = 'tx_failed_or_not_found';
      }
    } else {
      verificationDetails.status = 'invalid_tx_hash';
    }

    if (!verified) {
      return res.status(402).json({
        error: 'Payment verification failed',
        details: verificationDetails,
        message: 'Provide a valid X Layer TX hash as x-payment header',
      });
    }

    // Verified — return premium signal data
    const intelRes = await fetch('https://bobbyprotocol.xyz/api/bobby-intel').catch(() => null);
    const intel = intelRes?.ok ? await intelRes.json() : null;

    return res.status(200).json({
      ok: true,
      premium: true,
      protocol: 'x402',
      verification: verificationDetails,
      network: 'X Layer (Chain 196)',
      signal: {
        timestamp: new Date().toISOString(),
        regime: intel?.regime || 'unknown',
        fearGreed: intel?.fearGreed || null,
        briefing: intel?.briefing || 'Premium briefing unavailable',
        recommendation: 'Full premium signal with entry, TP, SL levels',
      },
      message: 'Payment verified on X Layer. Premium signals unlocked.',
    });
  } catch {
    return res.status(500).json({
      error: 'Payment verification error',
      message: 'Could not verify TX on X Layer. Try again.',
    });
  }
}
