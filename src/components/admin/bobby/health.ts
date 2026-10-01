// What is not working in the integrations, as a list a human can act on. "Todo conectado" only when it is empty.
import type { AdminIntegrations, SearchConsoleData } from '@/lib/admin-client';

export function integrationProblems(i: AdminIntegrations, sc?: SearchConsoleData | null): string[] {
  const out: string[] = [];
  if (!i.health) out.push('Estado de las integraciones no disponible');
  else if (!i.health.revenuecatWebhook.configured) out.push('Webhook de RevenueCat sin configurar');
  if (i.revenuecat.error) out.push(`RevenueCat: ${i.revenuecat.error}`);
  if (i.appStore.error) out.push(`App Store Connect: ${i.appStore.error}`);
  if (sc?.error) out.push(`Search Console: ${sc.error}`);
  for (const name of i.missing) out.push(`Falta ${name}`);
  return out;
}
