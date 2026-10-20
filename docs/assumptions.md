# Assumptions, Ambiguities, And TA Questions

## Confirmed From The Brief

- The project is a team development project for a group of two or three students.
- Local deployment is acceptable for submission and demo.
- The codebase must include a README that lets assessors deploy and run the solution.
- The demo video must be no more than 10 minutes.
- Option 2 requires ERC20 integration, a separate auction engine, a 20-minute Dutch auction, token claims, ETH refunds, burning of unsold tokens, and reentrancy discussion or demonstration.

## No Companion-Document Conflicts Found

`Document.pdf` and `Document 2.pdf` confirm assessment and submission logistics. They do not add a different Dutch auction design. `project.pdf` remains the primary functional source.

## Ambiguity 1: "Exactly 20 Minutes" Versus Early Clearing

The brief says the auction runs for exactly 20 minutes. It also says the auction clears when total committed capital meets total token supply.

Question for TA:

> If sufficient capital is committed before the 20-minute deadline, should the auction stop accepting commitments immediately, or should it continue accepting commitments until exactly 20 minutes?

Initial implementation assumption:

- The economic outcome can lock early when the clearing threshold is reached.
- Contributions after economic clearing are rejected.
- Participants cannot claim tokens or let the issuer withdraw proceeds until finalization at the scheduled 1,200 second endpoint. A failed automatic surplus refund may be withdrawn earlier because it is already determined.

Reason:

- This preserves the "exactly 20 minutes" demonstration window for settlement while preventing later transactions from changing a price that should already have cleared.

This assumption has not been approved by the TA.

## Ambiguity 2: "Automatically Process Refunds" Versus Safe Withdrawals

The brief says token claims and refunds should be processed automatically. It also asks how to process refunds safely against reentrancy.

Question for TA:

> Is it acceptable for the contract to automatically calculate refund credits during settlement while requiring users to pull ETH refunds with a separate transaction?

Initial implementation policy:

- The crossing-bid surplus is calculated automatically and returned after state updates.
- If the receiver rejects ETH, the same amount is recorded in `refundCredits`.
- The participant can safely call `withdrawRefundTo` with an alternate recipient.

Reason:

- The push attempt is isolated to the bidder's own transaction and cannot block global finalization.
- The fallback pull path uses checks-effects-interactions and `ReentrancyGuard`.

This assumption has not been approved by the TA.

## Threshold-Crossing Bid Policy

Question for TA:

> When a contribution crosses the clearing threshold, should the excess ETH be rejected immediately, partially accepted, or accepted as budget and refunded later?

Initial implementation policy:

- Only the remaining capacity is accepted from the crossing contribution.
- The final clearing price locks at the current auction price.
- Every accepted commitment buys tokens at that same final price.
- Surplus ETH is returned immediately or credited if the transfer fails.

Reason:

- It is deterministic, simple for students to explain, and keeps every successful participant at the same final price.

This assumption has not been approved by the TA.

## Rounding And Dust

Assumption:

- On-chain arithmetic uses integer token units and wei.
- Token allocations round down.
- Accepted ETH is the participant's sale budget; token allocations round down.
- Clearly unsold inventory is burned at finalization.
- Any residual token dust caused by per-account flooring is burned only after every recorded participant has claimed.

Reason:

- Burning all leftover tokens immediately after finalization could burn tokens owed to users who have not claimed.
- Burning only after all participants claim preserves claim-order independence.

## Scope Boundaries

Assumptions:

- One auction per deployment is enough.
- The token is minted once at deployment; there is no later mint function.
- Auction configuration is immutable after deployment except for `start()`, which only records `startTime` after verifying inventory funding.
- Local Hardhat accounts and test ETH are used only.
- No real funds, testnet faucets, or paid services are required.

## Known Limitations To Disclose

- Issuer proceeds become withdrawable after finalization without waiting for claims. The amount is derived from accepted commitments and excludes `refundLiability`.
- A contract participant that rejects ETH must call `withdrawRefundTo` with a recipient address able to receive ETH. If that contract has no such method, its refund may remain stuck by its own design.
- The frontend is a local educational dashboard, not a production launch platform.
- The auction does not implement allowlists, KYC, anti-sybil controls, upgradeability, or multi-auction management.

