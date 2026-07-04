// ============================================================
// api/_lib/telegram.ts — Unified Telegram Bot API helpers
// ------------------------------------------------------------
// One place to send messages and voice/audio. Replaces the
// per-endpoint copies that all proxied a now-dead TTS droplet.
// ============================================================

import { generateSpeech, type SpeechResult } from './tts.js';

const api = (token: string, method: string) =>
  `https://api.telegram.org/bot${token}/${method}`;

export async function tgSendMessage(
  token: string,
  chatId: number | string,
  text: string,
  opts: { parseMode?: string; disablePreview?: boolean; replyMarkup?: unknown } = {},
): Promise<boolean> {
  try {
    const res = await fetch(api(token, 'sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts.parseMode ?? 'HTML',
        disable_web_page_preview: opts.disablePreview ?? true,
        ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
      }),
    });
    if (!res.ok) console.error('[telegram] sendMessage', res.status, (await res.text()).slice(0, 180));
    return res.ok;
  } catch (err) {
    console.error('[telegram] sendMessage error', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function tgSendSpeech(
  token: string,
  chatId: number | string,
  speech: SpeechResult,
  caption?: string,
): Promise<boolean> {
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    const field = speech.telegramMethod === 'sendVoice' ? 'voice' : 'audio';
    form.append(field, new Blob([new Uint8Array(speech.audio)], { type: speech.mime }), speech.filename);
    if (caption) {
      form.append('caption', caption.slice(0, 1024));
      form.append('parse_mode', 'HTML');
    }
    if (field === 'audio') {
      form.append('title', 'Bobby — Análisis');
      form.append('performer', 'Bobby Agent Trader');
    }
    const res = await fetch(api(token, speech.telegramMethod), { method: 'POST', body: form });
    if (!res.ok) console.error('[telegram] sendSpeech', speech.telegramMethod, res.status, (await res.text()).slice(0, 180));
    return res.ok;
  } catch (err) {
    console.error('[telegram] sendSpeech error', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function tgSendPhoto(
  token: string,
  chatId: number | string,
  image: Buffer,
  caption?: string,
  replyMarkup?: unknown,
): Promise<boolean> {
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'chart.png');
    if (caption) {
      form.append('caption', caption.slice(0, 1024));
      form.append('parse_mode', 'HTML');
    }
    if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
    const res = await fetch(api(token, 'sendPhoto'), { method: 'POST', body: form });
    if (!res.ok) console.error('[telegram] sendPhoto', res.status, (await res.text()).slice(0, 180));
    return res.ok;
  } catch (err) {
    console.error('[telegram] sendPhoto error', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Convenience: synthesize `voiceText` and deliver it (voice bubble or audio
 * clip depending on the TTS provider), with an optional short caption.
 * Returns false if synthesis or delivery failed — caller should then fall
 * back to a plain text message.
 */
export async function tgSendVoiceAnalysis(
  token: string,
  chatId: number | string,
  voiceText: string,
  caption?: string,
  lang = 'es',
): Promise<boolean> {
  const speech = await generateSpeech(voiceText, { lang });
  if (!speech) return false;
  return tgSendSpeech(token, chatId, speech, caption);
}
