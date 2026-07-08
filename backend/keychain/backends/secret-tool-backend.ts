import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import type { KeychainBackend } from "./backend";

const execFile = promisify(execFileCb);

/**
 * Name of the libsecret command-line tool used to talk to the freedesktop
 * Secret Service (GNOME Keyring, KWallet, and compatible providers).
 */
// nosemgrep: node_secret - this is a CLI executable name, not a credential.
const SECRET_TOOL_BIN = "secret-tool";

/**
 * Secret storage backend backed by libsecret on Linux desktops.
 *
 * The backend shells out to `secret-tool`, which communicates with the
 * freedesktop Secret Service over D-Bus. It requires both the `secret-tool`
 * binary and a running secret service, so it suits desktop Linux rather than
 * headless environments.
 */
export class LinuxSecretBackend implements KeychainBackend {
  /**
   * Looks up a secret from the Secret Service.
   *
   * @param service - The attribute used as the service namespace.
   * @param account - The attribute used as the account identifier.
   * @returns The stored value, or `undefined` when no matching secret exists.
   */
  async read(service: string, account: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFile(SECRET_TOOL_BIN, [
        "lookup",
        "service",
        service,
        "account",
        account,
      ]);
      // `secret-tool lookup` prints the secret with no trailing newline, but
      // trim defensively in case a provider appends one.
      return stdout.replace(/\n$/, "");
    } catch {
      return undefined;
    }
  }

  /**
   * Stores a secret in the Secret Service, replacing any existing entry that
   * shares the same attributes.
   *
   * @param service - The attribute used as the service namespace.
   * @param account - The attribute used as the account identifier.
   * @param label - The human-readable label shown in keyring UIs.
   * @param value - The value to store.
   */
  async write(
    service: string,
    account: string,
    label: string,
    value: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = execFileCb(
        SECRET_TOOL_BIN,
        ["store", "--label", label, "service", service, "account", account],
        (err) => (err ? reject(err) : resolve()),
      );
      // `secret-tool store` reads the secret value from stdin.
      child.stdin?.end(value);
    });
  }

  /**
   * Removes a secret from the Secret Service.
   *
   * @param service - The attribute used as the service namespace.
   * @param account - The attribute used as the account identifier.
   */
  async clear(service: string, account: string): Promise<void> {
    try {
      await execFile(SECRET_TOOL_BIN, [
        "clear",
        "service",
        service,
        "account",
        account,
      ]);
    } catch {
      /* not present – fine */
    }
  }
}
