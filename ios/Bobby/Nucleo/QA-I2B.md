# I-2b bounded release checkpoint — build 71

Full I-2b is **NOT READY**. The owner required unfinished screens to have no door at the 15:00 cutoff. SPEC5.8's new native notes/detail/undo and SPEC5.10's invitation dial are deferred. The working I-2a notes screen remains, with correction, individual deletion, delete-all and memory-off. The new detail view is absent from the app source. Dial wake remains disabled; its invitation producer and the Memory row are disabled, and native openSpeakingDial refuses entry.

SPEC5.9 owner hashing is retained. Signed native checkpoint1196/1196 on563e5452 includes guest to first account, same account return, different account reset, failed-write context refusal, build-69 migration, exact wire keys, confirmation/correction values, exact undo source/expiry and the six localized More-details URLs. Those unit results do not establish the deferred UI.

The new SE notes diagnostic passed6/8; undo04/07 failed. Later targeted fixes also failed and were never promoted. The dial Leave UI passed, but its Save traversal was not established: the XCTest WebKit slider could not synthesize an adjustment. Unreviewed or failed captures remain diagnostic folders. SPEC11.3's full es/de/pt I-2b matrix is incomplete and is not claimed.

The eight MemoryNotesShots and three SpeakingDialUITests methods are retained and explicitly skipped because their features are deferred; they are not counted as passes. MemoryInvitationShots.test03DialChip now pins the owner's scope cut: no dial chip or slider. Legacy CompanionBuild69 notes pins return to the shipping I-2a behavior. A new StoreReviewerWalk checks that the legacy notes still correct/delete/clear/turn off and that no unfinished detail, undo or dial is exposed.

Build number is71, generated from project.yml with XcodeGen. Store walk, final signed native/UI gates, final Release and screenshots are pending. No archive, upload, merge, I-3 or live Mac request. G2/G3/G5 remain the owner's release gates. Apple acceptance, real StoreKit product pricing/renewal/transactions, actual speech/audio and a real device remain separate evidence.
