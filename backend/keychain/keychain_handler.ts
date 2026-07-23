import { AsyncEntry } from "@napi-rs/keyring";

export interface StoredKeychainBlob<T> {
  version: 1;
  data: T;
}

export interface KeyringEntry {
  getPassword(): Promise<string | undefined>;
  setPassword(password: string): Promise<void>;
  deleteCredential(): Promise<boolean>;
}

export type KeyringEntryFactory = (
  service: string,
  account: string,
) => KeyringEntry;

function createKeyringEntry(service: string, account: string): KeyringEntry {
  return new AsyncEntry(service, account);
}

export class KeychainHandler<T> {
  private readonly entry: KeyringEntry;

  private cache: T | null = null;
  private hasCache = false;

  constructor(
    service: string,
    account: string,
    _label: string,
    createEntry: KeyringEntryFactory = createKeyringEntry,
  ) {
    this.entry = createEntry(service, account);
  }

  static isAvailable(): boolean {
    return true;
  }

  async read(): Promise<T | undefined> {
    if (this.hasCache) {
      return this.cache == null ? undefined : structuredClone(this.cache); // clone to prevent external mutation
    }

    let value: T | undefined;
    let readSucceeded = true;

    try {
      const raw = await this.entry.getPassword();
      if (raw) {
        const blob = JSON.parse(raw) as StoredKeychainBlob<T>;
        value = blob.data;
      }
    } catch {
      readSucceeded = false;
      value = undefined;
    }

    // Only cache successful reads; a transient failure should be retried next time.
    if (readSucceeded) {
      this.cache = value ?? null;
      this.hasCache = true;
    }
    return value == null ? undefined : structuredClone(value);
  }

  async write(data: T): Promise<void> {
    const blob: StoredKeychainBlob<T> = { version: 1, data };
    await this.entry.setPassword(JSON.stringify(blob));
    this.cache = structuredClone(data);
    this.hasCache = true;
  }

  async clear(): Promise<void> {
    try {
      await this.entry.deleteCredential();
    } catch {
      /* not present – fine */
    }
    this.cache = null;
    this.hasCache = true;
  }

  invalidateCache(): void {
    this.cache = null;
    this.hasCache = false;
  }
}
