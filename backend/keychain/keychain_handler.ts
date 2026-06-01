import crypto from "crypto";
import { execFile as execFileCb } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFile = promisify(execFileCb);
const SECURITY_BIN = "/usr/bin/security";
const CREDENTIALS_DIR = path.join(os.homedir(), ".shinro", "credentials");
const CREDENTIALS_KEY_FILE = "store.key";

export interface StoredKeychainBlob<T> {
  version: 1;
  data: T;
}

interface EncryptedStoredBlob {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface KeychainBackend<T> {
  read(): Promise<T | undefined>;
  write(data: T): Promise<void>;
  clear(): Promise<void>;
}

function ensureCredentialsDir(credentialsDir: string): void {
  if (!fs.existsSync(credentialsDir)) {
    fs.mkdirSync(credentialsDir, { recursive: true, mode: 0o700 });
  }
}

function loadOrCreateStoreKey(credentialsDir: string): Buffer {
  ensureCredentialsDir(credentialsDir);

  const keyPath = path.join(credentialsDir, CREDENTIALS_KEY_FILE);
  if (fs.existsSync(keyPath)) {
    return Buffer.from(fs.readFileSync(keyPath, "utf-8"), "base64");
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  return key;
}

function getCredentialsFilePath(
  service: string,
  account: string,
  credentialsDir: string,
): string {
  return path.join(
    credentialsDir,
    `${encodeURIComponent(service)}__${encodeURIComponent(account)}.json`,
  );
}

export class MacOSKeychainBackend<T> implements KeychainBackend<T> {
  private readonly service;
  private readonly account;
  private readonly label;

  constructor(service: string, account: string, label: string) {
    this.service = service;
    this.account = account;
    this.label = label;
  }

  async read(): Promise<T | undefined> {
    try {
      const { stdout } = await execFile(SECURITY_BIN, [
        "find-generic-password",
        "-s",
        this.service,
        "-a",
        this.account,
        "-w",
      ]);

      const blob = JSON.parse(stdout.trim()) as StoredKeychainBlob<T>;
      return blob.data;
    } catch {
      // todo: log error when logger is implemented
      return undefined;
    }
  }

  async write(data: T): Promise<void> {
    const blob: StoredKeychainBlob<T> = { version: 1, data };
    await execFile(SECURITY_BIN, [
      "add-generic-password",
      "-U",
      "-s",
      this.service,
      "-a",
      this.account,
      "-l",
      this.label,
      "-T",
      "",
      "-w",
      JSON.stringify(blob),
    ]);
  }

  async clear(): Promise<void> {
    try {
      await execFile(SECURITY_BIN, [
        "delete-generic-password",
        "-s",
        this.service,
        "-a",
        this.account,
      ]);
    } catch {
      /* not present – fine */
    }
  }
}

export class EncryptedFileKeychainBackend<T> implements KeychainBackend<T> {
  private readonly service;
  private readonly account;
  private readonly credentialsDir;

  constructor(
    service: string,
    account: string,
    credentialsDir: string = CREDENTIALS_DIR,
  ) {
    this.service = service;
    this.account = account;
    this.credentialsDir = credentialsDir;
  }

  private get filePath(): string {
    return getCredentialsFilePath(
      this.service,
      this.account,
      this.credentialsDir,
    );
  }

  async read(): Promise<T | undefined> {
    if (!fs.existsSync(this.filePath)) {
      return undefined;
    }

    try {
      const encrypted = JSON.parse(
        fs.readFileSync(this.filePath, "utf-8"),
      ) as EncryptedStoredBlob;
      const key = loadOrCreateStoreKey(this.credentialsDir);
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(encrypted.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));

      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf-8");

      const blob = JSON.parse(plaintext) as StoredKeychainBlob<T>;
      return blob.data;
    } catch {
      return undefined;
    }
  }

  async write(data: T): Promise<void> {
    ensureCredentialsDir(this.credentialsDir);

    const key = loadOrCreateStoreKey(this.credentialsDir);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const blob: StoredKeychainBlob<T> = { version: 1, data };
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(blob), "utf-8"),
      cipher.final(),
    ]);

    const encrypted: EncryptedStoredBlob = {
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };

    fs.writeFileSync(this.filePath, JSON.stringify(encrypted), { mode: 0o600 });
  }

  async clear(): Promise<void> {
    if (fs.existsSync(this.filePath)) {
      fs.rmSync(this.filePath, { force: true });
    }
  }
}

export function createKeychainBackend<T>(
  service: string,
  account: string,
  label: string,
  credentialsDir?: string,
): KeychainBackend<T> {
  return os.platform() === "darwin"
    ? new MacOSKeychainBackend(service, account, label)
    : new EncryptedFileKeychainBackend(service, account, credentialsDir);
}

export class KeychainHandler<T> {
  private readonly backend: KeychainBackend<T>;

  private cache: T | null = null;
  private hasCache = false;

  constructor(
    service: string,
    account: string,
    label: string,
    backend?: KeychainBackend<T>,
  ) {
    this.backend = backend ?? createKeychainBackend(service, account, label);
  }

  static isAvailable(): boolean {
    return true;
  }

  async read(): Promise<T | undefined> {
    if (this.hasCache) {
      return this.cache == null ? undefined : structuredClone(this.cache); // clone to prevent external mutation
    }

    const value = await this.backend.read();
    this.cache = value ?? null;
    this.hasCache = true;
    return value == null ? undefined : structuredClone(value);
  }

  async write(data: T): Promise<void> {
    await this.backend.write(data);
    this.cache = structuredClone(data); // clone to prevent external mutations
    this.hasCache = true;
  }

  async clear(): Promise<void> {
    await this.backend.clear();
    this.cache = null;
    this.hasCache = true;
  }

  invalidateCache(): void {
    this.cache = null;
    this.hasCache = false;
  }
}
