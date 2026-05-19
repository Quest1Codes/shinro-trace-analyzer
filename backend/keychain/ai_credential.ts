import { KeychainHandler } from "./keychain_handler";

export const LLM_PROVIDERS = ["openai", "anthropic", "openrouter"] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

export interface AICredential {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

class AICredentialManager {
  private static instance: AICredentialManager | null = null;

  private keychainHandler: KeychainHandler<AICredential[]>;

  private constructor() {
    this.keychainHandler = new KeychainHandler(
      "shinro",
      "ai_credentials",
      "Shinro - AI Credentials",
    );
  }

  public static getInstance(): AICredentialManager {
    if (!this.instance) {
      this.instance = new AICredentialManager();
    }
    return this.instance;
  }

  async getAllCredentials(): Promise<AICredential[]> {
    return (await this.keychainHandler.read()) || [];
  }

  async getCredentialFor(provider: LLMProvider): Promise<AICredential | null> {
    const creds = await this.keychainHandler.read();
    if (!creds) {
      return null;
    }
    const cred = creds.find((c) => c.provider === provider);
    return cred || null;
  }

  async upsertCredential(credential: AICredential): Promise<void> {
    const creds = (await this.keychainHandler.read()) || [];
    const filtered = creds.filter((c) => c.provider !== credential.provider);
    filtered.push(credential);
    await this.keychainHandler.write(filtered);
  }

  async deleteCredential(provider: LLMProvider): Promise<void> {
    const creds = (await this.keychainHandler.read()) || [];
    const filtered = creds.filter((c) => c.provider !== provider);
    await this.keychainHandler.write(filtered);
  }
}

export const aiKeychain = AICredentialManager.getInstance();
