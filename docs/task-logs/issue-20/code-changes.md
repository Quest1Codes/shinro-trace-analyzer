# Code Changes — Issue #20 / PR #24

Branch: `devin/1783571412-native-tcp-port` → base `main`.

Commits:
- `a07f96a` fix(clickhouse): accept native TCP port and TLS directly instead of inferring from HTTP port
- `ab1873a` fix: preserve native ClickHouse TCP settings
- `527cb49` fix(ui): add native ClickHouse port controls to database connections
- `69d634f` Merge remote-tracking branch 'origin/feat/linux-compatibility'
- `e276260` fix(ui): validate native ClickHouse port in Test & Save

## Backend

### `backend/keychain/clickhouse_credential.ts`
Extended the credential interface with explicit native TCP settings.

```ts
export interface CHCredential {
  url: string;
  user: string;
  password: string;
  port?: string;
  nativePort?: string;   // added
  nativeSecure?: boolean; // added
  secure: boolean;
}
```

### `backend/query/clickhouse.ts`
`buildClientArgs` now takes an optional credential override and prefers explicit native
settings over the hardcoded map.

Before (native port always inferred from HTTP port):
```ts
const httpPort = credentials.port || parsed.port;
if (httpPort && HTTP_TO_NATIVE_PORT[httpPort]) {
  const mapped = HTTP_TO_NATIVE_PORT[httpPort];
  args.push("--port", mapped.port);
  if (mapped.secure) args.push("--secure");
} else if (httpPort) {
  args.push("--port", httpPort);
  if (credentials.secure) args.push("--secure");
}
```

After (explicit native settings win, map is fallback):
```ts
const httpPort = credentials.port || parsed.port;
if (credentials.nativePort?.trim()) {
  args.push("--port", credentials.nativePort.trim());
  if (credentials.nativeSecure === true) args.push("--secure");
} else if (httpPort && HTTP_TO_NATIVE_PORT[httpPort]) {
  const mapped = HTTP_TO_NATIVE_PORT[httpPort];
  args.push("--port", mapped.port);
  if (mapped.secure) args.push("--secure");
} else if (httpPort) {
  args.push("--port", httpPort);
  if (credentials.secure) args.push("--secure");
} else if (credentials.secure) {
  args.push("--secure");
}
```

Also refactored native client execution into a shared `runClientCommand` helper (used by
`executeQuery`) and added a `testNativeConnection` helper used for validation:

```ts
export async function testNativeConnection(credentials: CHCredential): Promise<void> {
  const { stdout, stderr, exitCode } = await runClientCommand("SELECT 1", credentials);
  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `Process exited with code ${exitCode}`);
  }
}
```

### `backend/query/router.ts`
- `POST /credentials` accepts and persists `nativePort` / `nativeSecure`:
  ```ts
  const { url, user, password, port, secure, nativePort, nativeSecure } = req.body;
  // ...
  nativePort: typeof nativePort === "string" && nativePort ? nativePort : undefined,
  nativeSecure: typeof nativeSecure === "boolean" ? nativeSecure : undefined,
  ```
- `POST /connections` now validates the native TCP connection before persistence, deriving
  native settings from the request body or an existing credential (so it won't clobber a
  value just written by `POST /credentials`):
  ```ts
  const credentialNativePort =
    typeof nativePort === "string" && nativePort ? nativePort : existingCredential?.nativePort;
  const credentialNativeSecure =
    typeof nativeSecure === "boolean" ? nativeSecure : existingCredential?.nativeSecure;

  const credential: CHCredential = {
    url: endpoint, user, password: pass,
    port: parsed.port || undefined,
    nativePort: credentialNativePort,
    nativeSecure: credentialNativeSecure,
    secure: parsed.protocol === "https:",
  };

  if (credentialNativePort) {
    await testNativeConnection(credential); // runs even when skipTest is true
  }

  saveConnection(id, user, endpoint);
  await clickhouseKeychain.upsertCredential(credential);
  clickhouseKeychain.setActiveCredential(credential);
  ```
  HTTP validation runs first (unless `skipTest`); native validation runs whenever a native
  port is configured; SQLite/keychain writes happen only after native validation succeeds.
  Invalid native settings return `400`.

## Frontend

### `frontend/src/types/index.ts`
```ts
export interface ConnectionConfig {
  url: string;
  user: string;
  password: string;
  nativePort?: string;   // added
  nativeSecure?: boolean; // added
}
```

### `frontend/src/pages/ConnectionSetup.tsx`
- Added `nativePort` / `nativeSecure` state, a "Native TCP Port" input and a "Native TLS"
  checkbox.
- Included them in the credentials POST:
  ```ts
  nativePort: config.nativePort?.trim() || undefined,
  nativeSecure: config.nativeSecure || undefined,
  ```
- Restored native settings from active credentials, the first saved credential, and the
  selected saved credential; expanded the saved-credential types with `nativePort?` /
  `nativeSecure?`.
- Cleaned up two adjacent empty `catch {}` blocks so the touched file lints cleanly.

### `frontend/src/pages/Settings.tsx` (Database Connections modal)
- Added `connNativePort` / `connNativeSecure` state.
- Rendered a "Native TCP Port" input and a "Native TLS" checkbox.
- Passed values through Test & Save:
  ```tsx
  const result = await addConnection(
    connEndpoint.trim(),
    connUser.trim() || 'default',
    connPassword,
    undefined,
    connNativePort.trim() || undefined,
    connNativeSecure || undefined,
  );
  ```
- `resetConnectionForm` clears the new fields.

### `frontend/src/services/connectionService.ts`
`addConnection` accepts and forwards `nativePort` / `nativeSecure` in the `/connections`
request body.

### `frontend/src/context/ConnectionContext.tsx`
Expanded the `addConnection` signature to thread `nativePort` / `nativeSecure` through to
the service.

## Linux compatibility merge (`69d634f`)

Merged `feat/linux-compatibility` into the PR branch (no merge into `main`). It brought in
cross-platform credential storage via `@napi-rs/keyring`, browser launch via the `open`
package, keychain handler tests, and lock/README/doc updates. Merge completed cleanly with
the `ort` strategy.
