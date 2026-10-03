import { locale as currentLocale } from './companions/i18n';
/** Keep small prices visible and preserve the actual quote currency. */
export function deskPrice(value: number, currency = 'USD', locale = currentLocale()): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
  const options: Intl.NumberFormatOptions = { style: 'currency', currency: code, maximumFractionDigits: value >= 1000 ? 0 : value >= 1 ? 2 : 8 };
  if (value < 1) options.maximumSignificantDigits = 4;
  return new Intl.NumberFormat(locale, options).format(value);
}
