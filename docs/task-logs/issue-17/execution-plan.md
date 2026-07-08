# Issue #17 — Execution Plan

## Issue
**Linux Compatibility: macOS-specific code blocking Linux support** (issue #17, kept open — referenced via `Ref #17`).

The tool ran only on macOS due to two blocking issues and one architectural gap:

1. `index.ts` line 33 called `execSync("open ...")`. The `open` command is macOS-only, so startup crashed on Linux.
2. `backend/keychain/keychain_handler.ts` shelled out to `/usr/bin/security`, a macOS-only binary, and `isAvailable()` hardcoded `darwin`. All credential `read`/`write`/`clear` operations threw on Linux, which broke ClickHouse and AI credential storage entirely.
3. Several doc comments referenced the "macOS Keychain" even though the surrounding code is cross-platform.

## Root cause
Platform-specific mechanisms were hardcoded rather than abstracted:
- Browser launch assumed the macOS `open` command.
- Secret storage assumed the macOS `security` binary and the macOS login Keychain.

## Affected layer
Backend and the root entrypoint. No frontend changes.

## Files targeted
- `index.ts` — cross-platform browser launch.
- `backend/keychain/keychain_handler.ts` — refactor to delegate to a platform-selected backend.
- New `backend/keychain/backends/` — backend interface and implementations.
- Doc-comment cleanups: `backend/db/index.ts`, `backend/query/router.ts`, `backend/query/clickhouse.ts`.
- New tests: `backend/keychain/__tests__/keychain.test.ts`.

## Implementation strategy
Approach A (approved): dependency-free, mirroring the existing shell-out pattern.

- **Browser launch:** an inline `process.platform` switch selecting `open` (macOS), `start` (Windows), or `xdg-open` (Linux). Failure is non-fatal; the server keeps running and prints the URL.
- **Credential storage:** a `KeychainBackend` interface (`read` / `write` / `clear`) with three implementations selected at runtime:
  - `MacOSKeychainBackend` → `/usr/bin/security` (unchanged macOS behavior).
  - `LinuxSecretBackend` → `secret-tool` (libsecret / freedesktop Secret Service) when a secret service is reachable.
  - `EncryptedFileBackend` → AES-256-GCM encrypted file at `~/.shinro/.creds.enc` with `0600` permissions, used for headless Linux, containers, CI, and Windows.
  - `selectBackend()` chooses: `darwin` → Keychain; `linux` with `secret-tool` on `PATH` and `DBUS_SESSION_BUS_ADDRESS` set → libsecret; otherwise → encrypted file.
- The public `KeychainHandler<T>` API (`read` / `write` / `clear` / `invalidateCache` / `isAvailable`) is preserved, so `ai_credential.ts`, `clickhouse_credential.ts`, and their consumers require no changes.

## Clarifications and decisions
- **Maintainer package suggestions evaluated and set aside.** The issue comments suggested the `open` npm package and `@napi-rs/keyring`. The build produces a single-file executable via `bun build --compile`. `@napi-rs/keyring` is a native NAPI addon whose `.node` binding is not embedded by `bun --compile` (it resolves the binding through a dynamic require), which crashes the compiled Linux binary at load; it also lacks a headless fallback. The `open` package ships a vendored `xdg-open` asset that `bun --compile` may not embed. The dependency-free approach avoids both risks. This tradeoff was presented at CRITICAL STOP 1 and Approach A was approved.
- **Encrypted file key derivation.** The fallback derives its key from stable machine attributes (`hostname` + username) via `scrypt`. This protects data at rest from casual inspection but is reproducible by a local same-user attacker; an OS secret service is preferred when available. Documented as a known limitation.
- **Auth tag length.** During the audit, AES-GCM cipher/decipher calls were pinned to a 16-byte authentication tag to prevent truncated-tag forgery (semgrep `gcm-no-tag-length`).

## Workflow
Executed `.windsurf/workflows/address-issue.md` Steps 1–8 with all four CRITICAL STOPs confirmed by the user, applying `@skills:developer/backend` during implementation and `@skills:general-code-audit` during the pre-commit gate.
