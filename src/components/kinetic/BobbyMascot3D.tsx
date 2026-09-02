// ============================================================
// BobbyMascot3D — the 3D mascot (Duolingo-energy, three.js)
// Chubby blob-bot: eyes follow the cursor, tap = squash bounce,
// mouth syncs to voice. Same interface as the SVG BobbyMascot,
// which stays as the no-WebGL fallback.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { MascotScene, type MascotState } from './mascot3d/MascotScene';
import BobbyMascot from './BobbyMascot';
import { type MascotLook, getPalette } from '@/lib/mascot';
import type { OrbState } from '@/components/adams/VoiceOrb';

interface BobbyMascot3DProps {
  look: MascotLook;
  state?: OrbState;
  analyser?: AnalyserNode | null;
  /** Normalized 0..1 voice level for sources without an AnalyserNode (realtime desk) */
  level?: number | null;
  /** Bump to make the mascot react (squash bounce) without remounting WebGL */
  reactKey?: number;
  size?: number;
  className?: string;
  /** Gear worn on the body + pet, as sprites anchored to the character. */
  attachments?: Array<{ url: string; slot: string; spin?: boolean; glow?: string }>;
  /** Bump with `equipUrl` set to replay the equip flight for that attachment. */
  equipUrl?: string | null;
  equipToken?: number;
}

export default function BobbyMascot3D({ look, state = 'idle', analyser = null, level = null, reactKey, size = 160, className, attachments, equipUrl, equipToken }: BobbyMascot3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MascotScene | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const palette = getPalette(look);

  // Init once
  useEffect(() => {
    if (!hostRef.current || sceneRef.current || webglFailed) return;
    const scene = new MascotScene();
    if (!scene.init(hostRef.current, size)) {
      scene.dispose();
      setWebglFailed(true);
      return;
    }
    sceneRef.current = scene;
    scene.onContextLost = () => {
      // iOS reclaimed the GL context — degrade to the SVG mascot
      scene.dispose();
      sceneRef.current = null;
      setWebglFailed(true);
    };
    scene.setLook(look);
    scene.setState(state as MascotState);
    scene.setAnalyser(analyser);

    // Eyes follow the cursor anywhere on screen (the Duolingo trick)
    const onMove = (e: MouseEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      scene.setPointer(
        (e.clientX - cx) / (window.innerWidth / 2),
        (e.clientY - cy) / (window.innerHeight / 2),
      );
    };
    window.addEventListener('mousemove', onMove);

    return () => {
      window.removeEventListener('mousemove', onMove);
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglFailed]);

  useEffect(() => { sceneRef.current?.setLook(look); }, [look.body, look.eyes, look.accessory, look.avatar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sceneRef.current?.setState(state as MascotState); }, [state]);
  useEffect(() => { sceneRef.current?.setAnalyser(analyser); }, [analyser]);
  useEffect(() => { sceneRef.current?.setLevel(level); }, [level]);
  const attachmentsKey = (attachments ?? []).map((a) => `${a.url}@${a.slot}${a.spin ? '~' : ''}${a.glow ?? ''}`).join('|');
  useEffect(() => { sceneRef.current?.setAttachments(attachments ?? []); }, [attachmentsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (equipUrl && equipToken) sceneRef.current?.playEquip(equipUrl); }, [equipToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (reactKey !== undefined && reactKey > 0) sceneRef.current?.bounce(); }, [reactKey]);
  useEffect(() => { sceneRef.current?.resize(size); }, [size]);

  if (webglFailed) {
    return <BobbyMascot look={look} state={state} analyser={analyser} size={size} className={className} />;
  }

  return (
    <div
      ref={hostRef}
      className={className}
      onPointerDown={() => sceneRef.current?.bounce()}
      style={{
        width: size,
        height: size,
        cursor: 'pointer',
        filter: `drop-shadow(0 0 ${Math.round(size * 0.16)}px rgba(${palette.glow}, 0.45))`,
      }}
    />
  );
}
