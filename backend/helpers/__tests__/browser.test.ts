import { describe, expect, it, vi } from "vitest";
import { getBrowserOpenCommand, openUrl } from "../browser";

describe("browser helpers", () => {
  const url = "http://localhost:13000";

  it("should return the macOS opener command", () => {
    expect(getBrowserOpenCommand(url, "darwin")).toEqual({
      command: "open",
      args: [url],
    });
  });

  it("should return the Linux opener command", () => {
    expect(getBrowserOpenCommand(url, "linux")).toEqual({
      command: "xdg-open",
      args: [url],
    });
  });

  it("should return the Windows opener command", () => {
    expect(getBrowserOpenCommand(url, "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", url],
    });
  });

  it("should return null for unsupported platforms", () => {
    expect(getBrowserOpenCommand(url, "aix")).toBeNull();
  });

  it("should execute the opener command when supported", () => {
    const execImpl = vi.fn();

    const result = openUrl(
      url,
      "linux",
      execImpl as unknown as typeof import("child_process").execFileSync,
    );

    expect(result).toBe(true);
    expect(execImpl).toHaveBeenCalledWith("xdg-open", [url], {
      stdio: "ignore",
    });
  });

  it("should return false when the opener command fails", () => {
    const execImpl = vi.fn(() => {
      throw new Error("missing opener");
    });

    const result = openUrl(
      url,
      "linux",
      execImpl as unknown as typeof import("child_process").execFileSync,
    );

    expect(result).toBe(false);
  });
});
