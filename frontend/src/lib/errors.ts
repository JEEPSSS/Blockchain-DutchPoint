const CONTRACT_ERRORS: Record<string, string> = {
  AuctionNotStarted: "The auction hasn't started yet.",
  AuctionClosed: "The 20-minute bidding window has ended.",
  AuctionAlreadyCleared: "The auction has already sold out, so new bids are closed.",
  AuctionAlreadyStarted: "The auction has already been started.",
  AuctionNotFunded: "Deposit the GVRA sale supply into the auction before starting it.",
  AuctionNotFinalizable: "The auction can be finalized once the 20-minute window ends.",
  AuctionAlreadyFinalized: "The auction is already finalized.",
  AuctionNotFinalized: "This opens once the auction is finalized.",
  ZeroContribution: "Enter an amount greater than zero.",
  NoCommitment: "This wallet has no accepted bid.",
  AlreadyClaimed: "You have already claimed your GVRA.",
  NoRefundAvailable: "There is no refund waiting for this wallet.",
  NoProceedsAvailable: "There are no proceeds left to withdraw.",
  RefundTransferFailed: "The refund could not be sent to that address.",
  ProceedsTransferFailed: "The proceeds could not be sent to that address.",
  OutstandingClaims: "Rounding dust can be burned once every bidder has claimed.",
  NoTokensToBurn: "There is nothing left to burn.",
  InvalidAddress: "That address is not valid.",
  OwnableUnauthorizedAccount: "Only the issuer can do this."
};

type MaybeEthersError = {
  code?: string | number;
  shortMessage?: string;
  reason?: string;
  message?: string;
  revert?: { name?: string };
  info?: { error?: { code?: number } };
  error?: { code?: number };
};

/** Turns wallet, RPC and custom contract errors into a sentence a bidder can act on. */
export function describeError(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "Something went wrong. Please try again.";
  }
  const e = error as MaybeEthersError;

  if (e.code === "ACTION_REJECTED" || e.code === 4001 || e.info?.error?.code === 4001) {
    return "You rejected the request in your wallet.";
  }
  if (e.code === "INSUFFICIENT_FUNDS") {
    return "This wallet doesn't have enough ETH for that bid plus gas.";
  }
  const name = e.revert?.name;
  if (name && CONTRACT_ERRORS[name]) {
    return CONTRACT_ERRORS[name];
  }
  return e.shortMessage ?? e.reason ?? e.message ?? "Transaction failed.";
}

/** True when a read failed because the RPC endpoint could not be reached or kept failing. */
export function isConnectionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const e = error as MaybeEthersError;
  // ethers: request timed out, or HTTP errors (5xx, rate limiting) after its retries ran out.
  if (e.code === "TIMEOUT" || e.code === "SERVER_ERROR") {
    return true;
  }
  // fetch() itself rejects with "Failed to fetch" (Chrome), "NetworkError when attempting to
  // fetch resource." (Firefox), "Load failed" (Safari) or "fetch failed" (Node).
  return /failed to fetch|networkerror|load failed|fetch failed|ECONNREFUSED/i.test(e.message ?? "");
}
