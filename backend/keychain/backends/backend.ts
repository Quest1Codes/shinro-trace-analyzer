/**
 * Platform-agnostic contract for a secret storage backend.
 *
 * Each backend persists opaque string values keyed by a `service` and
 * `account` pair. Higher-level callers (see {@link KeychainHandler}) serialise
 * their typed payloads to a string before writing and parse them after
 * reading, so a backend never needs to understand the stored shape.
 */
export interface KeychainBackend {
  /**
   * Reads the stored value for a service and account pair.
   *
   * @param service - The logical service namespace (for example, `shinro`).
   * @param account - The account identifier within the service.
   * @returns The stored string value, or `undefined` when no value exists.
   */
  read(service: string, account: string): Promise<string | undefined>;

  /**
   * Writes a value for a service and account pair, replacing any existing one.
   *
   * @param service - The logical service namespace.
   * @param account - The account identifier within the service.
   * @param label - A human-readable label shown by OS credential UIs.
   * @param value - The string value to persist.
   */
  write(
    service: string,
    account: string,
    label: string,
    value: string,
  ): Promise<void>;

  /**
   * Removes the stored value for a service and account pair.
   *
   * The operation succeeds even when no value is present.
   *
   * @param service - The logical service namespace.
   * @param account - The account identifier within the service.
   */
  clear(service: string, account: string): Promise<void>;
}
