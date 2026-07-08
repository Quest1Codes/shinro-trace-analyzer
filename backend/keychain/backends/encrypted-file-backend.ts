import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { KeychainBackend } from "./backend";

/**
 * Default directory that stores the encrypted credential file.
 */
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".shinro");

/**
 * Name of the encrypted credential file within the config directory.
 */
const CREDENTIALS_FILENAME = ".creds.enc";

/**
 * Static application salt used when deriving the file encryption key.
 */
const KEY_SALT = "shinro-trace-analyzer::credential-store::v1";

/**
 * Length in bytes of the AES-GCM authentication tag. Pinning the length
 * prevents acceptance of a truncated, forgeable tag.
 */
const AUTH_TAG_LENGTH = 16;

/**
 * On-disk layout of the encrypted credential file.
 */
interface EncryptedEnvelope {
  version: 1;
  /** Base64-encoded AES-GCM initialisation vector. */
  iv: string;
  /** Base64-encoded AES-GCM authentication tag. */
  tag: string;
  /** Base64-encoded ciphertext of the serialised secret map. */
  ciphertext: string;
}

/**
 * Secret storage backend that persists an encrypted file on disk.
 *
 * The backend works on every platform without external services, which makes
 * it the fallback for headless Linux, containers, and CI. It encrypts the
 * credential map with AES-256-GCM using a key derived from stable machine
 * attributes.
 *
 * Security note: the derived key protects data at rest from casual disk
 * inspection, but a local attacker who can run code as the same user can
 * reproduce the key. Prefer an OS secret service when one is available.
 */
export class EncryptedFileBackend implements KeychainBackend {
  private readonly configDir: string;
  private readonly credentialsFile: string;

  /**
   * Creates a backend rooted at a configuration directory.
   *
   * @param configDir - Directory that holds the encrypted file. Defaults to
   *   `~/.shinro`. Tests may supply a temporary directory.
   */
  constructor(configDir: string = DEFAULT_CONFIG_DIR) {
    this.configDir = configDir;
    this.credentialsFile = path.join(configDir, CREDENTIALS_FILENAME);
  }

  /**
   * Composes the storage key for a service and account pair.
   *
   * @param service - The logical service namespace.
   * @param account - The account identifier within the service.
   * @returns The composite map key.
   */
  private storageKey(service: string, account: string): string {
    return `${service}:${account}`;
  }

  /**
   * Derives the AES-256 encryption key from stable machine attributes.
   *
   * @returns A 32-byte key buffer.
   */
  private deriveKey(): Buffer {
    const material = `${os.hostname()}::${os.userInfo().username}`;
    return crypto.scryptSync(material, KEY_SALT, 32);
  }

  /**
   * Reads and decrypts the full secret map from disk.
   *
   * @returns The decrypted map, or an empty object when the file is missing or
   *   cannot be decrypted.
   */
  private readAll(): Record<string, string> {
    if (!fs.existsSync(this.credentialsFile)) {
      return {};
    }
    try {
      const envelope = JSON.parse(
        fs.readFileSync(this.credentialsFile, "utf8"),
      ) as EncryptedEnvelope;
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this.deriveKey(),
        Buffer.from(envelope.iv, "base64"),
        { authTagLength: AUTH_TAG_LENGTH },
      );
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      return JSON.parse(decrypted) as Record<string, string>;
    } catch {
      // A corrupt or undecryptable file is treated as empty rather than fatal.
      return {};
    }
  }

  /**
   * Encrypts and writes the full secret map to disk with owner-only
   * permissions.
   *
   * @param map - The complete secret map to persist.
   */
  private writeAll(map: Record<string, string>): void {
    fs.mkdirSync(this.configDir, { recursive: true });
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.deriveKey(), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(map), "utf8"),
      cipher.final(),
    ]);
    const envelope: EncryptedEnvelope = {
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    fs.writeFileSync(this.credentialsFile, JSON.stringify(envelope), {
      mode: 0o600,
    });
  }

  /**
   * Reads a value from the encrypted file.
   *
   * @param service - The logical service namespace.
   * @param account - The account identifier within the service.
   * @returns The stored value, or `undefined` when absent.
   */
  async read(service: string, account: string): Promise<string | undefined> {
    const map = this.readAll();
    return map[this.storageKey(service, account)];
  }

  /**
   * Writes a value to the encrypted file.
   *
   * @param service - The logical service namespace.
   * @param account - The account identifier within the service.
   * @param _label - Unused; retained to satisfy the backend contract.
   * @param value - The value to persist.
   */
  async write(
    service: string,
    account: string,
    _label: string,
    value: string,
  ): Promise<void> {
    const map = this.readAll();
    map[this.storageKey(service, account)] = value;
    this.writeAll(map);
  }

  /**
   * Removes a value from the encrypted file.
   *
   * @param service - The logical service namespace.
   * @param account - The account identifier within the service.
   */
  async clear(service: string, account: string): Promise<void> {
    const map = this.readAll();
    delete map[this.storageKey(service, account)];
    this.writeAll(map);
  }
}
