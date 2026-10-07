// The invitation link (https://bobbyprotocol.xyz/i/CODE, built in api/_lib/referrals.ts) seen from the page
// that receives it: what counts as a code, where the buttons point, and which device is asking.
// Pure functions with no browser globals, so scripts/test-invite-link.mts exercises them as they ship.
import { APP_STORE_URL } from './app-store';

/** Same format as the server (api/_lib/referrals.ts): eight of A–Z and 2–9 without I, O, 0 and 1. */
const INVITE_CODE = /^[A-HJ-NP-Z2-9]{8}$/;

/** The code of /i/:code, uppercased. null for anything that is not an invite code. */
export function inviteCodeFrom(raw: unknown): string | null {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return INVITE_CODE.test(code) ? code : null;
}

/**
 * Whether the iPhone app people can install today accepts an invitation. false until Bobby 1.8 is on the App Store:
 * 1.5–1.7 open on bobbyprotocol:// and do nothing with it, have nowhere to type a code, and an account created
 * there starts the server's new-account window (REFERRAL.newAccountDays) with no claim. While false an iPhone gets
 * the web-first page, because the web desk is the one place that claims today. Turn it on once 1.8 is the version
 * the App Store serves, not when the web merges: the web deploys first.
 */
export const IOS_INVITE_LIVE = false;

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

/**
 * Which way in the page offers. 'app': the App Store first, then the installed app, then the web (an iPhone, once
 * the app accepts invitations). 'android': the code and the web. 'web': the web first, the App Store second.
 */
export type InviteLayout = 'app' | 'android' | 'web';
export function inviteLayout(device: InviteDevice, iosLive: boolean = IOS_INVITE_LIVE): InviteLayout {
  if (device === 'android') return 'android';
  return device === 'ios' && iosLive ? 'app' : 'web';
}
