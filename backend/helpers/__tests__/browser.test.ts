import { describe, expect, it, vi } from "vitest";
import { openUrl } from "../browser";

describe("browser helpers", () => {
  const url = "http://localhost:13000";

  it("should delegate browser launch to the open package", async () => {
    const openImpl = vi.fn().mockResolvedValue(undefined);

    const result = await openUrl(url, openImpl as never);

    expect(result).toBe(true);
    expect(openImpl).toHaveBeenCalledWith(url);
  });

  it("should return false when the open package throws", async () => {
    const openImpl = vi.fn().mockRejectedValue(new Error("missing opener"));

    const result = await openUrl(url, openImpl as never);

    expect(result).toBe(false);
  });
});
