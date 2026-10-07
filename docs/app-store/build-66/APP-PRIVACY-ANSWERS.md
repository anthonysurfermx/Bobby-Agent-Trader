# Bobby 1.8 (66): App Privacy and optional product news

Prepared 2026-10-07. This is the questionnaire mapping for the updated build, not proof that App Store Connect answers were saved. Do not distribute the country-enabled build until the online declaration matches the shipped manifest and policy. The build-35 document is historical.

Collect data: **Yes**. Tracking: **No**. All types below are linked to the user or installation. No IDFA, GPS or cross-app tracking is introduced.

| Data type | Purposes in the manifest |
| --- | --- |
| Purchase History | App Functionality |
| Other User Content | App Functionality; Product Personalization |
| User ID | App Functionality; Product Personalization; Analytics; Developer's Advertising or Marketing |
| Product Interaction | App Functionality; Product Personalization; Analytics |
| Other Financial Info | App Functionality; Product Personalization |
| Device ID | App Functionality; Analytics; Developer's Advertising or Marketing |
| Other Diagnostic Data | App Functionality; Analytics |
| Email Address | App Functionality |
| Gameplay Content | App Functionality |
| Customer Support | App Functionality |
| Coarse Location | Developer's Advertising or Marketing |

The new declaration is **Coarse Location**, linked and not used for tracking: a country inferred from the connection is retained in current news preferences with the account only while product-news consent is active and current. Historical campaign participation can still reveal the country group used for a past send after withdrawal. The app does not request Core Location permission or store raw IP addresses in news records. It records the country at a preference write; VPNs and travel can affect it. Country is not nationality or residence.

The account ID and random installation ID support these promotional announcements, so User ID and Device ID also carry **Developer's Advertising or Marketing**. No new purpose is assigned to questions, financial preferences or reading activity: the language announcement filters only explicit news consent, saved language, country and compatible production push registration.

Free and Pro accounts start with news off. The seven-language native notice explains language, approximate connection country, account linkage and removal when disabled. News consent is separate from weekly briefing consent and iOS notification permission. The forward country-consent migration prevents country retention in preferences when news is off and clears country/source/time on withdrawal. Campaign participation and delivery records may remain for audit and deduplication up to account deletion; delivery records may be removed earlier when an inactive push registration is cleaned up. Deleting an account cascades its news settings and delivery rows. General campaign templates remain, with the creator link removed if that creator deletes their account. Shared briefing registrations remain a separate choice.

## Release checks

1. Apply the forward country-consent migration after the two existing news migrations; verify server-only privileges and zero country metadata for disabled settings.
2. Publish the updated six-language privacy policy and verify its served build.
3. Verify and, where necessary, save the App Store Connect questionnaire using the table above. Capture the final published declaration. Opening a form does not establish this step.
4. Verify the updated archive contains this manifest, the seven consent variants, the production push entitlement and build 66. Renew the IPA hash and archive evidence.
5. Upload to Founder/TestFlight only with the user's pending upload authorization. Wait for processing and group availability before asking the user to install it.
6. Enable dispatch only with the pending activation authorization. Test only the user's consenting account first. Apple acceptance does not establish physical receipt.

References: [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) and [privacy manifest purpose constants](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes).
