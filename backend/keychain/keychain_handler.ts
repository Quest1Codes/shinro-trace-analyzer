import os from "os";
import type { KeychainBackend } from "./backends/backend";
import { selectBackend } from "./backends/select-backend";

/**
 * Versioned envelope wrapping a typed payload stored by {@link KeychainHandler}.
 *
 * @typeParam T - The shape of the stored payload.
 */
export interface StoredKeychainBlob<T> {
  version: 1;
  data: T;
}

/**
 * Persists a typed payload in the platform credential store.
 *
 * The handler serialises the payload to a versioned JSON envelope and delegates
 * raw string storage to a platform-specific {@link KeychainBackend}: the macOS
 * Keychain, the Linux Secret Service, or an encrypted file fallback. Callers
 * interact only with this class and remain unaware of the active backend.
 *
 * @typeParam T - The shape of the stored payload.
 */
export class KeychainHandler<T> {
  private readonly service: string;
  private readonly account: string;
  private readonly label: string;
  private readonly backend: KeychainBackend;

  private cache: T | null = null;

  /**
   * Creates a handler bound to a single credential entry.
   *
   * @param service - The service namespace for the entry.
   * @param account - The account identifier within the service.
   * @param label - The human-readable label shown by OS credential UIs.
   */
  constructor(service: string, account: string, label: string) {
    this.service = service;
    this.account = account;
    this.label = label;
    this.backend = selectBackend();
  }

  /**
   * Reports whether credential storage is available on the current platform.
   *
   * Storage is always available because the encrypted file backend works
   * everywhere, so this method returns `true` on all supported platforms. It is
   * retained for backwards compatibility with earlier callers.
   *
   * @returns `true` on every supported platform.
   */
  static isAvailable(): boolean {
    const platform = os.platform();
    return (
      platform === "darwin" || platform === "linux" || platform === "win32"
    );
  }

  /**
   * Reads and deserialises the stored payload, using an in-memory cache.
   *
   * @returns The stored payload, or `undefined` when none exists.
   */
  async read(): Promise<T | undefined> {
    if (this.cache) {
      return structuredClone(this.cache); // clone to prevent external mutation
    }

    let value: T | undefined;

    try {
      const stored = await this.backend.read(this.service, this.account);
      if (stored) {
        const blob = JSON.parse(stored) as StoredKeychainBlob<T>;
        value = blob.data;
      }
    } catch {
      // A missing or unparseable entry is treated as absent.
      value = undefined;
    }

    this.cache = value ?? null;
    return value;
  }

  /**
   * Serialises and persists the payload, refreshing the cache.
   *
   * @param data - The payload to store.
   */
  async write(data: T): Promise<void> {
    const blob: StoredKeychainBlob<T> = { version: 1, data };
    await this.backend.write(
      this.service,
      this.account,
      this.label,
      JSON.stringify(blob),
    );

    this.cache = structuredClone(data); // clone to prevent external mutations
  }

  /**
   * Removes the stored payload and clears the cache.
   */
  async clear(): Promise<void> {
    await this.backend.clear(this.service, this.account);
    this.cache = null;
  }

  /**
   * Drops the in-memory cache so the next read reloads from the backend.
   */
  invalidateCache(): void {
    this.cache = null;
  }
}
