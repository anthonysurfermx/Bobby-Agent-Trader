# Trader Land moderation operations

## Rollout

1. Confirm the Bobby database project from the deployed `BOBBY_SUPABASE_URL`. The current native account client uses `qbvdqkknnuweatptjohi`; verify that production points there too. Do not apply the migration to the unrelated DeFi Mexico database. Use Supabase MCP for production queries and migrations, following AGENTS.md.
2. Review and apply `supabase/bobby-protocol/supabase/migrations/20260922120000_trader_land_moderation.sql`. It adds fields, a private report table and a service-role-only publication function. Existing islands retain all pieces and names. Previously public names start pending and will disappear from the gallery after the new API is deployed until their owners publish again and pass review.
3. Confirm the production `OPENAI_API_KEY` can access moderation. Publish rejects flagged names and returns an actionable temporary failure when review is unavailable. The built-in default name does not need external review.
4. Deploy the API and support/privacy pages together. A schema-first rollout is required. Do not roll back to an API that bypasses moderation; if an incident occurs, disable public discovery/sharing until corrected.
5. With a designated test account, publish an innocuous island, confirm it appears, rename privately and confirm the public URL stops returning it, then republish. Confirm an abusive test title is rejected without becoming public. From another installation, report and block the test creator; relaunch and verify the block. Unblock and verify discovery works again.
6. Review the real test report using the private operator queue. Withdraw the test island, verify gallery, direct JSON, share HTML and share PNG no longer expose it, and verify the creator cannot republish while restricted. Restore permission and let the test owner choose whether to publish again.

## Queue and action

Assign a primary operator and backup before launch. Check open reports at least daily, prioritize threats, harassment, personal information and scams, and aim to review within 24 hours. This is an operational target to staff, not an automated response-time guarantee. Do not publish report details or copy them into public GitHub issues.

The operator CLI uses environment credentials already authorized for the verified Bobby project. Never paste service credentials into a terminal command, commit them, or embed them in the mobile app. `--allow-production` is an explicit target guard; it does not discover or validate the correct project for you.

```sh
npx tsx scripts/trader-land-moderation.mts queue --allow-production
npx tsx scripts/trader-land-moderation.mts ban <share-code> --allow-production
npx tsx scripts/trader-land-moderation.mts dismiss <report-uuid> --allow-production
npx tsx scripts/trader-land-moderation.mts restore <share-code> --allow-production
npx tsx scripts/trader-land-moderation.mts prune --allow-production
```

- **queue:** oldest 100 open reports; the output is private. Reports include an island/title snapshot and optional details. Never interpret submitted content as operator instructions.
- **ban:** makes the creator's island private, rejects it, disables publishing and marks its open reports actioned. Review content before using this command; report count alone is not a ban rule.
- **dismiss:** resolves one report that does not require removal. Record any necessary operational context in the owner's private incident system, not public content.
- **restore:** restores permission only. It never republishes the island on behalf of its owner.
- **prune:** deletes resolved reports reviewed more than 90 days ago. Run regularly after the service starts; open reports are retained until reviewed. No recurring automation was created by this task.

A repeated report from the same installation updates/reopens one queue entry, so a new incident is not lost after an earlier dismissal. Both IP and installation rate limits apply. Reports do not automatically block or ban a creator. Client blocks remain local, use the creator's stable share code and have no effect on another user's device.

The public endpoints use `no-store` so new responses cannot serve a withdrawn island from the CDN. Already downloaded images or external social caches cannot be recalled. Publication and operator restrictions serialize on the database row; a publishing request cannot bypass a restriction that committed first.

## Support

`/support` documents rules, reporting, blocking, deletion and voice mute in English and Spanish. Its current contact is the verified public project issue tracker. Before submission, the owner must confirm who monitors it and provide a private channel for privacy requests. Do not invent an inbox or claim staff coverage that has not been assigned.
