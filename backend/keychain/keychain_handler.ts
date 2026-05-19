import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import os from "os";

const execFile = promisify(execFileCb);
const SECURITY_BIN = "/usr/bin/security";

export interface Credential {
  url: string;
  user: string;
  password: string;
  port?: string;
  secure: boolean;
}

interface StoredBlob<T> {
  version: 1;
  data: T;
}

export class KeychainHandler<T> {
  private cache: { value: T | undefined } | undefined;

  constructor(
    private readonly service: string,
    private readonly account: string,
    private readonly label: string,
  ) {}

  static isAvailable(): boolean {
    return os.platform() === "darwin";
  }

  async read(): Promise<T | undefined> {
    if (this.cache) return this.cache.value;

    console.log(
      `Reading from keychain: service=${this.service}, account=${this.account}`,
    );
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
      const blob = JSON.parse(stdout.trim()) as StoredBlob<T>;
      value = blob.data;
    } catch {
      value = undefined;
    }

    this.cache = { value };
    return value;
  }

  async write(data: T): Promise<void> {
    console.log("Writing to keychain: ", data);
    const blob: StoredBlob<T> = { version: 1, data };
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
    this.cache = { value: data };
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
    this.cache = { value: undefined };
  }

  invalidateCache(): void {
    this.cache = undefined;
  }
}
