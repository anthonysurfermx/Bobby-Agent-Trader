import { useCallback, useRef } from 'react';

interface ShareScoreCardProps {
  address: string;
  pseudonym?: string | null;
  botScore: number;
  classification: string;
  signals: {
    intervalRegularity: number;
    splitMergeRatio: number;
    sizingConsistency: number;
    activity24h: number;
    winRateExtreme: number;
    marketConcentration: number;
    ghostWhale: number;
    bothSidesBonus: number;
  };
  tradeCount: number;
  portfolioValue?: number;
  profitPnL?: number | null;
}

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function ShareScoreCard({
  address,
  pseudonym,
  botScore,
  classification,
  signals,
  tradeCount,
  portfolioValue,
  profitPnL,
}: ShareScoreCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateImage = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const W = 600;
    const H = 400;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a0a0a');
    bg.addColorStop(1, '#111111');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Border
    const borderColor = classification === 'bot' ? '#ef4444' : classification === 'likely-bot' ? '#f97316' : classification === 'mixed' ? '#eab308' : '#22c55e';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Top accent line
    ctx.fillStyle = borderColor;
    ctx.fillRect(0, 0, W, 3);

    // Title
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('OPENCLAW AGENT RADAR', 24, 32);

    // Wallet address
    ctx.font = '11px monospace';
    ctx.fillStyle = '#6b7280';
    const displayName = pseudonym || `${address.slice(0, 6)}...${address.slice(-4)}`;
    ctx.fillText(displayName, 24, 52);
    if (pseudonym) {
      ctx.fillText(`${address.slice(0, 10)}...${address.slice(-6)}`, 24, 68);
    }

    // Score circle
    const cx = W - 90;
    const cy = 70;
    const r = 42;

    // Score arc background
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Score arc fill
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * botScore / 100);
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 6;
    ctx.stroke();

    // Score number
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = borderColor;
    ctx.textAlign = 'center';
    ctx.fillText(String(botScore), cx, cy + 8);

    // Classification label
    const labels: Record<string, string> = {
      'bot': 'AGENT', 'likely-bot': 'LIKELY AGENT', 'mixed': 'MIXED', 'human': 'HUMAN',
    };
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = borderColor;
    ctx.fillText(labels[classification] || 'UNKNOWN', cx, cy + 24);
    ctx.textAlign = 'left';

    // Divider
    ctx.fillStyle = '#1f1f1f';
    ctx.fillRect(24, 88, W - 48, 1);

    // Stats row
    const statsY = 108;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#6b7280';

    const stats = [
      { label: 'TRADES', value: String(tradeCount) },
      ...(portfolioValue != null ? [{ label: 'PORTFOLIO', value: formatUSD(portfolioValue) }] : []),
      ...(profitPnL != null ? [{ label: 'PNL', value: `${profitPnL >= 0 ? '+' : ''}${formatUSD(Math.abs(profitPnL))}` }] : []),
    ];

    let statX = 24;
    for (const stat of stats) {
      ctx.fillStyle = '#6b7280';
      ctx.fillText(stat.label, statX, statsY);
      ctx.fillStyle = '#d4d4d8';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(stat.value, statX, statsY + 18);
      ctx.font = '10px monospace';
      statX += 160;
    }

    // Signal bars
    const signalList = [
      { name: 'INTERVAL', val: signals.intervalRegularity },
      { name: 'SPLIT/MERGE', val: signals.splitMergeRatio },
      { name: 'SIZING', val: signals.sizingConsistency },
      { name: '24/7 ACTIVE', val: signals.activity24h },
      { name: 'WIN RATE', val: signals.winRateExtreme },
      { name: 'FOCUS', val: signals.marketConcentration },
      ...(signals.ghostWhale > 0 ? [{ name: 'GHOST', val: signals.ghostWhale }] : []),
    ];

    let sy = 150;
    for (const sig of signalList) {
      // Label
      ctx.font = '10px monospace';
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(sig.name, 24, sy);

      // Bar background
      const barX = 130;
      const barW = 350;
      const barH = 8;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(barX, sy - 8, barW, barH);

      // Bar fill
      const fillW = (sig.val / 100) * barW;
      const barColor = sig.val >= 80 ? '#ef4444' : sig.val >= 60 ? '#f97316' : sig.val >= 40 ? '#eab308' : '#22c55e';
      ctx.fillStyle = barColor;
      ctx.fillRect(barX, sy - 8, fillW, barH);

      // Value
      ctx.fillStyle = sig.val >= 70 ? '#ef4444' : '#9ca3af';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(String(sig.val), barX + barW + 10, sy);

      sy += 28;
    }

    if (signals.bothSidesBonus > 0) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`> BOTH_SIDES_BONUS: +${signals.bothSidesBonus}`, 24, sy);
      sy += 20;
    }

    // Footer
    ctx.fillStyle = '#1f1f1f';
    ctx.fillRect(0, H - 36, W, 36);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('defimexico.org/agentic-world/polymarket', 24, H - 14);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.fillText('Powered by OpenClaw', W - 24, H - 14);
    ctx.textAlign = 'left';

    return canvas.toDataURL('image/png');
  }, [address, pseudonym, botScore, classification, signals, tradeCount, portfolioValue, profitPnL]);

  const handleShare = useCallback(async () => {
    const dataUrl = generateImage();
    if (!dataUrl) return;

    const labels: Record<string, string> = {
      'bot': 'AGENT', 'likely-bot': 'LIKELY AGENT', 'mixed': 'MIXED', 'human': 'HUMAN',
    };
    const label = labels[classification] || 'UNKNOWN';
    const name = pseudonym || `${address.slice(0, 6)}...${address.slice(-4)}`;

    const tweetText = `${name} scored ${botScore}/100 on the Agent Radar\n\nClassification: ${label}\nTrades analyzed: ${tradeCount}\n\nScan any Polymarket wallet:\ndefimexico.org/agentic-world/polymarket`;

    // Try Web Share API with image (mobile), fallback to download + twitter intent
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'agent-score.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          text: tweetText,
          files: [file],
        });
        return;
      }
    } catch {
      // Fallback below
    }

    // Download image + open Twitter intent
    const link = document.createElement('a');
    link.download = `agent-score-${address.slice(0, 8)}.png`;
    link.href = dataUrl;
    link.click();

    const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank');
  }, [generateImage, address, pseudonym, botScore, classification, tradeCount]);

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />
      <button
        onClick={handleShare}
        className="text-[10px] px-2.5 py-1.5 border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20 flex items-center gap-1.5 transition-colors font-mono"
      >
        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
        SHARE SCORE
      </button>
    </>
  );
}
