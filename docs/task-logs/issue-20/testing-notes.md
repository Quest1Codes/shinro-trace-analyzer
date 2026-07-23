# Testing Notes — Issue #20 / PR #24

## Build

- `bun build.ts` — **passed** (frontend bundle + embedded assets + platform executable).
- Local build initially failed after the Linux compatibility merge with
  `Could not resolve: "open"`. Root cause: stale local dependencies. Fixed with:
  ```bash
  bun install   # restored @napi-rs/keyring@1.3.0 and open@11.0.0
  bun build.ts  # passed
  ```
- The same error later occurred on the user's macOS. Same remediation advised
  (`bun install` then `bun run build.ts`); the compiled macOS binary itself started fine —
  the failure was only in the compile step, not at runtime.
- Generated executables (e.g. `shinro-analyzer-linux-x86_64`) were removed before commits
  so no binaries entered the PR.

## Unit / integration tests (`bun test`)

- Keychain suite `backend/keychain/__tests__/keychain_handler.test.ts`: **5 passed**
  (after `bun install`). Covers keyring read/deserialize, serialize/write, clearing
  entries, caching/cloning empty arrays, and returning `undefined` on read failure.
- Remaining suites: **pre-existing, unrelated failures**, not caused by this change:
  - `backend/parser/__tests__/parser.test.ts` — fails with `vi is not defined`.
  - `backend/helpers/__tests__/fs.test.ts` — `vi.mock('fs')` incompatible with the active
    Bun test setup.
- Aggregate after dependency install: `5 pass / 42 fail / 1 error` — the failures/errors
  are all in the parser/fs suites above and predate this work.

## Lint / type-check

- Frontend lint (`cd frontend && bun run lint`): 47 pre-existing repo-wide problems
  (42 errors, 5 warnings). Targeted lint of the touched files
  (`Settings.tsx`, `connectionService.ts`, `ConnectionContext.tsx`,
  `ConnectionSetup.tsx`) introduced **no new** issues.
- Type-check (`tsc --noEmit -p frontend/tsconfig.app.json`): only pre-existing errors; none
  introduced by this change.
- No Prettier/formatter config in the repo, so no formatting step to run.

## CI

- After the final validation commit `e276260`: **5 passed, 0 failed, 0 pending**; PR #24
  reported open and mergeable.

## Manual / functional testing (by the user)

- **Native TCP Port field works** end-to-end with ClickHouse Cloud (user-confirmed).
- **Native validation in Test & Save**: entering an invalid native port (e.g. `9000` for
  ClickHouse Cloud) now fails immediately at save time, instead of saving successfully and
  timing out later during native-client query analysis — the reported bug.

## Edge cases covered by the implementation

- Explicit `nativePort` with `nativeSecure=true` → `--port <nativePort> --secure`.
- Explicit `nativePort` with `nativeSecure=false`/unset → `--port <nativePort>` (no TLS),
  even when the HTTP port would map to a TLS native port.
- No native port, HTTP port in `HTTP_TO_NATIVE_PORT` → existing mapped behavior preserved.
- No native port, HTTP port not in the map → uses the HTTP port with `credentials.secure`.
- Whitespace-only / padded native port → trimmed before use (`nativePort.trim()`); empty
  after trim is treated as unset.
- `POST /connections` without native fields after `POST /credentials` set them → values
  carried forward from the existing credential (not clobbered).
- `skipTest=true` (Connection Setup flow) → HTTP test skipped, native validation still runs
  when a native port is configured.

## Limitations

- End-to-end validation of a *deliberately mismatched* HTTP/native port pairing could not
  be reproduced in this environment (no ClickHouse instance with intentionally mismatched
  ports available here); it was confirmed by the user against ClickHouse Cloud.
- The pre-existing parser/fs test failures and the repo-wide lint baseline were not
  addressed — out of scope for this issue.
- The unrelated saved-credential deletion payload mismatch
  (`deleteSavedCredential` sends `{ account }`, backend DELETE expects `{ user, url }`)
  remains open and was intentionally left for a separate follow-up.
