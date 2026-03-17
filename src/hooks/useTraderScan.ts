import { useState, useRef, useMemo, useCallback } from 'react';

interface ScanResult {
  address: string;
  userName: string;
  rank: number;
  pnl: number;
  volume: number;
  botScore: number;
  classification: 'bot' | 'likely-bot' | 'mixed' | 'human';
  strategy: {
    type: string;
    directionalBias: number;
    label: string;
    confidence: number;
  };
}

export interface DetectedAgentFromScan {
  address: string;
  score: number;
  direction: 'YES' | 'NO';
  positionDelta: number;
  outcomePrice?: number;
  classification: string;
  strategy: string;
}

interface UseTraderScanReturn {
  startScan: () => void;
  cancelScan: () => void;
  progress: { scanned: number; total: number };
  allResults: ScanResult[];
  botResults: DetectedAgentFromScan[];
  isScanning: boolean;
  error: string | null;
}

const PAGE_SIZE = 50;
const TOTAL_TRADERS = 200;
const PAGES = Math.ceil(TOTAL_TRADERS / PAGE_SIZE);

export function useTraderScan(): UseTraderScanReturn {
  const [allResults, setAllResults] = useState<ScanResult[]>([]);
  const [progress, setProgress] = useState({ scanned: 0, total: TOTAL_TRADERS });
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startScan = useCallback(async () => {
    if (isScanning) return;

    // Cancel any previous scan
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsScanning(true);
    setError(null);
    setAllResults([]);
    setProgress({ scanned: 0, total: TOTAL_TRADERS });

    const accumulated: ScanResult[] = [];

    try {
      for (let page = 0; page < PAGES; page++) {
        // Check if cancelled
        if (abortRef.current.signal.aborted) break;

        const offset = page * PAGE_SIZE;
        const res = await fetch(
          `/api/scan-traders?count=${PAGE_SIZE}&offset=${offset}`,
          { signal: abortRef.current.signal }
        );

        if (!res.ok) {
          throw new Error(`Page ${page + 1}: HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.ok || !Array.isArray(data.results)) {
          throw new Error(data.error || `Page ${page + 1} failed`);
        }

        accumulated.push(...data.results);
        setAllResults([...accumulated]);
        setProgress({ scanned: accumulated.length, total: TOTAL_TRADERS });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Cancelled by user, not an error
      } else {
        setError(err instanceof Error ? err.message : 'Scan failed');
      }
    } finally {
      setIsScanning(false);
    }
  }, [isScanning]);

  const cancelScan = useCallback(() => {
    abortRef.current?.abort();
    setIsScanning(false);
  }, []);

  // Derive bot results (score >= 80) from all results
  const botResults = useMemo<DetectedAgentFromScan[]>(() =>
    allResults
      .filter(r => r.botScore >= 80)
      .map(r => ({
        address: r.address,
        score: r.botScore,
        direction: (r.strategy.directionalBias > 60 ? 'YES' : 'NO') as 'YES' | 'NO',
        positionDelta: r.volume > 0 ? Math.min(r.volume * 0.01, 5000) : 1000,
        classification: r.classification,
        strategy: r.strategy.type,
      })),
    [allResults]
  );

  return { startScan, cancelScan, progress, allResults, botResults, isScanning, error };
}
