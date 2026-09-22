# Bobby 1.2 (35): optional equipment

The desk previously rendered every unlocked tool and pet automatically. Earning an item and choosing to wear it are now separate decisions.

## Behavior

- Tap an earned accessory below the avatar, then **Unequip / Quitar** or **Equip / Equipar**. The detail sheet closes and the 3D companion updates immediately. Stored items remain available in the belt at reduced opacity, with an accessible status.
- The same controls work for pets and for the selected companion's owned items in the locker. Locked items remain locked.
- New tool drops offer **Keep for later / Guardar para después** alongside Equip. Both choices preserve ownership and XP.
- The actual worn selection feeds the desk and exported skin card, including its caption. An empty outfit no longer claims the user has not earned any gear.
- Choices are saved per companion and account on this device. The first account sign-in adopts the guest outfit; later account switches restore that account's saved local choices. Account deletion clears its outfit preference. These preferences are not synced to the website or another phone.
- Existing users keep their currently unlocked outfit until they choose to change it. Server progress reconciliation does not force stored accessories back onto the avatar.

## Verification

`output/optional-equipment-35/equipment-verified.xcresult` passed **147 tests, zero failures**: all 144 unit tests, two English/Spanish equipment UI flows and the existing locker ownership/lock regression. The five new unit tests cover all 18 companions and all 72 tools/pets, inventory/XP preservation, persistence, reconciliation, account isolation/deletion and an empty outfit.

The UI flows remove Momo's binoculars, relaunch, confirm they remain stored, re-equip them, remove/re-equip the pet and remove the binoculars through the locker. Spanish screenshots were visually checked: the button is legible and Momo's eyes are visible after removal. The initial test invocation was stopped during compilation to correct a UI locator; it is not counted as a completed run.

Screenshots under `output/optional-equipment-35/` are test evidence. UI launch arguments supply 500 test XP; they do not represent the owner's account or earned production XP and are not added to the App Store screenshot set. No user account, XP balance or inventory was changed for testing.

The native release candidate is built separately at `output/optional-equipment-35/Bobby-1.2-35.xcarchive`; the previous archive remains available for audit. This change requires no backend deployment or database migration. App Store signing, real Apple account lifecycle and support ownership gates from the store handoff remain unchanged.

Release archive succeeded and strict code-signature verification passed. Executable SHA-256: `7344a0e825fe238417d21c5c7ec64669e92ae43a93f013ed2bf30223786dd5d8`; matching executable/dSYM UUID: `E5690293-5622-3025-A39B-5AA3300CA61A`. Version remains 1.2 (35), with 108 bundled voice clips.

This exact archived app was installed successfully on the connected iPhone 17 Pro and launched successfully. Records: `output/optional-equipment-35/phone-install.json` and `phone-launch.json`. The owner can now tap the binoculars below Momo and select **Quitar**; the installation does not change the owner's outfit preference automatically.
