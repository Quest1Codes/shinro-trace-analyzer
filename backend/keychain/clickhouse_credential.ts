import { KeychainHandler } from "./keychain_handler";

export interface CHCredential {
  url: string;
  user: string;
  password: string;
  port?: string;
  secure: boolean;
}

const REDACTED_PASSWORD = "********";

export class ClickhouseCredentialManager {
  private static instance: ClickhouseCredentialManager | null = null;

  private keychainHandler: KeychainHandler<CHCredential[]>;
  private activeCredential: CHCredential | null = null;

  private constructor() {
    this.keychainHandler = new KeychainHandler(
      "shinro",
      "credentials",
      "Shinro - Clickhouse Credentials",
    );
  }

  public static getInstance(): ClickhouseCredentialManager {
    if (!this.instance) {
      this.instance = new ClickhouseCredentialManager();
    }
    return this.instance;
  }

  getActiveCredential(): CHCredential | null {
    return this.activeCredential;
  }

  async getAllCredentialsRedacted(): Promise<CHCredential[]> {
    let creds = await this.keychainHandler.read();
    return (creds || []).map((c) => ({ ...c, password: REDACTED_PASSWORD }));
  }

  async getCredentialFor(
    username: string,
    url: string,
  ): Promise<CHCredential | null> {
    const creds = await this.keychainHandler.read();
    if (!creds) {
      return null;
    }
    const cred = creds.find((c) => c.user === username && c.url === url);
    return cred || null;
  }

  async upsertCredential(credential: CHCredential): Promise<void> {
    // If concurrent writes expected, worth using locks. skipped for now
    const creds = (await this.keychainHandler.read()) || [];
    const filtered = creds.filter(
      (c) => !(c.user === credential.user && c.url === credential.url),
    );
    filtered.push(credential);
    await this.keychainHandler.write(filtered);
  }

  setActiveCredential(credential: CHCredential) {
    this.activeCredential = credential;
  }

  unsetActiveCredential() {
    this.activeCredential = null;
  }

  async deleteCredential(username: string, url: string): Promise<void> {
    const creds = (await this.keychainHandler.read()) || [];
    const filtered = creds.filter(
      (c) => !(c.user === username && c.url === url),
    );
    await this.keychainHandler.write(filtered);
  }
}

export const clickhouseKeychain = ClickhouseCredentialManager.getInstance();
