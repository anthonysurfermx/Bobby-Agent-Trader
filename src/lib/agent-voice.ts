// ============================================================
// agent-voice.ts — single source of truth for the persona voice
// the user picked in onboarding. Every speaking surface (chat TTS,
// realtime desk, previews) resolves through here so the chosen
// voice is real, not cosmetic. Theatrical debate voices
// (alpha/red) are separate and never overridden.
// ============================================================

const PERSONA_VOICES = ['coral', 'ballad', 'sage', 'ash'];

export function getConfiguredVoice(): string | null {
  try {
    const raw = localStorage.getItem('agent_profile');
    if (!raw) return null;
    const v = JSON.parse(raw)?.voice;
    if (typeof v !== 'string') return null;
    if (PERSONA_VOICES.includes(v)) return v;
    // Legacy profiles predate voice personas
    if (v === 'male') return 'ash';
    if (v === 'female') return 'coral';
    return null;
  } catch {
    return null;
  }
}
