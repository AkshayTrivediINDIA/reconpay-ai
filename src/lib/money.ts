/**
 * Exact money and quantity arithmetic.
 *
 * Monetary values are integer minor units (paise/cents). Quantities are
 * integer thousandths ("milli"). No floating point is used for any financial
 * calculation. Formatting helpers convert to strings only at the presentation
 * boundary.
 */

export type Minor = bigint;
export type Milli = bigint;

const MINOR_SCALE = 100n;

export function toMinor(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("Money number must be a safe integer of minor units");
    }
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`Invalid minor-unit amount: ${value}`);
  }
  return BigInt(trimmed);
}

/** Parse a user-entered major-unit amount ("1,234.50") into exact minor units. */
export function parseMoneyInput(input: string | number, field = "amount"): bigint {
  const raw = String(input).replace(/,/g, "").trim();
  if (raw === "") throw new Error(`${field} is required`);
  if (!/^\d+(\.\d{0,2})?$/.test(raw)) {
    throw new Error(`${field} must be a positive amount with at most 2 decimals`);
  }
  const [whole, fraction = ""] = raw.split(".");
  const padded = (fraction + "00").slice(0, 2);
  return BigInt(whole ?? "0") * MINOR_SCALE + BigInt(padded);
}

export function parseQuantityInput(input: string | number, field = "quantity"): bigint {
  const raw = String(input).replace(/,/g, "").trim();
  if (raw === "") throw new Error(`${field} is required`);
  if (!/^\d+(\.\d{0,3})?$/.test(raw)) {
    throw new Error(`${field} must be a positive quantity with at most 3 decimals`);
  }
  const [whole, fraction = ""] = raw.split(".");
  const padded = (fraction + "000").slice(0, 3);
  return BigInt(whole ?? "0") * 1000n + BigInt(padded);
}

export function formatMinor(minor: bigint, currency = "INR"): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / MINOR_SCALE;
  const fraction = (abs % MINOR_SCALE).toString().padStart(2, "0");
  const grouped = groupDigits(whole.toString(), currency);
  const symbol = currencySymbol(currency);
  return `${negative ? "-" : ""}${symbol}${grouped}.${fraction}`;
}

export function formatMinorPlain(minor: bigint, currency = "INR"): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / MINOR_SCALE;
  const fraction = (abs % MINOR_SCALE).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${currency} ${groupDigits(whole.toString(), currency)}.${fraction}`;
}

export function formatMoneyForPdf(minor: bigint, currency = "INR"): string {
  return formatMinorPlain(minor, currency);
}

export function formatQuantity(milli: bigint): string {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  const whole = abs / 1000n;
  const fraction = (abs % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${groupDigits(whole.toString(), "USD")}${fraction ? `.${fraction}` : ""}`;
}

export function formatQuantityPlain(milli: bigint): string {
  const whole = milli / 1000n;
  const fraction = (milli % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function quantityToNumber(milli: bigint): number {
  return Number(milli) / 1000;
}

export function minorToNumber(minor: bigint): number {
  return Number(minor) / 100;
}

export function toMajorString(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / MINOR_SCALE;
  const fraction = (abs % MINOR_SCALE).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** line amount = unit price × quantity, rounded half-up to the nearest minor unit. */
export function computeLineTotal(unitPriceMinor: bigint, quantityMilli: bigint): bigint {
  return divRoundHalfUp(unitPriceMinor * quantityMilli, 1000n);
}

/** tax = taxable base × basis points / 10,000, rounded half-up. */
export function computeTax(baseMinor: bigint, taxRateBps: number | bigint): bigint {
  if (!Number.isInteger(Number(taxRateBps)) || Number(taxRateBps) < 0) {
    throw new Error("Tax rate must be a non-negative integer in basis points");
  }
  return divRoundHalfUp(baseMinor * BigInt(taxRateBps), 10_000n);
}

export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("Division by zero");
  const sign = numerator < 0n !== denominator < 0n ? -1n : 1n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  return sign * (remainder * 2n >= d ? quotient + 1n : quotient);
}

export function sumMinor(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

export function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "INR":
      return "₹";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return `${currency.toUpperCase()} `;
  }
}

export function sumLineTotals(
  items: { quantityMilli: bigint; unitPriceMinor: bigint }[],
): bigint {
  return sumMinor(items.map((i) => computeLineTotal(i.unitPriceMinor, i.quantityMilli)));
}

export function expectedTaxForLines(
  items: { quantityMilli: bigint; unitPriceMinor: bigint; taxRateBps: number }[],
): bigint {
  return sumMinor(
    items.map((i) =>
      computeTax(computeLineTotal(i.unitPriceMinor, i.quantityMilli), i.taxRateBps),
    ),
  );
}

export function clampNonNegative(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

export function groupDigits(value: string, currency = "INR"): string {
  const [whole, fraction] = value.split(".");
  let grouped: string;
  if (currency.toUpperCase() === "INR") {
    const lastThree = whole!.slice(-3);
    const rest = whole!.slice(0, -3);
    grouped = rest
      ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
      : lastThree;
  } else {
    grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  return fraction ? `${grouped}.${fraction}` : grouped;
}
