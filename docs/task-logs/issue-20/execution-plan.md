# Execution Plan — Issue #20

> Note: the task-log directory is named `issue-20` to match the actual issue worked on
> (the request referenced `issue-17`, but all work in this session addressed issue #20 / PR #24).

## Issue

**Title:** Hardcoded port mapping breaks when native TCP port doesn't match the HTTP port.

The native ClickHouse TCP port and TLS setting were inferred from the HTTP port via a
hardcoded map in `buildClientArgs` (`backend/query/clickhouse.ts`):

```ts
const HTTP_TO_NATIVE_PORT: Record<string, { port: string; secure: boolean }> = {
  "8443": { port: "9440", secure: true },
  "8123": { port: "9000", secure: false },
};
```

Any non-standard setup — e.g. HTTP on `8443` but native TCP on `9000` without TLS —
was always forced to `9440` with TLS, causing native client operations to time out.

## Root Cause

`buildClientArgs` had no way to receive an explicit native TCP port/TLS. It derived them
purely from the HTTP port, so a mismatch between the HTTP endpoint and the native TCP
endpoint could never be expressed.

## Fix Strategy (issue's preferred approach)

Let a credential carry the native TCP port and native TLS directly. Use those explicit
values when present, otherwise fall back to the existing map (fully backward compatible).

Resolution precedence in `buildClientArgs`:

```
if credentials.nativePort:              --port nativePort  [+ --secure if nativeSecure]
else if HTTP_TO_NATIVE_PORT[httpPort]:  (existing map, unchanged)
else if httpPort:                       --port httpPort     [+ --secure if secure]
else if credentials.secure:             --secure
```

The hardcoded map is retained as the default for common cases, so existing configs are
unaffected. When native settings are provided explicitly, the TCP port/TLS is no longer
inferred from the HTTP port at all — so any port pairing works. This addresses the root
cause rather than masking it.

## Scope / Files

- `backend/keychain/clickhouse_credential.ts` — add optional `nativePort?: string`,
  `nativeSecure?: boolean` to `CHCredential`.
- `backend/query/clickhouse.ts` — `buildClientArgs` prefers explicit native settings;
  keeps `HTTP_TO_NATIVE_PORT` as fallback, then HTTP port.
- `backend/query/router.ts` — `POST /credentials` accepts/persists the new fields.
- `frontend/src/types/index.ts` — `ConnectionConfig` extended.
- `frontend/src/pages/ConnectionSetup.tsx` — add "Native TCP Port" input + "Native TLS"
  toggle, sent with the credentials POST.

## Clarifications / Decisions During the Session

1. **Scope decision (Step 3 approval):** the user chose **full end-to-end** (backend +
   frontend fields) rather than backend-only.
2. **Commit convention override:** commit bodies use `Ref #20`, never `closes #20`, so
   issue #20 stays open.
3. **Database Connections modal:** the initial fix added fields to the Connection Setup
   page only. On user request, the same native port/TLS controls were later added to the
   Settings → Database Connections modal.
4. **Native validation during Test & Save:** on user report that Test & Save only
   validated HTTP, native TCP validation was added so invalid native settings fail
   immediately instead of being persisted and timing out later.
5. **Linux compatibility merge:** `feat/linux-compatibility` was merged into the PR branch
   on user request (no merge into `main`).
6. **Pre-existing deletion bug left untouched:** `deleteSavedCredential` sends
   `{ account }` but the backend DELETE expects `{ user, url }`. Identified but
   intentionally out of scope for this issue.

## Workflow

Followed `.windsurf/workflows/address-issue.md` (Steps 1–8) with all four CRITICAL STOP
approvals: plan approval, post-implementation approval, post-verification approval, and
PR-creation approval.
