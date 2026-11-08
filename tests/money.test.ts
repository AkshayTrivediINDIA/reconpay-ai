import { describe, expect, it } from "vitest";
import {
  computeLineTotal,
  computeTax,
  divRoundHalfUp,
  formatMinorPlain,
  formatQuantityPlain,
  parseMoneyInput,
  parseQuantityInput,
  toMajorString,
} from "@/lib/money";

describe("exact money and quantity arithmetic", () => {
  it("parses decimal input into integer minor units without floating point", () => {
    expect(parseMoneyInput("5,000")).toBe(500_000n);
    expect(parseMoneyInput("5000.5")).toBe(500_050n);
    expect(parseMoneyInput("0.01")).toBe(1n);
    expect(parseMoneyInput("123.45")).toBe(12_345n);
    expect(parseQuantityInput("90")).toBe(90_000n);
    expect(parseQuantityInput("12.125")).toBe(12_125n);
  });

  it("rejects malformed or unsafe monetary input", () => {
    expect(() => parseMoneyInput("1.234")).toThrow(/at most 2 decimals/);
    expect(() => parseMoneyInput("-1")).toThrow(/positive amount/);
    expect(() => parseMoneyInput("abc")).toThrow();
    expect(() => parseQuantityInput("1.0001")).toThrow(/at most 3 decimals/);
  });

  it("multiplies unit price by milli-quantity exactly", () => {
    expect(computeLineTotal(500_000n, 100_000n)).toBe(50_000_000n);
    expect(computeLineTotal(500_000n, 90_000n)).toBe(45_000_000n);
    expect(computeLineTotal(2_500n, 1n)).toBe(3n); // 0.001 unit rounds half-up
  });

  it("computes tax in basis points with deterministic half-up rounding", () => {
    expect(computeTax(50_000_000n, 1_800)).toBe(9_000_000n);
    expect(computeTax(1n, 5_000)).toBe(1n); // 0.5 minor unit rounds up
    expect(computeTax(1n, 4_999)).toBe(0n);
  });

  it("rounds negatives symmetrically and refuses division by zero", () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
    expect(() => divRoundHalfUp(1n, 0n)).toThrow(/Division by zero/);
  });

  it("formats without losing precision and exposes a provider-safe string", () => {
    expect(formatMinorPlain(50_000_000n, "INR")).toBe("INR 5,00,000.00");
    expect(formatMinorPlain(150_000n, "USD")).toBe("USD 1,500.00");
    expect(toMajorString(50_000_000n)).toBe("500000.00");
    expect(formatQuantityPlain(90_000n)).toBe("90");
    expect(formatQuantityPlain(12_125n)).toBe("12.125");
  });

  it("keeps a large invoice total exact beyond safe floating-point integer range", () => {
    const total = 9_007_199_254_740_993n;
    expect(formatMinorPlain(total, "USD")).toBe("USD 90,071,992,547,409.93");
    expect(parseMoneyInput(toMajorString(total))).toBe(total);
  });
});
