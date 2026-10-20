import { formatEther, formatUnits, parseEther } from "ethers";

export function trimDecimal(value: string, places = 4): string {
  if (!value.includes(".")) {
    return value;
  }
  const [whole, fraction] = value.split(".");
  const trimmed = fraction.slice(0, places).replace(/0+$/, "");
  return trimmed.length === 0 ? whole : `${whole}.${trimmed}`;
}

export function formatEth(value: bigint, places = 4): string {
  return `${trimDecimal(formatEther(value), places)} ETH`;
}

export function formatToken(value: bigint, symbol = "GVRA", places = 4): string {
  return `${trimDecimal(formatUnits(value, 18), places)} ${symbol}`;
}

export function formatPrice(value: bigint): string {
  return `${trimDecimal(formatEther(value), 6)} ETH/token`;
}

export function parseEthInput(value: string): bigint {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return 0n;
  }
  return parseEther(normalized);
}

export function secondsToClock(seconds: bigint): string {
  const safeSeconds = seconds < 0n ? 0n : seconds;
  const minutes = safeSeconds / 60n;
  const remainder = safeSeconds % 60n;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

