# Assumptions, Ambiguities and TA Questions

None of the interpretations below has been approved by a TA. They are recorded so that the design
choices are explicit and easy to change.

## Confirmed from the brief

- A team project of two or three students.
- An ERC20 token plus separate auction contract(s); a 20-minute Dutch auction; a uniform clearing price;
  token claims; ETH refunds for surplus bids; burning of unsold tokens; reentrancy resistance as a bonus.
- An AI Audit Report with eight sections, and a four-part breakdown for every major issue.
- Per the team's notes on `Document.pdf` / `Document 2.pdf`: local deployment is acceptable, the README
  must let assessors deploy and run the project, and the demo video is at most 10 minutes.

## 1. "Runs for exactly 20 minutes" vs. clearing early

The brief says the auction runs for exactly 20 minutes, and also that it clears when committed capital
meets the supply.

**Interpretation:**
- Clearing locks the price and closes bidding as soon as it happens, whether through a crossing bid or
  through time passing.
- Finalization, claims and proceeds open at the 20-minute mark.
- The window therefore always lasts exactly 20 minutes, and no transaction after clearing can change
  the price.

> TA question: if demand meets supply before 20 minutes, may settlement start immediately, or should it
> wait for the 20-minute mark as implemented?

## 2. "Automatically process ETH refunds"

**Interpretation:**
- The surplus of the bid that crosses the threshold is refunded **in the same transaction**.
- If the bidder is a contract that rejects ETH, the refund is credited and can be withdrawn later with
  `withdrawRefundTo` to any address. This means a rejecting bidder can never block the auction or
  lose funds.
- Under arrival-order filling, no other bidder has a surplus, so there is nothing else to refund.

> TA question: is an automatic refund with a pull fallback acceptable for "automatically process ETH
> refunds"?

## 3. A bid that crosses the clearing threshold

**Interpretation (changed after the audit):**
- Earlier commitments are filled in full.
- The crossing bid is accepted only up to the remaining capacity at the current price, and the rest
  is refunded.

The original Codex implementation shared the supply pro-rata among all bidders, which lets a late,
oversized bid take most of the supply (audit finding F1).

> TA question: is arrival-order filling the intended reading of "how to calculate claims when a bid
> bridges across the clearing threshold"?

## 4. Clearing through time passing

If committed ETH would buy the whole supply at some price above the reserve, the auction clears at
exactly that price, `ceil(totalCommitted / saleSupply)`, when the falling price reaches it - even if no
transaction happens at that moment. Rounding up keeps total claims within the supply.

## 5. Rounding and dust

- Token allocations round down. Leftover sub-unit dust (at most one token unit per bidder) is burned
  once every bidder has claimed, so tokens still owed are never burned.
- Accepted ETH is paid in full. Per-bidder rounding is worth less than `finalPrice / 1e18` wei, which is
  under 1 wei at any price below 1 ETH per GVRA.

## 6. Issuer proceeds

Proceeds equal all accepted ETH. The issuer can withdraw them once the auction is finalized. Refund
credits are tracked separately, so proceeds can never consume ETH owed to bidders.

## Scope boundaries

- One auction per deployment; parameters are immutable apart from `start()`.
- Local Hardhat accounts and test ETH only; Sepolia is optional.
- No allowlists, KYC, anti-sybil controls, upgradeability, factory, backend or cross-chain support.

## Known limitations

- A bidder who never claims leaves their GVRA in the auction contract. It remains claimable forever,
  and rounding dust cannot be burned until that bidder claims.
- Many tiny bids from distinct addresses can delay the dust burn in the same way. Only rounding dust is
  affected, never anyone's allocation.
- At wei-scale prices (a few wei per token), rounding the time-clearing price up to a whole wei can leave
  a small share of supply unsold. This is irrelevant at realistic prices, and it is covered by a test.
