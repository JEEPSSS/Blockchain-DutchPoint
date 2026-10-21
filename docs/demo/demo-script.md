# DutchPoint Demo Script (target 8-9 minutes)

**Setup before recording**
- `npm run node` (terminal 1), then `npm run deploy:local` and `npm run dev` (terminal 2).
- In MetaMask, import two Hardhat test accounts: #0 is the issuer and #4 is the bidder ("Dave").
- Have `npm run seed:local` ready. Reset MetaMask activity data if the node was restarted.

## 0:00-0:45 - Introduction

> "This is **DutchPoint: A Decentralized Dutch Auction Platform**. Falling prices. One clearing price.
> We're launching the Gavora token - GVRA, from 'gavel'. Connect your wallet to DutchPoint and bid for
> Gavora tokens using ETH."

Show the dashboard. Point out the price range, the 20-minute countdown and the three-step
explanation at the bottom.

## 0:45-2:00 - Architecture

- Show `contracts/GavoraToken.sol`: fixed supply, burnable, no mint, no owner.
- Show `contracts/DutchAuction.sol`: `contribute`, `finalize`, `claimTokens`, and `clearingState`.
- One sentence on the rule: earlier bids are filled first; the bid that sells out only buys what's
  left and gets its surplus back immediately; everyone pays the same price.

## 2:00-4:00 - Live auction

1. Run `npm run seed:local`. Alice, Bob and Carol bid; the bid history and demand meter update.
2. Connect as Dave. Point at the quote: "You receive at least …" - the allocation can only grow.
3. Click **Sell-out**, then add 1 ETH and bid. Point out the green callout: the extra ETH comes back in
   the same transaction. The status flips to *Sold out*, the chart marks the clearing point, and the
   history tags Dave's bid *Cleared*.

## 4:00-5:00 - Settlement

1. Click **+20 min** in *Local demo tools*. The status becomes *Ready to finalize*.
2. Click **Finalize auction**, then **Claim** - GVRA arrives in Dave's wallet.
3. Switch MetaMask to the issuer and click **Withdraw proceeds** - exactly the accepted ETH.

## 5:00-6:00 - Undersubscribed sale and burn

Run `npm run demo` and show scenario 2: a sale that ends at the reserve price, with 800 GVRA burned and
the total supply reduced.

## 6:00-7:30 - Security

1. In the `npm run demo` output, show scenarios 4 and 5: the same attacker drains **11 ETH** from the
   deliberately vulnerable auction, but gets only its own **0.75 ETH** refund from DutchPoint.
2. Briefly show `npm test` (52 passing) and the coverage table, then the Slither summary in
   `docs/ai-audit/evidence/08-slither.txt`.

## 7:30-9:00 - AI audit highlights

Open `docs/ai-audit/report.md`:
- F1: the AI's pro-rata rule let a whale take 91% of the supply. Show `docs/ai-audit/evidence/02` vs. `04`.
- Show the failing-then-passing regression tests (`docs/ai-audit/evidence/01` → `03`).
- Close with the main lesson: AI handled the stated requirements well, but missed adversarial
  economics and cross-layer bugs, which only tests and a second model caught.
