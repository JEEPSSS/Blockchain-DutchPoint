# FairLaunch Architecture

## Overview

FairLaunch is a local-first dApp with three layers:

1. Solidity contracts for token and auction settlement.
2. Hardhat TypeScript tests and scripts for deployment, deterministic demos, and evidence.
3. React/Vite frontend using ethers v6 and MetaMask.

The design follows the project brief by keeping token logic separate from auction logic.

## Contracts

### `LaunchToken.sol`

Responsibilities:

- ERC20 project token using OpenZeppelin Contracts 5.
- Fixed initial mint in the constructor.
- No post-deployment minting function.
- Burn support through OpenZeppelin `ERC20Burnable`.
- `Ownable` constructor receives an initial owner, matching OpenZeppelin Contracts 5.

Rationale:

- The auction inventory must be fixed and funded before the sale starts.
- Burning unsold tokens is a token responsibility, but deciding what is unsold is an auction responsibility.

### `DutchAuction.sol`

Responsibilities:

- Store immutable sale parameters: token, issuer, sale supply, start price, reserve price.
- Enforce exactly `AUCTION_DURATION = 1200`.
- Accept ETH commitments only during the active, uncleared auction.
- Lock early clearing when committed capital can buy the full sale supply at the current price.
- Reconstruct time-decay clearing during finalization if no transaction occurred at the economic clearing time.
- Finalize only after the scheduled endpoint.
- Calculate settlement entitlements without looping over bidders.
- Use pull-based refunds and tracked issuer proceeds.
- Burn clearly unsold tokens at finalization and burn residual token dust only after every participant has settled.

Key state groups:

- Commitments: `commitments[address]`, `totalCommitted`, participant registration count.
- Final auction state: `clearingTime`, `clearingPrice`, `finalized`, `finalPrice`, `cleared`.
- Participant settlement: `settled[address]`, `refundCredits[address]`, accepted cost and token receipt history.
- Issuer accounting: `issuerProceedsAvailable`, `issuerProceedsWithdrawn`.
- Burn accounting: `burnedUnsold`, `totalTokensClaimed`, `settledParticipantCount`.

Security controls:

- OpenZeppelin `ReentrancyGuard` from `@openzeppelin/contracts/utils/ReentrancyGuard.sol`.
- Checks-effects-interactions on ETH transfers.
- No raw-balance proceeds withdrawal.
- No unbounded loops in finalization, refund, settlement, or burning.
- Custom errors for auditable failure cases.

### Test-Only Contracts

- `RejectingReceiver.sol`: contributes ETH from a contract whose receive function rejects ETH, proving one participant cannot block settlement and that failed refund transfers preserve credit.
- `ReentrantRefundAttacker.sol`: attempts to reenter refund withdrawal from its receive function, proving reentrancy protection and effects-before-interactions.

These contracts are intentionally adversarial teaching artifacts, not implementation defects.

## Tooling

Current documentation checked on 2026-09-25 and installed package versions:

- Hardhat `3.18.0` with `@nomicfoundation/hardhat-toolbox-mocha-ethers` `4.0.0`.
- Solidity `0.8.28` as a pinned stable compiler version compatible with OpenZeppelin Contracts 5.
- OpenZeppelin Contracts `5.6.1`.
- ethers `6.17.0`.
- React `19.3.0` and Vite `8.3.1`.
- OpenZeppelin Contracts 5 import paths:
  - `@openzeppelin/contracts/token/ERC20/ERC20.sol`
  - `@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol`
  - `@openzeppelin/contracts/access/Ownable.sol`
  - `@openzeppelin/contracts/utils/ReentrancyGuard.sol`
  - `@openzeppelin/contracts/utils/math/Math.sol`
  - `@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol`
- ethers v6 for both Hardhat and frontend.
- Vite + React + TypeScript for the UI.

## Frontend Structure

Planned source layout:

```text
src/
  App.tsx
  main.tsx
  styles.css
  lib/
    contracts.ts
    format.ts
    wallet.ts
  generated/
    addresses.local.json
    DutchAuction.json
    LaunchToken.json
```

Frontend state is read directly from deployed contracts. The browser computes display-only estimates using BigInt arithmetic. It must never use JavaScript floating point for financial values.

## Scripts

Planned scripts:

- `scripts/deploy-local.ts`: deploy token and auction, transfer sale supply, start auction, and write frontend contract artifacts.
- `scripts/demo.ts`: deterministic under-10-minute local walkthrough covering successful sale, undersubscribed burn, surplus refund, and blocked reentrancy.
- `scripts/export-frontend.ts`: copy minimal ABI and local addresses for the Vite app.

## Test Strategy

Contract tests are the source of truth for auction economics:

- Price start, mid-auction, deadline, monotonic decay, and reserve floor.
- Rejection before opening and after closing.
- No contributors and full inventory burn.
- Partial sale at reserve and unsold burn.
- Early clearing and settlement delayed until 1,200 seconds.
- Clearing caused by time passing without a new bid.
- Crossing bid surplus refund policy.
- Multiple contributions by one wallet.
- Small amounts, rounding, and dust burn after all settle.
- Uniform final price.
- Claim order independence.
- Duplicate claims and withdrawals.
- Early and repeated finalization.
- Unauthorized start and proceeds withdrawal.
- Receiver rejecting ETH.
- Malicious refund reentrancy.
- ETH and token conservation.

Frontend checks:

- TypeScript type check.
- Production Vite build.
- Manual local MetaMask flow documented in README.

Static analysis:

- Run Slither if installed. If it is unavailable locally, record that honestly in the AI audit and README checks.

## Requirement Conflicts

No direct conflict was found between `project.pdf`, `Document.pdf`, and `Document 2.pdf`. The companion documents are logistical and do not override Option 2. Two ambiguities remain inside the primary brief:

- "Exactly 20 minutes" versus early clearing when sufficient capital is committed.
- "Automatically process refunds" versus safe user-triggered withdrawals.

These are recorded in `docs/assumptions.md`.
