import { useEffect, useState } from 'react';
import { loadManifest, type LandManifest } from './public';

/** The shipped art catalog for components that render islands outside the studio. */
export function useLandManifest() {
  const [manifest, setManifest] = useState<LandManifest | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadManifest().then((value) => { if (alive) setManifest(value); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  return { manifest, failed };
}
