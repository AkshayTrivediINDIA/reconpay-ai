import { describe, expect, it } from "vitest";
import { jsonSafe, noStore } from "@/lib/http";

describe("API JSON serialization", () => {
  it("serializes exact bigint minor units as decimal strings", () => {
    expect(
      jsonSafe({
        amountMinor: 50_000_000n,
        nested: { quantityMilli: 90_000n },
        normal: 42,
        date: new Date("2026-11-07T00:00:00.000Z"),
      }),
    ).toEqual({
      amountMinor: "50000000",
      nested: { quantityMilli: "90000" },
      normal: 42,
      date: "2026-11-07T00:00:00.000Z",
    });
  });

  it("returns a no-store JSON response without throwing for bigint fields", async () => {
    const response = noStore({ totalMinor: 9_007_199_254_740_993n });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ totalMinor: "9007199254740993" });
  });
});
