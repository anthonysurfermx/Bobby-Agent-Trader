import { appLanguage, appLocale } from '../../src/lib/app-language.js';
import { VOICE_TOOLS, voiceInstructions } from './voice-tools.js';
import { voiceScreenContext } from '../../src/lib/realtime-context.js';
const REALTIME_MODEL = 'gpt-realtime-2.1';
export function realtimeConfig(body: Record<string, unknown>) {
  const { lang, voice, autoLanguage, symbol, timeframe } = body;
  const sessionLang = appLanguage(lang, 'es');
  const locale = appLocale(sessionLang, body.locale);
  const languageMode = autoLanguage === false ? sessionLang : 'auto';
  const screen = voiceScreenContext(symbol, timeframe);
  const instructions = voiceInstructions(languageMode, locale);

  // Honor the persona voice picked in onboarding — whitelisted, with the
  // env default as fallback. Legacy male/female map to their personas.
  const REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
  const LEGACY_VOICE_MAP: Record<string, string> = { male: 'ash', female: 'coral', onyx: 'ash', nova: 'coral', fable: 'cedar', mellow: 'ballad' };
  const requestedVoice = typeof voice === 'string' ? LEGACY_VOICE_MAP[voice] || voice : '';
  const fallbackVoice = process.env.REALTIME_VOICE || 'marin';
  const sessionVoice = REALTIME_VOICES.includes(requestedVoice) ? requestedVoice : (REALTIME_VOICES.includes(fallbackVoice) ? fallbackVoice : 'marin');

  return {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions: `${instructions}\n\n${screen}`,
          max_output_tokens: 1024,
          truncation: { type: 'retention_ratio', retention_ratio: 0.8, token_limits: { post_instructions: 6000 } },
          audio: {
            // Fast conversational mode: detect the pause, interrupt Bobby when
            // the human starts speaking, and answer without waiting for a
            // semantic end-of-thought pass.
            input: {
              // Configure transcription before WebRTC connects. Doing this in
              // a later session.update raced with the first user turn: Bobby
              // could hear it, but the client never received the transcript
              // that switches the chart and starts the visual brief.
              transcription: {
                model: 'gpt-4o-mini-transcribe',
                ...(languageMode === 'auto' ? {} : { language: sessionLang }),
                prompt: 'Bitcoin, Ethereum, BTC, ETH, SOL, Nvidia, NVDA, Apple, Tesla, LVMH, MC.PA, L’Oréal, OR.PA, EDP.LS, GALP.LS, PETR4.SA, VALE3.SA, Enel, ENEL.MI, Intesa Sanpaolo, ISP.MI, SAP.DE, Siemens, SIE.DE, oro, gold, long, short, stop, soporte, resistencia.',
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.48,
                prefix_padding_ms: 280,
                silence_duration_ms: 360,
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { voice: sessionVoice },
          },
          tools: VOICE_TOOLS,
          tool_choice: 'auto',
        };
}
