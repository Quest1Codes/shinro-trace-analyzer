import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createKeychainBackend,
  EncryptedFileKeychainBackend,
  KeychainHandler,
  MacOSKeychainBackend,
  type KeychainBackend,
} from "../keychain_handler";

describe("KeychainHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shinro-keychain-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should use the encrypted file backend on Linux", () => {
    vi.spyOn(os, "platform").mockReturnValue("linux");

    const backend = createKeychainBackend(
      "shinro",
      "credentials",
      "Shinro Credentials",
      tempDir,
    );

    expect(backend).toBeInstanceOf(EncryptedFileKeychainBackend);
  });

  it("should use the macOS keychain backend on macOS", () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");

    const backend = createKeychainBackend(
      "shinro",
      "credentials",
      "Shinro Credentials",
      tempDir,
    );

    expect(backend).toBeInstanceOf(MacOSKeychainBackend);
  });

  it("should round-trip encrypted file data without writing plaintext", async () => {
    const backend = new EncryptedFileKeychainBackend<{ apiKey: string }>(
      "shinro",
      "ai_credentials",
      tempDir,
    );

    await backend.write({ apiKey: "super-secret-value" });

    const storedFiles = fs.readdirSync(tempDir);
    expect(storedFiles).toContain("store.key");

    const payloadFile = storedFiles.find((file) => file.endsWith(".json"));
    expect(payloadFile).toBeDefined();

    const raw = fs.readFileSync(path.join(tempDir, payloadFile!), "utf-8");
    expect(raw).not.toContain("super-secret-value");
    expect(await backend.read()).toEqual({ apiKey: "super-secret-value" });
  });

  it("should clear encrypted file entries", async () => {
    const backend = new EncryptedFileKeychainBackend<{ token: string }>(
      "shinro",
      "session",
      tempDir,
    );

    await backend.write({ token: "abc123" });
    await backend.clear();

    expect(await backend.read()).toBeUndefined();
  });

  it("should cache and clone empty array values", async () => {
    const backend: KeychainBackend<string[]> = {
      read: vi.fn().mockResolvedValue([]),
      write: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const handler = new KeychainHandler(
      "shinro",
      "credentials",
      "Shinro Credentials",
      backend,
    );

    const first = await handler.read();
    first?.push("mutated");

    const second = await handler.read();

    expect(backend.read).toHaveBeenCalledTimes(1);
    expect(first).toEqual(["mutated"]);
    expect(second).toEqual([]);
  });
});
