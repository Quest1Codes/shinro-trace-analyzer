import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import type { KeychainBackend } from "./backend";

const execFile = promisify(execFileCb);

/**
 * Absolute path to the macOS `security` binary that manages the login
 * Keychain. The path exists only on macOS.
 */
const SECURITY_BIN = "/usr/bin/security";

/**
 * Secret storage backend backed by the macOS login Keychain.
 *
 * The backend shells out to `/usr/bin/security` and therefore functions only
 * on macOS (`darwin`).
 */
export class MacOSKeychainBackend implements KeychainBackend {
  /**
   * Reads a generic password from the macOS Keychain.
   *
   * @param service - The Keychain service name.
   * @param account - The Keychain account name.
   * @returns The stored value, or `undefined` when the item is absent.
   */
  async read(service: string, account: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFile(SECURITY_BIN, [
        "find-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
      ]);
      return stdout.trim();
    } catch {
      return undefined;
    }
  }

  /**
   * Adds or updates a generic password in the macOS Keychain.
   *
   * @param service - The Keychain service name.
   * @param account - The Keychain account name.
   * @param label - The Keychain item label.
   * @param value - The value to store.
   */
  async write(
    service: string,
    account: string,
    label: string,
    value: string,
  ): Promise<void> {
    await execFile(SECURITY_BIN, [
      "add-generic-password",
      "-U",
      "-s",
      service,
      "-a",
      account,
      "-l",
      label,
      "-T",
      "", // No trusted applications - the password is required on every read.
      "-w",
      value,
    ]);
  }

  /**
   * Deletes a generic password from the macOS Keychain.
   *
   * @param service - The Keychain service name.
   * @param account - The Keychain account name.
   */
  async clear(service: string, account: string): Promise<void> {
    try {
      await execFile(SECURITY_BIN, [
        "delete-generic-password",
        "-s",
        service,
        "-a",
        account,
      ]);
    } catch {
      /* not present – fine */
    }
  }
}
