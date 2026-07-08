import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { EncryptedFileBackend } from "../backends/encrypted-file-backend";
import { selectBackend } from "../backends/select-backend";
import { MacOSKeychainBackend } from "../backends/macos-backend";
import { LinuxSecretBackend } from "../backends/secret-tool-backend";

/**
 * Creates a unique temporary directory for an encrypted-file backend test.
 *
 * @returns The absolute path to the created directory.
 */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "shinro-keychain-"));
}

describe("EncryptedFileBackend", () => {
  let dir: string;
  let backend: EncryptedFileBackend;

  beforeEach(() => {
    dir = makeTempDir();
    backend = new EncryptedFileBackend(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("should return undefined when no value is stored", async () => {
    expect(await backend.read("shinro", "credentials")).toBeUndefined();
  });

  it("should persist a value and read it back", async () => {
    await backend.write("shinro", "credentials", "Shinro", "secret-value");
    expect(await backend.read("shinro", "credentials")).toBe("secret-value");
  });

  it("should encrypt the value at rest rather than store plaintext", async () => {
    await backend.write("shinro", "credentials", "Shinro", "top-secret");
    const raw = fs.readFileSync(path.join(dir, ".creds.enc"), "utf8");
    expect(raw).not.toContain("top-secret");
    const envelope = JSON.parse(raw);
    expect(envelope).toMatchObject({ version: 1 });
    expect(envelope.iv).toBeTypeOf("string");
    expect(envelope.tag).toBeTypeOf("string");
  });

  it("should write the credential file with owner-only permissions", async () => {
    await backend.write("shinro", "credentials", "Shinro", "value");
    const mode = fs.statSync(path.join(dir, ".creds.enc")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("should isolate values by service and account", async () => {
    await backend.write("shinro", "ai_credentials", "AI", "ai-value");
    await backend.write("shinro", "credentials", "CH", "ch-value");
    expect(await backend.read("shinro", "ai_credentials")).toBe("ai-value");
    expect(await backend.read("shinro", "credentials")).toBe("ch-value");
  });

  it("should overwrite an existing value on repeated writes", async () => {
    await backend.write("shinro", "credentials", "Shinro", "first");
    await backend.write("shinro", "credentials", "Shinro", "second");
    expect(await backend.read("shinro", "credentials")).toBe("second");
  });

  it("should remove a stored value on clear", async () => {
    await backend.write("shinro", "credentials", "Shinro", "value");
    await backend.clear("shinro", "credentials");
    expect(await backend.read("shinro", "credentials")).toBeUndefined();
  });

  it("should treat a corrupt file as empty rather than throw", async () => {
    fs.writeFileSync(path.join(dir, ".creds.enc"), "not-valid-json");
    expect(await backend.read("shinro", "credentials")).toBeUndefined();
  });
});

describe("selectBackend", () => {
  const originalDbus = process.env.DBUS_SESSION_BUS_ADDRESS;
  const originalPath = process.env.PATH;

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.DBUS_SESSION_BUS_ADDRESS = originalDbus;
    process.env.PATH = originalPath;
  });

  it("should choose the macOS backend on darwin", () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    expect(selectBackend()).toBeInstanceOf(MacOSKeychainBackend);
  });

  it("should choose the encrypted file backend on headless linux", () => {
    vi.spyOn(os, "platform").mockReturnValue("linux");
    delete process.env.DBUS_SESSION_BUS_ADDRESS;
    expect(selectBackend()).toBeInstanceOf(EncryptedFileBackend);
  });

  it("should choose the libsecret backend on linux with a secret service", () => {
    vi.spyOn(os, "platform").mockReturnValue("linux");
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "secret-tool"), "");
    process.env.PATH = dir;
    process.env.DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/1000/bus";
    try {
      expect(selectBackend()).toBeInstanceOf(LinuxSecretBackend);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("should choose the encrypted file backend on windows", () => {
    vi.spyOn(os, "platform").mockReturnValue("win32");
    expect(selectBackend()).toBeInstanceOf(EncryptedFileBackend);
  });
});
