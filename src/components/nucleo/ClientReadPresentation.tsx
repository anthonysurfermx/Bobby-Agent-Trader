import { useEffect, useRef, type ReactNode } from 'react';
import { afterVisibleFrame, type TelemetryReceipt } from '@/lib/client-telemetry';
import { renderClientRead } from '@/lib/client-telemetry-browser';

/** Mounts with the final result, after AnimatePresence has finished removing the preceding stage. */
export default function ClientReadPresentation({ receipt, blocked = false, children }: { receipt: TelemetryReceipt | null; blocked?: boolean; children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!receipt || blocked) return;
    return afterVisibleFrame(() => element.current?.querySelector('.n-synth-rows, .n-caption') ?? null, () => renderClientRead(receipt));
  }, [receipt, blocked]);
  return <div ref={element} className="flex w-full flex-col items-center">{children}</div>;
}
