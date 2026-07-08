# Issue #17 — Code Changes

## Overview
5 files modified, 6 files added. No dependency changes.

| File | Type | Change |
| --- | --- | --- |
| `index.ts` | modified | Added `openInBrowser()` with a platform-aware command switch; replaced the hardcoded `execSync("open ...")` call. |
| `backend/keychain/keychain_handler.ts` | modified | Refactored to delegate raw string storage to a platform-selected `KeychainBackend`; public API preserved. |
| `backend/keychain/backends/backend.ts` | added | `KeychainBackend` interface (`read` / `write` / `clear`). |
| `backend/keychain/backends/macos-backend.ts` | added | `MacOSKeychainBackend` using `/usr/bin/security`. |
| `backend/keychain/backends/secret-tool-backend.ts` | added | `LinuxSecretBackend` using `secret-tool` (libsecret). |
| `backend/keychain/backends/encrypted-file-backend.ts` | added | `EncryptedFileBackend` (AES-256-GCM, `~/.shinro/.creds.enc`, `0600`). |
| `backend/keychain/backends/select-backend.ts` | added | `selectBackend()` platform selection logic. |
| `backend/keychain/__tests__/keychain.test.ts` | added | 12 Vitest tests for the encrypted backend and selection. |
| `backend/db/index.ts` | modified | Doc comment: "macOS Keychain" → "OS credential store". |
| `backend/query/router.ts` | modified | Three doc comments generalized to "OS credential store". |
| `backend/query/clickhouse.ts` | modified | Doc comment: dropped "macOS" qualifier on mDNS note. |

## Significant changes

### 1. Cross-platform browser launch (`index.ts`)
Before:
```ts
setTimeout(() => {
  execSync(`open http://localhost:${PORT}`);
}, 3000);
```
After:
```ts
function openInBrowser(url: string): void {
  const openCmd =
    process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  try {
    execSync(`${openCmd} ${url}`);
  } catch {
    printGreen(`Could not open a browser automatically. Visit ${url}`);
  }
}
// ...
setTimeout(() => {
  openInBrowser(`http://localhost:${PORT}`);
}, 3000);
```
The failure path is non-fatal, so headless environments no longer crash on startup.

### 2. Backend abstraction (`keychain_handler.ts`)
`KeychainHandler<T>` previously embedded the macOS `security` calls directly. It now selects a backend once in the constructor and delegates:
```ts
constructor(service, account, label) {
  // ...
  this.backend = selectBackend();
}

async read(): Promise<T | undefined> {
  if (this.cache) return structuredClone(this.cache);
  const stored = await this.backend.read(this.service, this.account);
  // parse StoredKeychainBlob<T> envelope, cache, return
}
```
`write`, `clear`, `invalidateCache`, and `isAvailable` keep their original signatures. `isAvailable()` now returns `true` on darwin, linux, and win32 because the encrypted file fallback works everywhere.

### 3. Platform selection (`select-backend.ts`)
```ts
export function selectBackend(): KeychainBackend {
  if (os.platform() === "darwin") return new MacOSKeychainBackend();
  if (os.platform() === "linux" && isLinuxSecretServiceAvailable())
    return new LinuxSecretBackend();
  return new EncryptedFileBackend();
}
```
`isLinuxSecretServiceAvailable()` requires both the `secret-tool` binary on `PATH` and a `DBUS_SESSION_BUS_ADDRESS`, which distinguishes desktop Linux from headless servers, containers, and CI.

### 4. Encrypted file fallback (`encrypted-file-backend.ts`)
- Stores a JSON map keyed by `service:account`, serialized then encrypted with AES-256-GCM.
- The envelope records `version`, base64 `iv`, base64 auth `tag`, and base64 `ciphertext`.
- The auth tag length is pinned to 16 bytes on both `createCipheriv` and `createDecipheriv`.
- The file is written with mode `0o600`.
- A corrupt or undecryptable file is treated as empty rather than fatal.
- The config directory is injectable via the constructor (defaults to `~/.shinro`) to support isolated tests.

### 5. libsecret backend (`secret-tool-backend.ts`)
- `read` uses `secret-tool lookup service <service> account <account>`.
- `write` pipes the value to `secret-tool store --label <label> service <service> account <account>` via stdin.
- `clear` uses `secret-tool clear ...` and tolerates a missing entry.

### 6. Doc-comment cleanups
`"macOS Keychain"` phrasing was replaced with `"OS credential store"` in `backend/db/index.ts` and `backend/query/router.ts`, and the `resolveHostname` comment in `backend/query/clickhouse.ts` dropped its "macOS" qualifier since the mDNS handling is cross-platform.
