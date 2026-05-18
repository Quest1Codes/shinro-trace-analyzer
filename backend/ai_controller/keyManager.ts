import type { LLMProvider } from "./keys";
import { KeychainHandler } from "../keychain/keychain_handler";

interface ProviderConfig {
  key: string;
  model: string;
}

export type KeysConfig = {
  [K in LLMProvider]?: ProviderConfig;
};

const kc = new KeychainHandler<KeysConfig>("shinro", "ai-keys", "Shinro");

export async function loadKeys(): Promise<KeysConfig> {
  if (!KeychainHandler.isAvailable()) {
    throw new Error("Keychain is not available on this platform");
  }

  const stored = await kc.read();
  return stored || {};
}

export async function saveKeys(config: KeysConfig): Promise<void> {
  if (!KeychainHandler.isAvailable()) {
    throw new Error("Keychain is not available on this platform");
  }

  if (Object.keys(config).length === 0) {
    await kc.clear();
  } else {
    await kc.write(config);
  }
}

export async function getProviderConfig(
  provider: LLMProvider,
): Promise<ProviderConfig | null> {
  const keys = await loadKeys();
  return keys[provider] || null;
}
