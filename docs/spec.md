# FairLaunch Specification

FairLaunch is an educational Ethereum token-launch dApp for SC4053 Blockchain Technology, Option 2: Dutch Auction. `project.pdf` is the primary functional source. `Document.pdf` and `Document 2.pdf` add submission logistics but do not alter the Dutch auction requirements.

## Source Hierarchy

1. `project.pdf`, especially Option 2 and the AI Audit requirements.
2. `Document.pdf` and `Document 2.pdf` for submission, README, local deployment, and the demo-video limit.
3. Module 3 and DeFi lecture material for Ethereum execution, auction, gas, MEV, and burn context.
4. Official Hardhat, OpenZeppelin, ethers, React, and Vite documentation for compatible APIs.

## Scope

The project deploys one fixed-supply ERC20 and one auction. Users commit ETH during a deterministic 1,200-second descending-price window. Accepted commitments buy tokens at one final clearing price. A threshold-crossing bid is accepted only up to the remaining capacity; surplus ETH is returned immediately or preserved as a withdrawal credit if the receiver rejects ETH. Unsold tokens are burned.

Out of scope: factories, proxies, cross-chain support, price oracles, secondary trading, KYC, a backend indexer, mainnet deployment, and paid services.

## Policy Assumptions

These choices are implementation assumptions, not TA-approved interpretations:

1. Economic clearing can lock before 1,200 seconds, but finalization and token claims become available only at the scheduled endpoint.
2. The contract attempts an automatic crossing-bid refund after updating state. A failed transfer becomes a safe user-triggered `withdrawRefundTo` credit.
3. A crossing bid is partially accepted rather than allowing a late oversized bid to dilute earlier accepted budgets.

The unresolved questions are recorded in `docs/assumptions.md`.

## Requirements Map

| Brief requirement | Implementation | Verification |
| --- | --- | --- |
| ERC20 project token | `LaunchToken`, fixed constructor mint, no later mint function | Token deployment and supply tests |
| Separate auction logic | `DutchAuction` owns sale mechanics and inventory | Deployment fixtures and code review |
| ETH commitments | `contribute()` and `receive()` during active auction | Lifecycle tests |
| Descending bounded price | Linear `priceAt()` with reserve floor | Start, midpoint, deadline, monotonic tests |
| Exactly 1,200 seconds | `AUCTION_DURATION = 20 minutes` | Time-manipulation tests |
| Uniform final price | One stored `finalPrice` used by all claims | Uniform-price and invariant tests |
| Crossing bid | Accept remaining capacity; push or credit surplus | Crossing-bid and rejecting-receiver tests |
| Time-only clearing | Derive exact clearing price/time even without a transaction | Regression and fuzz tests |
| Claims | Per-account `claimTokens()` with no bidder loop | Claim-order and duplicate-claim tests |
| Refund safety | CEI, `ReentrancyGuard`, alternate withdrawal recipient | Reentrancy demonstration and refund tests |
| Unsold burn | Burn provably unsold inventory; burn dust after all claims | No-bid, undersubscribed, dust, invariant tests |
| Solvency | Separate accepted commitments, refund liability, proceeds, and token accounting | Lifecycle and invariant tests |

## Auction Mathematics

All calculations use integer wei and token base units. No JavaScript floating-point value is used for financial calculations.

```text
TOKEN_SCALE = 1e18
S  = saleSupply in token base units
D  = 1200 seconds
P0 = startPrice in wei per whole token
Pr = reservePrice in wei per whole token
C  = total accepted commitments in wei
e  = clamp(timestamp - startTime, 0, D)
```

### Price Decay

```text
priceAt(t) = max(Pr, P0 - floor((P0 - Pr) * e / D))
```

For `P0 = 0.020 ETH` and `Pr = 0.005 ETH`:

| Elapsed | Price |
| --- | --- |
| 0 s | 0.020 ETH |
| 400 s | 0.015 ETH |
| 800 s | 0.010 ETH |
| 1,200 s | 0.005 ETH |

