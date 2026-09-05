# Authentication recovery and native read provenance

Status: production NO-GO; this update does not complete twenty-stock admission.

GitHub CLI authentication was restored. Supabase MCP was configured and OAuth
login completed with explicit organizations, projects, database and environment
read scopes. Automatic discovery had requested unsupported scopes (HTTP 400);
the explicit read scopes resolved registration. No credential is included here.
The current task runtime still reports the newly configured MCP server as unknown;
no production database query or migration was performed.

Native branch `codex/stock-expansion-ios`, commit `2efd395`, now requests a
server-issued thesis read reference during authenticated debates, validates its
UUID shape and carries it through the persisted award queue into progress sync.
Guests and older queued events have no fabricated reference. The server remains
responsible for identity binding, origin validity and bonus eligibility.

The signed simulator app-hosted BobbyTests suite passed **23/23**, zero failures,
including persisted origin round-trip, legacy event decoding and malformed/error
response cases. Command and simulator are the same as the five-stock report;
the new log is `/tmp/bobby-ios-thesis-progress.log`. This does not certify a live
authenticated progress round-trip or an execution bonus on production.

The complete native patch from `91ab7c2` is stored in
`evidence/2026-09-05-ios-five-stocks-and-provenance.patch`; it supersedes the earlier
five-stock patch. The native changes are in an isolated clean worktree.

Remaining gates: exact-commit CI, actual production project/migration preflight,
recoverable backup and coordinated cutover, independent release verdicts, and
additional venue/issuer integration for the fifteen unimplemented stock routes.
Supabase configuration/login is not database validation. Simulator tests are not
GO 3/3. No production deployment, migration or trading activation occurred.
