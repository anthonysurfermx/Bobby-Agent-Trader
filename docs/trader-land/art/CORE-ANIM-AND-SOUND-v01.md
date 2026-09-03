# Trader Land — bloque "animación orbital + sonido" v01 (Claude, 2026-09-03)

Sin créditos de Higgsfield. Rama `feat/trader-land-art`.

## Capas de animación del Aura Core (`public/land/v1/gate-A/aura_core/ne/anim_*_1024.png`)
Derivadas del `stage1_albedo` por máscaras (esfera = disco de radio 177 px en el master 2048 centrado en
(1020, 660); aro = anillo 0.98–2.05 r sin los tendones emerald; cuerpo = resto). Orden de composición:
`body → ring_back → sphere → ring_front`. Recompuestas coinciden con el stage 1 original.
Regla: la esfera flota (seno, 6–8 s, ±2 % de la altura) con su glow; los aros solo inclinan/pulsan —
**no rotar** los aros: el interior del aro está horneado en el render y una rotación revelaría el corte.
Las motas orbitales son partículas de runtime. Registrado en `asset-manifest.json` → `aura_core.animation_layers`.

## Familia de sonido (`public/land/v1/audio/`, `audio-manifest.json`)
Sintetizada con `scripts/infra/trader-land-sound.py` (numpy; reproducible). WAV 48 kHz / 24-bit estéreo
como master; si `ffmpeg` está disponible, AAC 96 kbps como variante de entrega.

| Cue | Dur. | Diseño |
|---|---:|---|
| `land_enter_vrum` | 0.7 s | fundamental 90→140 Hz + armónicos 2º–4.5º + cola de aire |
| `aura_core_loop` | 16 s | 110 Hz + sub 55 Hz (audífonos) + armónicos 220/330/440, un ciclo de LFO por loop → **costura 0** |
| `orbit_whoosh_a/b/c` | 1.4–1.9 s | ruido filtrado a 3 alturas, cruce estéreo lento |
| `seed_reveal` | 0.9 s | tres notas suaves E4 G4 B4, sin fanfarria |
| `placement_tick` / `placement_invalid` | 80 / 120 ms | click madera-metal 720 Hz / thunk apagado sin alarma |
| `placement_confirm` | 0.45 s | encaje mecánico + pulso de aura a 120 Hz |
| `bloom_complete` | 1.4 s | acorde abierto A3 C#4 E4 A4 con filtro que se abre + brillo |
| `fog_reveal` | 1.8 s | barrido ancho + aire, apertura estéreo |
| `five_attributes_chord` | 2.2 s | cinco armónicos entran uno por atribución |

Loudness: ambiente −24 dBFS RMS, one-shots −20…−16 dBFS RMS (LUFS finales en la mezcla). El runtime
respeta mute, modo silencio, Reduce Motion y ducking de voz 8–12 dB. Sin loop permanente en v1 salvo
`aura_core_loop` dentro de Trader Land.

## Qué falta (runtime, Codex)
Motor de partículas para las motas, flotación de la esfera, pulso de aros por atribución, y el mapeo
de cues a eventos (entrar, seleccionar, válido/inválido, confirmar, bloom, niebla, acorde de cinco).
