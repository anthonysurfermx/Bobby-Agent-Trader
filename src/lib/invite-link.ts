// The invitation link (https://bobbyprotocol.xyz/i/CODE, built in api/_lib/referrals.ts) seen from the page
// that receives it: what counts as a code, where the buttons point, and which device is asking.
// Pure functions with no browser globals, so scripts/test-invite-link.mjs exercises them as they ship.
import { APP_STORE_URL } from './app-store';

/** Same format as the server (api/_lib/referrals.ts): eight of A–Z and 2–9 without I, O, 0 and 1. */
const INVITE_CODE = /^[A-HJ-NP-Z2-9]{8}$/;

/** The code of /i/:code, uppercased. null for anything that is not an invite code. */
export function inviteCodeFrom(raw: unknown): string | null {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return INVITE_CODE.test(code) ? code : null;
}

/** Opens the installed iPhone app on the invitation (the scheme registered in ios/Bobby/project.yml). */
export const appInviteUrl = (code: string): string => `bobbyprotocol://invite/${code}`;

/** The numeric App Store id, read from the one place the listing is named. null if that URL ever loses it. */
export function appStoreId(url: string = APP_STORE_URL): string | null {
  return /\/id(\d+)(?:[/?#]|$)/.exec(url)?.[1] ?? null;
}

/**
 * Content of <meta name="apple-itunes-app">: Safari's own banner for the app, handing it this invitation.
 * Without a page URL (an invalid link) the banner still names the app but carries no argument.
 */
export function smartBannerContent(pageUrl: string | null, storeUrl: string = APP_STORE_URL): string | null {
  const id = appStoreId(storeUrl);
  if (!id) return null;
  return pageUrl ? `app-id=${id}, app-argument=${pageUrl}` : `app-id=${id}`;
}

export type InviteDevice = 'ios' | 'android' | 'other';

/** iPhone, iPad (iPadOS presents itself as a Mac with a touch screen) or Android; everything else is a computer. */
export function inviteDevice(userAgent: string, maxTouchPoints = 0): InviteDevice {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'other';
}
