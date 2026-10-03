# Equipment locker

Catalogue and rules are taken from Bobby iOS release54:

- `Sources/CompanionTools.swift`: 54 tools, 18 pets, names/lore, approved art and body slots.
- `Sources/SquadLocker.swift`: companion order, ownership/level rules, first read, next-drop progress, collection/new badges.
- `Sources/Companion.swift`, `CompanionStore`: local per-owner unequipped IDs, automatic equipment of earned items, guest-to-account transfer with existing account outfit taking precedence.
- `Resources/Mascots/*_thumb.png` and `Assets.xcassets/{tool,pet}_*.imageset`: 90 approved images, copied without visual changes. SHA-256 digests appear in `assets/equipment/catalog.json`.
- The native Núcleo roster and level metadata supply the actual companion labels, required levels and current owner's XP. The catalogue is never a seeded player inventory.

The inspected backend exposes progress XP and Trader Land world inventory; it has
no companion-equipment ownership/equip endpoint. Gear ownership is derived from
the actual native progress snapshot, exactly as on iOS. Outfit preferences are
local and the UI states this. Equipping/unequipping changes no XP and makes no
server write. Synchronizing progress uses the existing authenticated native session.
No new claim is made about server equipment persistence or Android FCM.

Rules: tools unlock at 1/100/200 XP and pets at 500 XP. Other companions require
their roster level; the selected companion bypasses that roster gate. All earned
pieces start equipped. iOS has no equipment capacity or one-item-per-body-slot
rule: Glitch's two hand tools may both remain equipped. Android preserves this.
New badges are scoped to the owner to prevent a different account borrowing seen
state, while maintaining the iOS first-open seeding and page-visit behavior.

`EquipmentLocker(session, repository, onError)` is the native Compose entry point.
`EquipmentStore(context).forget(userId)` must be called when that account is deleted,
in addition to forgetting the native thesis/progress records. An account epoch
change clears the sheet's focus and refuses stale equipment callbacks.

The locker uses the isolated local `EquipmentStage` viewer with the 18 unchanged
iOS GLBs and approved attachment slots. It receives only the current companion's
owned/equipped items. The approved portrait is shown until the model is ready, and
after a renderer failure. A strip also shows every equipped item and updates on a
toggle. The product's pure Núcleo sphere is unchanged; gear is not inserted into it.
See `android/nucleo/equipment-stage/PROVENANCE.md` for renderer provenance and isolation.

Local verification: `EquipmentRulesTest` has six passing JVM cases in the generated
`testDebugUnitTest` results, including account/guest isolation and the two-hand rule.
Main Android sources compiled with the integrated stage. This is not physical-device
or deployed-backend evidence.
