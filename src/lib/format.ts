import { formatEther, formatUnits, parseEther } from "ethers";

export function trimDecimal(value: string, places = 4): string {
  if (!value.includes(".")) {
    return value;
  }
  const [whole, fraction] = value.split(".");
  const trimmed = fraction.slice(0, places).replace(/0+$/, "");
  return trimmed.length === 0 ? whole : `${whole}.${trimmed}`;
}

function groupThousands(value: string): string {
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function formatEth(value: bigint, places = 4): string {
  return `${groupThousands(trimDecimal(formatEther(value), places))} ETH`;
}

export function formatToken(value: bigint, symbol = "GVRA", places = 2): string {
  return `${groupThousands(trimDecimal(formatUnits(value, 18), places))} ${symbol}`;
}

export function formatPrice(value: bigint): string {
  return `${trimDecimal(formatEther(value), 6)} ETH`;
}

export function parseEthInput(value: string): bigint {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return 0n;
  }
  return parseEther(normalized);
}

export function secondsToClock(seconds: bigint): string {
  const safe = seconds < 0n ? 0n : seconds;
  const minutes = safe / 60n;
  const remainder = safe % 60n;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Percentage with one decimal place, from two bigints. */
export function percent(part: bigint, whole: bigint): number {
  if (whole === 0n) {
    return 0;
  }
  return Number((part * 1000n) / whole) / 10;
}
