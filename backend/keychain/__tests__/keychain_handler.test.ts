import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KeychainHandler,
  type KeyringEntry,
  type KeyringEntryFactory,
} from "../keychain_handler";

describe("KeychainHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should read and deserialize data from the keyring entry", async () => {
    const entry: KeyringEntry = {
      getPassword: vi
        .fn()
        .mockResolvedValue('{"version":1,"data":{"apiKey":"super-secret"}}'),
      setPassword: vi.fn().mockResolvedValue(undefined),
      deleteCredential: vi.fn().mockResolvedValue(true),
    };
    const createEntry: KeyringEntryFactory = vi.fn().mockReturnValue(entry);

    const handler = new KeychainHandler(
      "shinro",
      "ai_credentials",
      "Shinro - AI Credentials",
      createEntry,
    );

    expect(await handler.read()).toEqual({ apiKey: "super-secret" });
    expect(createEntry).toHaveBeenCalledWith("shinro", "ai_credentials");
  });

  it("should serialize data before writing to the keyring entry", async () => {
    const entry: KeyringEntry = {
      getPassword: vi.fn().mockResolvedValue(undefined),
      setPassword: vi.fn().mockResolvedValue(undefined),
      deleteCredential: vi.fn().mockResolvedValue(true),
    };

    const handler = new KeychainHandler(
      "shinro",
      "credentials",
      "Shinro Credentials",
      () => entry,
    );

    await handler.write([{ provider: "openai", apiKey: "token" }]);

    expect(entry.setPassword).toHaveBeenCalledWith(
      '{"version":1,"data":[{"provider":"openai","apiKey":"token"}]}',
    );
  });

  it("should clear the underlying keyring entry", async () => {
    const entry: KeyringEntry = {
      getPassword: vi.fn().mockResolvedValue(undefined),
      setPassword: vi.fn().mockResolvedValue(undefined),
      deleteCredential: vi.fn().mockResolvedValue(true),
    };

    const handler = new KeychainHandler(
      "shinro",
      "credentials",
      "Shinro Credentials",
      () => entry,
    );

    await handler.clear();

    expect(entry.deleteCredential).toHaveBeenCalledTimes(1);
  });

  it("should cache and clone empty array values", async () => {
    const entry: KeyringEntry = {
      getPassword: vi.fn().mockResolvedValue('{"version":1,"data":[]}'),
      setPassword: vi.fn().mockResolvedValue(undefined),
      deleteCredential: vi.fn().mockResolvedValue(true),
    };
    const handler = new KeychainHandler(
      "shinro",
      "credentials",
      "Shinro Credentials",
      () => entry,
    );

    const first = await handler.read();
    first?.push("mutated");

    const second = await handler.read();

    expect(entry.getPassword).toHaveBeenCalledTimes(1);
    expect(first).toEqual(["mutated"]);
    expect(second).toEqual([]);
  });

  it("should return undefined when the keyring entry read fails", async () => {
    const entry: KeyringEntry = {
      getPassword: vi.fn().mockRejectedValue(new Error("unavailable")),
      setPassword: vi.fn().mockResolvedValue(undefined),
      deleteCredential: vi.fn().mockResolvedValue(true),
    };
    const handler = new KeychainHandler(
      "shinro",
      "credentials",
      "Shinro Credentials",
      () => entry,
    );

    expect(await handler.read()).toBeUndefined();
  });
});
