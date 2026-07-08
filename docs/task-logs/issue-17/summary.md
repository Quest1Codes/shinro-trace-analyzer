# Issue #17 — Summary

## Verdict
Shinro Trace Analyzer now runs on Linux. Two hardcoded macOS-only mechanisms were fixed and stale docs were generalized, with no new dependencies (the `bun --compile` single-file binary is unaffected).

- **Browser launch:** `index.ts` now selects `open` / `start` / `xdg-open` by `process.platform`, and a launch failure is non-fatal (the server keeps running and prints the URL).
- **Credential storage:** `KeychainHandler` delegates to a platform-selected `KeychainBackend` — macOS Keychain (`/usr/bin/security`), Linux libsecret (`secret-tool`) when a secret service is reachable, or an AES-256-GCM encrypted file (`~/.shinro/.creds.enc`, `0600`) for headless Linux, containers, CI, and Windows. The public API is unchanged, so all consumers are untouched.
- **Docs:** "macOS Keychain" comments were generalized to "OS credential store".

## PR
https://github.com/Quest1Codes/shinro-trace-analyzer/pull/23

The commit references `Ref #17` (not `closes`), so issue #17 stays open after merge.

## Test results (`bun run test`)
```
 RUN  v4.1.7 /home/ubuntu/repos/shinro-trace-analyzer

 Test Files  3 passed (3)
      Tests  71 passed (71)
   Duration  647ms
```
12 of the 71 tests are new (`backend/keychain/__tests__/keychain.test.ts`): round-trip read/write, encryption-at-rest, `0600` permissions, service/account isolation, overwrite, clear, corrupt-file tolerance, and per-platform backend selection (darwin, headless linux, linux with a secret service, windows).

## Pre-commit audit results (`@skills:general-code-audit`)
- **Phase 1 (manual):** JSDoc on all new classes/methods/interfaces; async error handling via `try/catch` with intentional fallbacks; no `console.log` / `TODO` / `FIXME`; new logic paths covered by tests. Pass.
- **Phase 2 (automated):**
  - Type-check: `frontend` `bunx tsc --noEmit --strict` clean; new keychain/backends files type-check clean under `--strict`.
  - Lint: the repo's configured lint is frontend-only (`frontend/eslint.config.js`); no root/backend ESLint config exists. `cd frontend && bun run lint` reports 44 pre-existing errors in `ViewsImpact.tsx` and `pdfReportService.ts` — files not touched by this change.
  - Security: `semgrep` (192 rules across the 8 changed files) reported 2 findings, both resolved → **0 findings**. Fix: pinned the AES-GCM authentication tag length to 16 bytes; annotated a false positive on the `secret-tool` CLI binary name.

## Known limitations and follow-ups
- **Encrypted file key derivation.** The fallback key derives from stable machine attributes (`hostname` + username). It protects data at rest from casual inspection but is reproducible by a local same-user attacker. Prefer an OS secret service when available. A user-supplied passphrase could strengthen this in future.
- **`secret-tool` prerequisite.** Desktop Linux keyring support requires `libsecret-tools` (`secret-tool`) installed and a running secret service; otherwise the tool transparently falls back to the encrypted file.
- **Pre-existing frontend lint errors** are out of scope for this issue and were left unchanged.
- **`backend/mcp_server/index.ts`** has pre-existing `zod` / MCP-SDK strict type mismatches, unrelated to this change and not modified here.
