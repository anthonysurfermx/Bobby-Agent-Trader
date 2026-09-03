# Ensayo del manifiesto T0 (2026-09-03, solo lectura, legacy `egpixaunlnzauztbrnuz`)

Script: `scripts/infra/t0-manifest.sql`. Se corre en legacy en el instante del freeze y en el destino
tras el restore; ambas salidas deben coincidir fila por fila (conteo, timestamp máximo y md5 del
contenido). Este ensayo NO es el T0 real: solo valida el script y deja una línea base.

| Tabla | Filas | Máx. timestamp | md5 |
|---|---:|---|---|
| agent_cycles | 3 402 | 2026-09-02 12:01:34 | 7bda060b… |
| agent_events | 7 256 | 2026-09-02 12:01:47 | 2514c5ea… |
| forum_threads | 3 399 | 2026-09-02 12:01:45 | aa13e7bf… |
| forum_posts | 10 980 | 2026-09-02 12:01:45 | 1d690579… |
| agent_messages | 356 | 2026-04-22 | a1260a4a… |
| mcp_payment_challenges | 432 | 2026-08-18 | d5472454… |
| memory_objects | 221 | 2026-08-30 | d9eab847… |
| api_cache | 146 | 2026-09-02 23:50 | c9f06022… (volátil: rate limits y nonces; se excluye del criterio de igualdad) |
| user_digests | 87 | 2026-09-02 12:01:47 | 51f94fa0… |
| sandbox_runs | 15 | 2026-04-16 | 9632efce… |
| telegram_activation_sessions | 10 | — | 122a6e8c… |
| user_interests | 8 | 2026-03-22 | 2db3e4ed… |
| agent_profiles / telegram_groups / dm_conversations | 2 / 2 / 2 | — | 826800a1… / 2199a294… / a0f8a877… |
| hardness_agents / _sessions / _proofs, telegram_subscriptions, bobby_control | 1 cada una | — | 901b9345… / c22135f6… / c3407ae4… / 41405840… / 4db96de5… |
| 16 tablas restantes | 0 | — | d41d8cd9… (vacías) |

Notas: `api_cache` es la única tabla que cambia por sí sola (contadores y nonces) y no forma parte del
criterio; `bobby_control` cambia su `updated_at` con cada flip de flag. Todo lo demás solo se mueve por
ciclos, webhook y usuarios: con freeze activo y crons apagados, los md5 deben ser idénticos en destino.
