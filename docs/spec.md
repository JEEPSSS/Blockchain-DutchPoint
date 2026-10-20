# DutchPoint Specification

DutchPoint is a decentralized Dutch auction platform that launches the Gavora (GVRA) ERC20 token. It is
the SC4053 Blockchain Technology Option 2 project. This document is the specification the AI agents
worked from; it was first written by Codex and then corrected after the audit (see
[`ai-audit-report.md`](ai-audit-report.md), finding F1).

## Sources

1. Primary brief: `project.pdf` - Option 2 (pages 5-6) and the AI Audit Report requirements (pages 1-2).
2. Companion logistics: `Document.pdf` and `Document 2.pdf` - per the team's notes, a complete codebase,
   a README that lets assessors deploy and run the project, local deployment, and a demo video of at most
   10 minutes.
3. Tool documentation: Hardhat 3, OpenZeppelin Contracts 5, ethers v6, Vite/React.

## Product goal

One token launch: bidders commit ETH during a 1,200-second descending-price auction. All winners pay
one uniform clearing price and claim GVRA. Surplus ETH from the bid that sells out the auction is
refunded at once. Unsold GVRA is burned.

Out of scope: auction factories, upgradeable proxies, oracles, allowlists/KYC, backends, cross-chain,
and mainnet.

## Allocation rule

Bids are **ETH commitments**, filled in arrival order:

1. While the auction is active, every bid is accepted in full - until the total committed ETH can buy
   the whole sale supply at the current price.
2. The bid that reaches that point (the *crossing bid*) is accepted only up to the remaining capacity.
   Its surplus is refunded in the same transaction, and the auction is **cleared** at the current price.
3. If no bid crosses, the auction can still clear through time passing, because a falling price makes
   the same ETH buy more tokens. It clears at the exact price where committed ETH buys the whole supply.
4. After clearing, new bids are rejected. If the window ends without clearing, the final price is the
   reserve price and the unsold supply is burned.
5. Every bidder receives `commitment / finalPrice` tokens: one uniform price for everyone.

Why arrival order rather than pro-rata: with pro-rata sharing, a late bidder can commit an arbitrarily
large amount at no cost (the excess is refunded) and take almost the entire supply from earlier bidders.
See F1 in the audit report.

## Auction mathematics

Notation (token amounts in units of 1e-18 GVRA, ETH in wei):

- `S` = sale supply, `D` = 1,200 s, `P0` = start price, `Pr` = reserve price (wei per whole GVRA)
- `C` = total committed (accepted) ETH, `TOKEN_SCALE = 1e18`
- `e = min(max(t - startTime, 0), D)`

### Price

```text
priceAt(t) = P0 - floor((P0 - Pr) * e / D)        # never below Pr
```

| Elapsed | Price (P0 = 0.02, Pr = 0.005 ETH) |
| --- | --- |
| 0 s | 0.020 ETH |
| 400 s | 0.015 ETH |
| 800 s | 0.010 ETH |
| 1,200 s | 0.005 ETH |

### Capacity and the crossing bid

```text
maxCommitmentAt(P) = floor(S * P / TOKEN_SCALE)    # most ETH that S tokens absorb at price P
capacity           = maxCommitmentAt(priceAt(now)) - C
accepted           = min(bid, capacity)
surplus            = bid - accepted                # refunded in the same transaction
cleared            = bid >= capacity               # clearingPrice = priceAt(now)
```

Because `C <= S * P / TOKEN_SCALE`, total claims `C * TOKEN_SCALE / P` can never exceed `S`.

**Worked example.** `S` = 1,000 GVRA. Alice commits 6 ETH and Bob 4 ETH early. At t = 700 s the price is
0.01125 ETH, so `maxCommitmentAt` = 11.25 ETH and capacity = 1.25 ETH. Carol sends 2 ETH: 1.25 ETH is
accepted and 0.75 ETH comes straight back. At settlement:

| Bidder | Accepted ETH | GVRA (`commitment / 0.01125`) |
| --- | --- | --- |
| Alice | 6 | 533.33 |
| Bob | 4 | 355.56 |
| Carol | 1.25 | 111.11 |

The leftover token unit from rounding down is burned once everyone has claimed.

### Clearing through time passing

With no new bids, the price keeps falling until committed ETH buys the whole supply. The decay is
continuous, so that happens exactly at:

```text
clearingPrice = ceil(C * TOKEN_SCALE / S)    # applies if >= Pr; rounding up keeps claims <= S
clearingTime  = max(first t with priceAt(t) <= clearingPrice, lastCommitmentTimestamp)
```

Example: 10 ETH committed for 1,000 GVRA clears at 0.01 ETH at t = 800 s, even if nobody transacts
then. `clearingState()` derives this for every read (`status()`, `currentPrice()`, bidding), and
`finalize()` records it.

### Settlement

```text
finalPrice      = clearingPrice if cleared, else Pr
totalTokensSold = floor(C * TOKEN_SCALE / finalPrice)          # <= S
burned at finalize: S - totalTokensSold
tokens(bidder)  = floor(commitment * TOKEN_SCALE / finalPrice)
issuer proceeds = C  (withdrawable at finalization)
```

Per-bidder rounding leaves at most one token unit per bidder. That dust is burned by
`burnRemainderAfterAllClaimed()` once every bidder has claimed, so tokens still owed are never burned.

## Timeline

- The auction runs for exactly 1,200 seconds from `start()`.
- Clearing can happen earlier. It locks the price and closes bidding, but `finalize()`, claims and
  proceeds open only at the 1,200-second mark (see [`assumptions.md`](assumptions.md)).
- `status()`: `Pending → Active → Cleared (optional) → AwaitingFinalization → Finalized`.

## Conservation and safety properties

These are enforced by tests, including the invariant suite:

```text
auction ETH balance  = C - issuerProceedsWithdrawn + refundLiability
sale GVRA            = held by auction + claimed + burned
GVRA totalSupply     = initial supply - burned
C                    <= maxCommitmentAt(applicable price)
tokens(bidder)       = commitment / finalPrice      (one uniform price)
```

- The issuer can never withdraw ETH owed as refunds; refunds can never block the issuer.
- No function loops over bidders.
- All ETH transfers follow checks-effects-interactions and are guarded by `ReentrancyGuard`.
- The token has no mint function and no owner.

## Frontend requirements

- Wallet connection, network detection and switching (adds the local chain if missing).
- Live price, countdown, total committed, supply, and price range.
- A price chart marking the current point and the clearing point, and a demand-vs-supply meter.
- A bid form with a quote, a preview of the sell-out refund, and a balance check.
- Position: committed ETH, a guaranteed-minimum GVRA allocation, claim, and refund withdrawal.
- Settlement: finalize (anyone), dust burn, and an issuer-only start and proceeds withdrawal.
- Bid history from `ContributionReceived` events, tagging the bid that cleared the auction.
- All amounts in BigInt. The browser mirrors the contract's rules for display only; the contract
  decides every action.
