import fs from "fs";
import os from "os";
import path from "path";
import type { KeychainBackend } from "./backend";
import { MacOSKeychainBackend } from "./macos-backend";
import { LinuxSecretBackend } from "./secret-tool-backend";
import { EncryptedFileBackend } from "./encrypted-file-backend";

/**
 * Determines whether an executable is resolvable on the current `PATH`.
 *
 * @param command - The executable name to search for.
 * @returns `true` when the command exists on `PATH`; otherwise `false`.
 */
function commandExists(command: string): boolean {
  const pathEnv = process.env.PATH;
  if (!pathEnv) {
    return false;
  }
  return pathEnv
    .split(path.delimiter)
    .some((dir) => dir.length > 0 && fs.existsSync(path.join(dir, command)));
}

/**
 * Reports whether a desktop secret service is reachable on Linux.
 *
 * The check requires both the `secret-tool` binary and a D-Bus session bus,
 * the latter being absent on headless servers, containers, and CI runners.
 *
 * @returns `true` when the libsecret backend is usable; otherwise `false`.
 */
function isLinuxSecretServiceAvailable(): boolean {
  return (
    commandExists("secret-tool") &&
    Boolean(process.env.DBUS_SESSION_BUS_ADDRESS)
  );
}

/**
 * Selects the credential storage backend that fits the current platform.
 *
 * Selection order:
 * 1. macOS uses the login Keychain.
 * 2. Desktop Linux with a reachable secret service uses libsecret.
 * 3. Every other environment uses the cross-platform encrypted file.
 *
 * @returns The chosen {@link KeychainBackend} instance.
 */
export function selectBackend(): KeychainBackend {
  if (os.platform() === "darwin") {
    return new MacOSKeychainBackend();
  }
  if (os.platform() === "linux" && isLinuxSecretServiceAvailable()) {
    return new LinuxSecretBackend();
  }
  return new EncryptedFileBackend();
}
