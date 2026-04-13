import { useCallback, useEffect, useState } from 'react';

export interface OnChainTx {
  hash: string;
  contract: string;
  contractName: string;
  method: string;
  blockNumber: number;
  timestamp: number | null;
  valueOkb: string;
}

interface HistoricalTxResponse {
  ok: boolean;
  count: number;
  done: boolean;
  nextCursor: number | null;
  items: OnChainTx[];
}

export function useProtocolTxHistory() {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historicalTxs, setHistoricalTxs] = useState<OnChainTx[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [historyDone, setHistoryDone] = useState(false);

  const fetchHistoricalTxs = useCallback(async () => {
    if (historyLoading || historyDone) return;

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const collected: OnChainTx[] = [...historicalTxs];
      const seen = new Set(collected.map((tx) => tx.hash));
      let nextCursor = historyCursor;
      let done = false;
      let guard = 0;

      while (!done && guard < 20) {
        const params = new URLSearchParams({ limit: '50' });
        if (nextCursor !== null) {
          params.set('cursor', String(nextCursor));
        }

        const res = await fetch(`/api/protocol-tx-history?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json() as HistoricalTxResponse;
        for (const tx of json.items || []) {
          if (seen.has(tx.hash)) continue;
          seen.add(tx.hash);
          collected.push(tx);
        }

        nextCursor = json.nextCursor;
        done = json.done || nextCursor === null || (json.items?.length ?? 0) === 0;
        guard += 1;
      }

      collected.sort((a, b) => {
        if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
        return (b.timestamp ?? 0) - (a.timestamp ?? 0);
      });

      setHistoricalTxs(collected);
      setHistoryCursor(nextCursor);
      setHistoryDone(done);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [historicalTxs, historyCursor, historyDone, historyLoading]);

  useEffect(() => {
    if (historyExpanded && historicalTxs.length === 0 && !historyLoading && !historyDone) {
      fetchHistoricalTxs();
    }
  }, [fetchHistoricalTxs, historicalTxs.length, historyDone, historyExpanded, historyLoading]);

  return {
    historyExpanded,
    setHistoryExpanded,
    historicalTxs,
    historyLoading,
    historyError,
    historyDone,
    fetchHistoricalTxs,
  };
}
