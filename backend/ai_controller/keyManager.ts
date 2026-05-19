import type { LLMProvider } from "./keys";
import { KeychainHandler } from "../keychain/keychain_handler";

interface ProviderConfig {
  key: string;
  model: string;
}

export type KeysConfig = {
  [K in LLMProvider]?: ProviderConfig;
};

export const aiKeys = new KeychainHandler<KeysConfig>(
  "shinro",
  "ai-keys",
  "Shinro",
);