### Capacity And Bid Clearing

At price `P`, the largest accepted commitment that cannot overallocate supply is:

```text
maxCommitment(P) = floor(S * P / TOKEN_SCALE)
remainingCapacity(P) = max(maxCommitment(P) - C, 0)
accepted = min(msg.value, remainingCapacity(P))
surplus = msg.value - accepted
```

The auction clears when a contribution fills the remaining capacity. This maintains:

```text
floor(totalCommitted * TOKEN_SCALE / clearingPrice) <= S
```

The crossing price is the current deterministic `priceAt(block.timestamp)`. The contract records state before attempting the surplus refund. If the receiver rejects ETH, `surplus` is added to `refundCredits` and `refundLiability`.

### Crossing Example

Let `S = 1,000 FAIR` and `P = 0.01125 ETH/FAIR`. Alice has committed `6 ETH` and Bob `4 ETH`.

```text
maxCommitment = 1000 * 0.01125 = 11.25 ETH
remainingCapacity = 11.25 - 10 = 1.25 ETH
Carol sends = 2 ETH
Carol accepted = 1.25 ETH
Carol surplus refund = 0.75 ETH
```

Every accepted budget uses the same clearing price:

| Bidder | Accepted ETH | Token allocation |
| --- | ---: | ---: |
| Alice | 6.00 | floor(6 / 0.01125) = 533.333... FAIR |
| Bob | 4.00 | floor(4 / 0.01125) = 355.555... FAIR |
| Carol | 1.25 | floor(1.25 / 0.01125) = 111.111... FAIR |

An earlier bidder does not receive a refund merely because the price falls. The falling price increases the tokens bought by the same accepted ETH budget.

### Clearing Caused By Time

With no new transaction, already accepted capital can become sufficient as the price falls. The exact supported price is rounded up to avoid overallocation:

```text
timeClearingPrice = ceil(C * TOKEN_SCALE / S)
```

If this is below `Pr`, the auction is undersubscribed. Otherwise the economic clearing time is the first timestamp where `priceAt(time) <= timeClearingPrice`, but never earlier than `lastCommitmentTimestamp`.

Example: `C = 10 ETH` and `S = 1,000 FAIR` gives `0.010 ETH/FAIR`, reached at 800 seconds. Finalizing at 1,200 seconds still records the 800-second economic result.

### Finalization And Allocation

Finalization is permissionless after `startTime + 1,200`.

```text
finalPrice = clearingPrice if cleared, otherwise reservePrice
tokens(account) = floor(commitment(account) * TOKEN_SCALE / finalPrice)
acceptedCost(account) = commitment(account)
```

Claims are computed from immutable aggregate state, so allocation does not depend on claim order.

### Burn And Dust

At finalization:

```text
totalTokensSold = floor(totalCommitted * TOKEN_SCALE / finalPrice)
initialUnsoldBurn = S - totalTokensSold
```

Per-account flooring can leave token-unit dust. It remains in the auction until `claimedParticipantCount == participantCount`; only then may `burnRemainderAfterAllClaimed()` burn it. Unclaimed entitlements are never treated as unsold.

### Conservation

```text
msg.value = accepted commitment + surplus refund
tracked ETH liability = (totalCommitted - issuerProceedsWithdrawn) + refundLiability
contract ETH balance >= tracked ETH liability
S = claimed + still claimable + burned + residual rounding dust
```

The issuer can withdraw only accepted commitments after finalization. Raw ETH balance is never used as the proceeds figure, so unsolicited ETH does not affect accounting.

## Frontend Contract

The React/Vite dashboard provides wallet and network state, auction and token metadata, price chart and countdown, accepted commitment estimates, a clearly provisional token estimate, permissionless finalization, claims, fallback refund withdrawal, issuer proceeds, burn state, and useful transaction errors.

The contract is authoritative. Browser time and chart calculations are display aids only. Frontend financial arithmetic uses `bigint` and ethers unit helpers.
