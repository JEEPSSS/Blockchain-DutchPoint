# DutchPoint Architecture

```text
 Browser (React + ethers v6)                         Ethereum (local Hardhat or Sepolia)
 ┌───────────────────────────────┐   read: views,    ┌──────────────────────┐  transfer / burn  ┌────────────────┐
 │ hooks/useWallet  (EIP-1193)   │   events          │ DutchAuction         │ ────────────────▶ │ GavoraToken    │
 │ hooks/useAuction (reads, bids)│ ◀──────────────── │  bids, clearing,     │                   │  ERC20 "GVRA"  │
 │ lib/auctionMath  (BigInt      │                   │  settlement, refunds │                   │  fixed supply, │
 │   mirror for display)         │ ────────────────▶ │  Ownable (issuer),   │                   │  burnable,     │
 │ components/*                  │   write: signed   │  ReentrancyGuard     │                   │  no owner      │
 └───────────────────────────────┘   transactions    └──────────────────────┘                   └────────────────┘
```

## Contracts

### `GavoraToken.sol`

- OpenZeppelin `ERC20` + `ERC20Burnable`; name "Gavora", symbol "GVRA", 18 decimals.
- The whole supply is minted once in the constructor. There is no mint function and no owner, so
  "unauthorized minting" and token-admin escalation are impossible by construction.
- The auction burns unsold inventory from its own balance with `burn()`. `totalSupply` really decreases.

### `DutchAuction.sol`

| Group | State |
| --- | --- |
| Immutable sale parameters | `token`, `saleSupply`, `startPrice`, `reservePrice`; `AUCTION_DURATION = 20 minutes` |
| Lifecycle | `started`, `startTime`, `finalized`, `cleared` |
| Clearing | `clearingTime`, `clearingPrice` (set by a crossing bid or at finalize), `lastCommitmentTimestamp`, `finalPrice` |
| Commitments | `commitments[account]` (accepted ETH only), `totalCommitted`, `participantCount` |
| Settlement | `claimed[account]`, `tokensClaimed[account]`, `totalTokensSold`, `totalTokensClaimed`, `claimedParticipantCount`, `burnedUnsold` |
| ETH accounting | `refundCredits[account]`, `refundLiability`, `issuerProceedsWithdrawn` |

| Function | Who | Notes |
| --- | --- | --- |
| `start()` | issuer | Requires the sale supply to be deposited; opens the 20-minute window |
| `contribute()` / `receive()` | anyone | Accepts up to capacity; a crossing bid clears and gets its surplus pushed back (credited if the push fails) |
| `finalize()` | anyone, after 20 min | Records time-based clearing if any, fixes `finalPrice`, burns unsold supply |
| `claimTokens()` | bidders | `commitment / finalPrice` GVRA, once |
| `withdrawRefundTo(recipient)` | bidders with a credit | Fallback for refunds a contract bidder rejected |
| `withdrawIssuerProceeds(recipient)` | issuer, after finalize | Exactly `totalCommitted`; never touches refund credits |
| `burnRemainderAfterAllClaimed()` | anyone | Burns rounding dust once every bidder has claimed |
| `status()`, `currentPrice()`, `clearingState()`, `priceAt()`, `maxCommitmentAt()`, `remainingCapacity()`, `tokensOwed()`, `endTime()` | views | All account for clearing caused by time passing |

**Security controls**
- Checks-effects-interactions on every ETH transfer, plus OpenZeppelin `ReentrancyGuard` on every
  state-changing entry point.
- Aggregate accounting, so no function loops over bidders.
- `Ownable` restricts only `start` and `withdrawIssuerProceeds`.
- Custom errors for every failure, decoded into plain messages by the UI.
- The constructor rejects parameters under which the auction could never clear.

### Test-only contracts (`contracts/mocks/`)

- `RejectingReceiver`: a bidder contract that rejects ETH, to prove refunds fall back to credits and
  cannot be blocked.
- `ReentrancyAttacker`: re-enters a refund withdrawal from `receive()`; can target any contract.
- `VulnerableAuction`: **deliberately vulnerable** refund path (transfer before state update, no guard),
  used only to show the attack succeeding.

## Frontend (`frontend/src/`)

| Module | Responsibility |
| --- | --- |
| `hooks/useWallet.ts` | EIP-1193 wallet connection, account/chain tracking, chain switching (adds Hardhat Local if missing) |
| `hooks/useAuction.ts` | Reads all auction state in one batch; refreshes on new blocks (15 s fallback); incremental bid history from `ContributionReceived` events; serialises concurrent refreshes |
| `hooks/useNow.ts` | 1-second clock used to extrapolate chain time between blocks |
| `lib/auctionMath.ts` | BigInt mirror of `priceAt`, `maxCommitmentAt`, time-based clearing and `status`, so the countdown, price and status update every second without extra RPC calls |
| `lib/contracts.ts` | ABIs and deployments: `deployments.json` (public, committed) merged with `deployments.local.json` (local, gitignored) |
| `lib/errors.ts` | Maps wallet errors and custom contract errors to readable messages |
| `components/` | Header, PriceChart, DemandMeter, BidPanel, PositionPanel, SettlementPanel, BidHistory, HowItWorks, DevTools (local chain only) |

Before a wallet connects, the app reads through a read-only RPC (the local node by default, or
`VITE_READ_RPC_URL`). Once a wallet on a supported chain connects, it reads and writes through the wallet.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/deploy.ts` | Deploy, fund and (optionally) start; export ABIs and addresses; on public networks also write `deployments/<network>.json` with tx hashes and print verification commands |
| `scripts/demo.ts` | Deterministic five-scenario walkthrough on an in-process chain |
| `scripts/seed-local.ts` | Place three bids on the local deployment |
| `scripts/advance-time.ts` | Fast-forward the local chain clock |
| `scripts/poc-crowd-out.ts` | Proof of concept for audit finding F1 |

## Tests

| Suite | Focus |
| --- | --- |
| `test/DutchAuction.test.ts` | Configuration, price, bidding and crossing bids, both clearing modes, status machine, claims, dust, refunds, issuer access, conservation, edge cases |
| `test/AuditRegressions.test.ts` | F1-F4, written to fail on the original AI code |
| `test/Reentrancy.test.ts` | Vulnerable vs. secure auction under the same attacker |
| `test/GavoraToken.test.ts` | Token metadata, fixed supply, no mint/owner, burn rules |
| `test/solidity/DutchAuctionFuzz.t.sol` | Fuzz: price bounds, uniform/fair/conserving settlement, exact time-clearing price |
| `test/solidity/DutchAuctionInvariant.t.sol` | Invariants under random bid/warp/finalize/claim/withdraw sequences |

## Tooling

Solidity 0.8.28 (optimizer on, 200 runs), OpenZeppelin Contracts 5.6.1, Hardhat 3.18 with the
Mocha/ethers toolbox and native Solidity tests (forge-std 1.9.7), Slither 0.11.6, React 19, Vite 8,
ethers 6.17, and GitHub Actions.
