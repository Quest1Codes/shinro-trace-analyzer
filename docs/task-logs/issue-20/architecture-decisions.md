# Architecture Decisions — Issue #20 / PR #24

## AD-1: Explicit native TCP settings on the credential vs. inference from HTTP port

**Decision:** Add optional `nativePort` / `nativeSecure` to `CHCredential` and prefer them
in `buildClientArgs`, keeping `HTTP_TO_NATIVE_PORT` only as a fallback.

**Alternatives considered:**
- *Expand the hardcoded map* with more HTTP→native pairs. Rejected: still can't express
  arbitrary/non-standard pairings (the exact failure in the issue), and grows unbounded.
- *Derive native port with a fixed offset from the HTTP port.* Rejected: brittle, wrong for
  ClickHouse Cloud and custom deployments.
- *Replace the map entirely with required explicit fields.* Rejected: breaks existing
  credentials that rely on the common `8443→9440` / `8123→9000` defaults.

**Trade-off:** Two related concepts now coexist (explicit fields + fallback map). Chosen
because it is fully backward compatible while making the explicit case authoritative.

## AD-2: Precedence order in `buildClientArgs`

**Decision:**
```
nativePort → HTTP_TO_NATIVE_PORT[httpPort] → httpPort (+secure) → secure
```

**Rationale:** Explicit user intent (native settings) must win over any inference. The map
comes next to preserve existing default behavior. Falling back to the HTTP port and then to
bare `--secure` keeps prior behavior for credentials that set neither.

**Trade-off:** More branches to reason about, but each branch is mutually exclusive and
maps directly to a clear configuration case.

## AD-3: Native validation runs even when `skipTest` is true

**Decision:** In `POST /connections`, HTTP validation is skipped when `skipTest` is set, but
native validation (`testNativeConnection`) still runs whenever a native port is configured.

**Rationale:** The Connection Setup flow performs its own HTTP test separately and then
calls `/connections` with `skipTest: true`. If native validation also respected `skipTest`,
invalid native settings from that flow would be persisted and fail later — exactly the bug
reported. Native validation is cheap (`SELECT 1`) and only runs when a native port exists.

**Alternative considered:** Gate native validation behind the same `skipTest` flag.
Rejected because it reintroduces the "saves successfully, times out later" problem.

## AD-4: Validate before persistence

**Decision:** Run `testNativeConnection` before `saveConnection` / keychain upsert, so an
invalid native connection returns `400` and nothing is persisted.

**Rationale:** The user's core complaint was that invalid native settings were saved and
only failed later during query analysis. Failing fast, pre-persistence, keeps stored
credentials always usable by the native client.

**Trade-off:** Test & Save is slightly slower when a native port is set (one extra native
round-trip), which is acceptable for correctness.

## AD-5: `POST /connections` must not clobber fields written by `POST /credentials`

**Decision:** Derive native settings from the request body if present, else from the
existing stored credential.

**Rationale:** The two endpoints can be called in sequence; without carrying forward the
existing values, a `/connections` call lacking native fields would overwrite the values a
prior `/credentials` call just saved. (Raised by Devin Review; fixed in `ab1873a`.)

## AD-6: Native fields threaded through the full frontend stack

**Decision:** Add the fields to `ConnectionConfig`, both UI surfaces (Connection Setup page
and Database Connections modal), the service layer, and the context layer; restore them on
all credential-load paths (active, first saved, selected saved).

**Rationale:** Partial threading would silently drop the values on a round-trip (Devin
Review flagged that saved/active credentials lost the fields). Persisting and restoring in
every path keeps the UI consistent with what's stored.

## AD-7: Keep `Ref #20`, not `closes #20`

**Decision:** Commit bodies reference `Ref #20`; the PR does not auto-close the issue.

**Rationale:** Explicit user override — issue #20 must remain open after merge.

## AD-8: Leave the unrelated deletion bug untouched

**Decision:** Do not fix `deleteSavedCredential` (`{ account }` vs. backend's
`{ user, url }`) as part of this PR.

**Rationale:** Out of scope for issue #20; changing it would broaden the PR and mix
concerns. Flagged to the user for a separate follow-up.

## AD-9: Linux compatibility merge into the feature branch only

**Decision:** Merge `feat/linux-compatibility` into `devin/1783571412-native-tcp-port`;
never into `main`.

**Rationale:** Explicit user instruction, and it keeps `main` clean while the PR carries
the combined change set for review.
