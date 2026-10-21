// BigInt mirror of DutchAuction's pricing and clearing rules, used only for display between
// block updates. Every action is still decided on-chain.

export const TOKEN_SCALE = 10n ** 18n;
export const DURATION = 1200n;

export const Status = {
  Pending: 0,
  Active: 1,
  Cleared: 2,
  AwaitingFinalization: 3,
  Finalized: 4
} as const;
export type StatusValue = (typeof Status)[keyof typeof Status];

export const STATUS_LABELS: Record<StatusValue, string> = {
  [Status.Pending]: "Not started",
  [Status.Active]: "Live",
  [Status.Cleared]: "Sold out",
  [Status.AwaitingFinalization]: "Ready to finalize",
  [Status.Finalized]: "Finalized"
};

export type AuctionState = {
  saleSupply: bigint;
  startPrice: bigint;
  reservePrice: bigint;
  started: boolean;
  finalized: boolean;
  cleared: boolean;
  startTime: bigint;
  lastCommitmentTimestamp: bigint;
  clearingTime: bigint;
  clearingPrice: bigint;
  finalPrice: bigint;
  totalCommitted: bigint;
};

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

export function priceAt(s: AuctionState, timestamp: bigint): bigint {
  if (!s.started || timestamp <= s.startTime) {
    return s.startPrice;
  }
  const elapsed = timestamp - s.startTime;
  if (elapsed >= DURATION) {
    return s.reservePrice;
  }
  return s.startPrice - ((s.startPrice - s.reservePrice) * elapsed) / DURATION;
}

export function maxCommitmentAt(s: AuctionState, price: bigint): bigint {
  return (s.saleSupply * price) / TOKEN_SCALE;
}

export function tokensFor(commitment: bigint, price: bigint): bigint {
  return price === 0n ? 0n : (commitment * TOKEN_SCALE) / price;
}

function earliestTimeAtOrBelow(s: AuctionState, price: bigint): bigint {
  if (price >= s.startPrice) {
    return s.startTime;
  }
  return s.startTime + ceilDiv((s.startPrice - price) * DURATION, s.startPrice - s.reservePrice);
}

export type Clearing = { cleared: boolean; price: bigint; time: bigint };

export function clearingAt(s: AuctionState, timestamp: bigint): Clearing {
  if (s.clearingTime !== 0n) {
    return { cleared: true, price: s.clearingPrice, time: s.clearingTime };
  }
  if (!s.started || s.totalCommitted === 0n) {
    return { cleared: false, price: 0n, time: 0n };
  }
  const end = s.startTime + DURATION;
  const at = timestamp < end ? timestamp : end;
  const price = ceilDiv(s.totalCommitted * TOKEN_SCALE, s.saleSupply);
  if (price < s.reservePrice) {
    return { cleared: false, price: 0n, time: 0n };
  }
  let time = earliestTimeAtOrBelow(s, price);
  if (time < s.lastCommitmentTimestamp) {
    time = s.lastCommitmentTimestamp;
  }
  return time > at ? { cleared: false, price: 0n, time: 0n } : { cleared: true, price, time };
}

export type View = {
  status: StatusValue;
  price: bigint;
  clearing: Clearing;
  endTime: bigint;
  remainingSeconds: bigint;
  elapsedSeconds: bigint;
  /** ETH that can still be accepted before the auction sells out at the current price. */
  capacity: bigint;
  /** ETH needed in total to buy the whole supply at the current price. */
  demandTarget: bigint;
};

export function viewAt(s: AuctionState, now: bigint): View {
  const endTime = s.started ? s.startTime + DURATION : 0n;
  const clearing = clearingAt(s, now);
  const elapsedSeconds = s.started && now > s.startTime ? min(now - s.startTime, DURATION) : 0n;
  const remainingSeconds = s.started && endTime > now ? endTime - now : 0n;

  let status: StatusValue;
  if (s.finalized) {
    status = Status.Finalized;
  } else if (!s.started) {
    status = Status.Pending;
  } else if (now >= endTime) {
    status = Status.AwaitingFinalization;
  } else {
    status = clearing.cleared ? Status.Cleared : Status.Active;
  }

  const price = s.finalized ? s.finalPrice : clearing.cleared ? clearing.price : priceAt(s, now);
  const demandTarget = maxCommitmentAt(s, price);
  const capacity =
    status === Status.Active && demandTarget > s.totalCommitted ? demandTarget - s.totalCommitted : 0n;

  return { status, price, clearing, endTime, remainingSeconds, elapsedSeconds, capacity, demandTarget };
}

export type BidQuote = {
  accepted: bigint;
  refunded: bigint;
  clearsAuction: boolean;
  /** Tokens for the wallet's total commitment after this bid, at the current price (a floor). */
  minTokens: bigint;
};

export function quoteBid(view: View, existingCommitment: bigint, amount: bigint): BidQuote {
  const accepted = amount < view.capacity ? amount : view.capacity;
  return {
    accepted,
    refunded: amount - accepted,
    clearsAuction: amount > 0n && amount >= view.capacity,
    minTokens: tokensFor(existingCommitment + accepted, view.price)
  };
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
