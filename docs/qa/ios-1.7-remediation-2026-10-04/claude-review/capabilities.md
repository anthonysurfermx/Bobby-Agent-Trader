# Claude review capability preflight

Existing Claude Code 2.1.287 is authenticated with claude.ai / Max / first-party. Only redacted status metadata was saved; sandboxed Keychain access initially gave a false negative, resolved by the status-only unsandboxed check.

The requested model is `claude-opus-5-5`. The installed CLI satisfies the documented minimum version. [Official Opus model](https://platform.claude.com/docs/en/models/opus-5-5/overview).

UltraCode is available despite its omission from `--help`. Use `--settings review-settings.json` with `ultracode: true` and `--effort max` on this CLI. It is separate from `ultrathink` and `ultrareview`. [Model configuration](https://code.claude.com/docs/en/model-config), [CLI reference](https://code.claude.com/docs/en/cli-reference).

Dynamic workflows require the Workflow tool/permission. Prepared permissions allow only source reads and isolated orchestration-file creation; no shell, edits, installs or external provider/browser tools. [Workflow permissions](https://code.claude.com/docs/en/workflows).

Root recommends local CLI inference: the candidate and latest evidence are local and not pushed. `--cloud` normally clones the remote branch; forcing a bundle has separate upload semantics and limits. No cloud session or review was created. [Cloud behavior](https://code.claude.com/docs/en/claude-code-on-the-web).

`claude ultrareview --timeout 15 --no-post` also exists, but its help provides no explicit exact-model flag. It is not a substitute for the requested model/mode. Root controls route clarification and launch timing.

Prepared command is recorded by `run-review.py --dry-run`. `--start` refreshes a credential-free source/evidence snapshot and executes at most 900 seconds; elapsed time and early completion remain explicit. Model observations are checked and any mismatch stops the owned process group. Runtime mode/model acceptance remains unverified until the authorized real run.

The authorized real run subsequently completed in 882.884 seconds, exit 0, with actual Opus 5.5 responses and a completed two-agent Workflow. The principal used max; its generated Workflow selected high for both reviewers, which root accepted and the audit records. Restricted tools stayed Read/Grep/Glob/Workflow, no MCP servers, and only CLI builtin plugins were present. No source hash changed. See actual-review-audit.json for protocol evidence and README.md for subsequent operational triage; successful execution does not mean release acceptance.
