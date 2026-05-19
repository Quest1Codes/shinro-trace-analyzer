import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import os from "os";

const execFile = promisify(execFileCb);
const SECURITY_BIN = "/usr/bin/security";

export interface StoredKeychainBlob<T> {
  version: 1;
  data: T;
}

export class KeychainHandler<T> {
  private readonly service;
  private readonly account;
  private readonly label;

  private cache: T | null = null;

  constructor(service: string, account: string, label: string) {
    this.service = service;
    this.account = account;
    this.label = label;
  }

  static isAvailable(): boolean {
    return os.platform() === "darwin";
  }

  async read(): Promise<T | undefined> {
    if (this.cache) {
      return structuredClone(this.cache); // clone to prevent external mutation
    }

    let value: T | undefined;

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

      value = blob.data;
    } catch {
      // todo: log error when logger is implemented
      value = undefined;
    }

    this.cache = value ?? null;
    return value;
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
      "", // No trusted applications - every time the credential is read, password is needed.
      "-w",
      JSON.stringify(blob),
    ]);

    this.cache = structuredClone(data); // clone to prevent external mutations
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
    this.cache = null;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
