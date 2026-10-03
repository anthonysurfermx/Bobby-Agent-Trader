// Bobby's voice on the web: each companion keeps its own voice ("companion", the default), or one
// feminine or masculine voice speaks for all of them. The choice lives in localStorage
// `bobby_voice_gender` (iOS keeps the same three values in UserDefaults `voice.gender`), and
// useCompanionVoice sends "female" / "male" as the `voice` of POST /api/bobby-voice-free in place
// of the companion's persona. No React import here: `voiceGenderStore.subscribe` and `.get` are the
// two arguments useSyncExternalStore needs.
export type VoiceGender = 'companion' | 'female' | 'male';

const KEY = 'bobby_voice_gender';
const listeners = new Set<() => void>();
const parse = (value: unknown): VoiceGender => (value === 'female' || value === 'male' ? value : 'companion');

// Read once, then kept in memory: with storage blocked (private window, cleared site data) the
// choice still holds for the page.
let current: VoiceGender | undefined;

export const voiceGenderStore = {
  get(): VoiceGender {
    if (current === undefined) {
      try { current = parse(localStorage.getItem(KEY)); } catch { current = 'companion'; }
    }
    return current;
  },
  set(next: VoiceGender) {
    const value = parse(next);
    if (value === voiceGenderStore.get()) return;
    current = value;
    try { localStorage.setItem(KEY, value); } catch { /* the in-memory choice still applies */ }
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
