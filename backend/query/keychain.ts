/**
 * macOS Keychain integration via the native `/usr/bin/security` CLI.
 *
 * Uses `add-generic-password` to store credentials securely in the
 * login keychain without exposing them in the macOS Passwords app.
 *
 * Supports **multiple** saved credentials. Each credential is a separate
 * generic-password entry tagged with service "shinro" and label "Shinro".
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import os from "os";
import crypto from "crypto";

const execFile = promisify(execFileCb);

// ─── Encryption Configuration ─────────────────────────────
// Note: In a production app, the key should be derived from machine-specific 
// identifiers or a user-provided passphrase. For this tool, we use a 
// consistent internal key for AES-256-CBC.
const ENCRYPTION_KEY = crypto.scryptSync("shinro-secret-key", "shinro-salt", 32);
const IV_LENGTH = 16;

/** Encrypt a string using AES-256-CBC. */
function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/** Decrypt a string using AES-256-CBC. Falls back to plain text if decryption fails. */
function decrypt(text: string): string {
  try {
    if (!text.includes(":")) return text;
    const [ivHex, encryptedHex] = text.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    // If decryption fails (e.g. legacy plain text), return as-is
    return text;
  }
}

const SECURITY_BIN = "/usr/bin/security";

/** Service name used to namespace our entries in the Keychain. */
const KEYCHAIN_SERVICE = "shinro";

/** Label for identification in Keychain Access. */
const KEYCHAIN_LABEL = "Shinro";

/** Returns `true` when running on macOS, where the Keychain is available. */
export function isKeychainAvailable(): boolean {
  return os.platform() === "darwin";
}

/** 
 * Data structure for our JSON storage.
 */
export interface KeychainCredential {
  account: string;  // "user@url"
  password: string; // raw password
}

// ─── Single-entry operations ─────────────────────────────

/**
 * Store (or update) a credential in the consolidated JSON blob.
 */
export async function keychainSet(
  service: string,
  account: string,
  password: string,
): Promise<void> {
  if (!isKeychainAvailable()) return;

  // 1. Load existing (handles migration of old individual entries)
  const all = await keychainListExtended(service);

  // 2. Update or add the new credential (append-only model: preserve existing)
  const index = all.findIndex(e => e.account === account);
  if (index >= 0) {
    all[index].password = password;
  } else {
    all.push({ account, password });
  }

  // 3. Save the entire array with encrypted passwords
  await saveCredentialBlob(service, all);
}

/**
 * Internal: Encrypts all passwords and saves the JSON blob to the Keychain.
 * This ensures we only have one entry for the service.
 */
async function saveCredentialBlob(service: string, credentials: KeychainCredential[]): Promise<void> {
  // Encrypt all passwords before stringifying
  const encrypted = credentials.map(e => ({
    ...e,
    password: encrypt(e.password)
  }));

  const json = JSON.stringify(encrypted);

  // Clear existing to ensure only the new consolidated blob remains
  await keychainDeleteAll(service);

  await execFile(SECURITY_BIN, [
    "add-generic-password",
    "-l", KEYCHAIN_LABEL,
    "-s", service,
    "-a", json,
    "-w", "json_storage_v2",
  ]);
}

/**
 * Retrieve a specific credential by its account string.
 */
export async function keychainGetByAccount(
  service: string,
  account: string,
): Promise<KeychainCredential | undefined> {
  const all = await keychainListExtended(service);
  return all.find(e => e.account === account);
}

/**
 * Retrieve the first credential found.
 */
export async function keychainGetFirst(
  service: string,
): Promise<KeychainCredential | undefined> {
  const all = await keychainListExtended(service);
  return all[0];
}

/**
 * Delete a specific entry by filtering the JSON blob.
 */
export async function keychainDeleteByAccount(
  service: string,
  account: string,
): Promise<void> {
  if (!isKeychainAvailable()) return;

  const all = await keychainListExtended(service);
  const filtered = all.filter(e => e.account !== account);

  // If nothing changed, don't write
  if (filtered.length === all.length) {
    // Check if it's a legacy entry that needs deleting
    try {
      await execFile(SECURITY_BIN, [
        "delete-generic-password",
        "-s", service,
        "-a", account,
      ]);
    } catch { /* ignore */ }
    return;
  }

  if (filtered.length > 0) {
    await saveCredentialBlob(service, filtered);
  } else {
    await keychainDeleteAll(service);
  }
}

/**
 * Delete ALL entries for our service.
 * Loops until none remain (handles multiple entries).
 */
export async function keychainDeleteAll(service: string): Promise<void> {
  if (!isKeychainAvailable()) return;

  for (let i = 0; i < 50; i++) {
    try {
      await execFile(SECURITY_BIN, [
        "delete-generic-password",
        "-s", service,
      ]);
    } catch {
      break; // No more entries
    }
  }
}

// ─── Multi-entry listing ─────────────────────────────────

/**
 * List all credentials (metadata only for API compatibility).
 */
export async function keychainList(
  service: string,
): Promise<KeychainEntry[]> {
  const all = await keychainListExtended(service);
  return all.map(e => ({ account: e.account }));
}

/**
 * Internal: List all credentials including passwords.
 * Handles both the new JSON-blob format and legacy individual entries.
 */
export async function keychainListExtended(
  service: string,
): Promise<KeychainCredential[]> {
  if (!isKeychainAvailable()) return [];

  try {
    const { stdout } = await execFile(SECURITY_BIN, ["dump-keychain"]);
    const results: KeychainCredential[] = [];

    const blocks = stdout.split(/(?=class: )/);

    for (const block of blocks) {
      if (!block.includes('class: "genp"')) continue;

      const svcMatch = block.match(/"svce"<blob>="([^"]+)"/);
      if (!svcMatch || svcMatch[1] !== service) continue;

      const acctMatch = block.match(/"acct"<blob>=(?:"(.+)"|0x([0-9a-fA-F]+))/);
      if (!acctMatch) continue;

      const acctValue = acctMatch[1] 
        ? acctMatch[1].replace(/\\"/g, '"') // Unescape quotes
        : Buffer.from(acctMatch[2], "hex").toString();

      // Try to parse as JSON array (the new format)
      if (acctValue.startsWith("[") && acctValue.endsWith("]")) {
        try {
          const parsed = JSON.parse(acctValue);
          if (Array.isArray(parsed)) {
            // Decrypt passwords when loading
            results.push(...parsed.map(e => ({
              ...e,
              password: decrypt(e.password)
            })));
            continue;
          }
        } catch {
          // Not valid JSON, treat as legacy
        }
      }

      // Legacy format or individual entry: we need the password too
      // Note: dump-keychain doesn't show passwords, so we fetch it
      const entry = await fetchLegacyPassword(service, acctValue);
      if (entry) {
        results.push(entry);
      }
    }

    return results;
  } catch {
    return [];
  }
}

/** Helper to fetch password for legacy individual entries */
async function fetchLegacyPassword(service: string, account: string): Promise<KeychainCredential | undefined> {
  try {
    const { stderr } = await execFile(SECURITY_BIN, [
      "find-generic-password",
      "-s", service,
      "-a", account,
      "-g",
    ]);
    const pwMatch = stderr.match(/^password: (?:0x([0-9a-fA-F]+)|"(.+)")/m);
    if (pwMatch) {
      const password = pwMatch[1]
        ? Buffer.from(pwMatch[1], "hex").toString()
        : pwMatch[2].replace(/\\"/g, '"');
      return { account, password };
    }
  } catch { }
  return undefined;
}
