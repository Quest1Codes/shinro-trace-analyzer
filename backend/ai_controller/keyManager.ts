import fs from "fs";
import path from "path";
import os from "os";
import type { LLMProvider } from "./keys";
import {
  keychainSet,
  keychainGetByAccount,
  keychainDeleteByAccount,
  isKeychainAvailable,
} from "../query/keychain";

interface ProviderConfig {
  key: string;
  model: string;
}

export type KeysConfig = {
  [K in LLMProvider]?: ProviderConfig;
};

/**
 * Reserved keychain account name for AI provider keys.
 * Stored alongside connection credentials under the same "shinro" service,
 * as one extra entry in the consolidated JSON blob.
 */
const KEYCHAIN_SERVICE = "shinro";
const AI_KEYS_ACCOUNT = "__ai_keys__";

// Legacy file path – used only for one-time migration.
const SHINRO_DIR = path.join(os.homedir(), ".shinro");
const KEYS_FILE = path.join(SHINRO_DIR, "keys.json");

/**
 * Loads the AI keys config from the keychain.
 * On the first call after upgrading, migrates from the old keys.json file.
 */
export async function loadKeys(): Promise<KeysConfig> {
  if (isKeychainAvailable()) {
    try {
      const entry = await keychainGetByAccount(KEYCHAIN_SERVICE, AI_KEYS_ACCOUNT);
      if (entry) {
        return JSON.parse(entry.password) as KeysConfig;
      }
    } catch (e) {
      console.error("[AI Keys] Failed to read from keychain:", e);
    }

    // No keychain entry yet — attempt one-time migration from keys.json
    if (fs.existsSync(KEYS_FILE)) {
      try {
        const data = fs.readFileSync(KEYS_FILE, "utf-8");
        const config = JSON.parse(data) as KeysConfig;
        await saveKeys(config);
        fs.unlinkSync(KEYS_FILE);
        return config;
      } catch (e) {
        console.error("[AI Keys] Migration from keys.json failed:", e);
      }
    }

    return {};
  }

  // Keychain unavailable (non-macOS fallback): keep using the file
  try {
    if (!fs.existsSync(KEYS_FILE)) return {};
    const data = fs.readFileSync(KEYS_FILE, "utf-8");
    return JSON.parse(data) as KeysConfig;
  } catch (e) {
    console.error("[AI Keys] Failed to read keys file:", e);
    return {};
  }
}

/**
 * Saves the entire AI keys config to the keychain (or file on non-macOS).
 */
export async function saveKeys(config: KeysConfig): Promise<void> {
  if (isKeychainAvailable()) {
    try {
      if (Object.keys(config).length === 0) {
        // Delete the entry when all keys are removed
        await keychainDeleteByAccount(KEYCHAIN_SERVICE, AI_KEYS_ACCOUNT);
      } else {
        await keychainSet(KEYCHAIN_SERVICE, AI_KEYS_ACCOUNT, JSON.stringify(config));
      }
    } catch (e) {
      console.error("[AI Keys] Failed to save to keychain:", e);
    }
    return;
  }

  // Fallback: write to file
  try {
    if (!fs.existsSync(SHINRO_DIR)) {
      fs.mkdirSync(SHINRO_DIR, { recursive: true });
    }
    fs.writeFileSync(KEYS_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    console.error("[AI Keys] Failed to save keys file:", e);
  }
}

/**
 * Returns the config for a single provider, or null if not set.
 */
export async function getProviderConfig(provider: LLMProvider): Promise<ProviderConfig | null> {
  const keys = await loadKeys();
  return keys[provider] || null;
}
