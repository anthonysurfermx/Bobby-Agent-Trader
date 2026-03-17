import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Obtiene el avatar de Twitter/X usando unavatar.io
 * @param twitterUrl - URL de Twitter/X (puede ser twitter.com o x.com)
 * @returns URL del avatar o null si no se puede extraer
 */
export function getTwitterAvatar(twitterUrl: string | null | undefined): string | null {
  if (!twitterUrl) return null;
  try {
    // Soporta tanto twitter.com como x.com
    let username = twitterUrl.split('twitter.com/')[1]?.split(/[/?#]/)[0];
    if (!username) {
      username = twitterUrl.split('x.com/')[1]?.split(/[/?#]/)[0];
    }
    if (username) {
      username = username.replace('@', '');
      return `https://unavatar.io/twitter/${username}`;
    }
    return null;
  } catch {
    return null;
  }
}
