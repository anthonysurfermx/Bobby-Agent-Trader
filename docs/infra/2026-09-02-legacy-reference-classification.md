# Clasificación de las 790 referencias a DeFi México (2026-09-02)

Fuente: `npx tsx scripts/infra/legacy-reference-audit.mts -v`. Criterio del
corte: cero dependencias ejecutables de DeFi México en `bobbyprotocol.xyz`.

| Grupo | Refs | Archivos | Qué es | Destino |
|---|---:|---:|---|---|
| Producto DeFi México: páginas | 163 | 28 | HomePage, Startups, Academia, TikTok feed, Comunidades, Jobs, Blog, Eventos… | **Sale del repo de Bobby** (vive en `defi-mexico-hub`). |
| Producto DeFi México: admin/usuario | 161 | 25 | `src/pages/admin/*`, `src/pages/user/*` | **Sale del repo**. |
| Producto DeFi México: servicios/datos/i18n/componentes | 435 | 76 | `stats.service`, `communities.service`, `startups.service`, `useProposals`, locales, Footer… | **Sale del repo** (lo que Bobby no importe). |
| Bobby usando infraestructura legacy | 19 | 5 | `AgenticWorldPage`, `BobbyB2BPage`, `ShareScoreCard`, `SkillsComparisonSection`, `VoiceRoom` | **Se corrige**: enlaces/copys a defimexico.org y marca. |
| API de Bobby mencionando legacy | 12 | 8 | `bobby-early-access` (espejo opcional a la newsletter), `okx-perps`, `forum-*`, `explain`, `bobby-intel` (menciones de marca en prompts/comentarios) | **Se corrige** en el paso 7. |

Además: `src/lib/supabase.ts` con fallback hardcodeado a la URL legacy y la
anon key (25 archivos lo importan, todos del producto DeFi México salvo los
que ya migraron a `bobby-db-client`); `src/config/reown.ts` con metadata de
DeFi México; `index.html`/`vercel.json` sin referencias ejecutables.

Orden propuesto para el paso 7 (después del corte de base):
1. Rutas: quitar del `App.tsx` de Bobby todas las páginas del producto
   DeFi México y sus lazy imports; `bobbyprotocol.xyz` solo sirve rutas Bobby.
2. Borrar `src/pages/admin`, `src/pages/user`, páginas y servicios del
   producto, `src/data/*` legacy, claves i18n huérfanas.
3. Reemplazar `src/lib/supabase.ts` por `bobby-db-client` en lo que quede y
   eliminar el fallback hardcodeado.
4. `legacy-reference-audit` en **cero** como gate de cierre.
