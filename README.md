# FairLaunch

FairLaunch is an educational SC4053 Blockchain Technology development project for Option 2, Dutch Auction. It implements a local Ethereum token launch with a descending price, one final clearing price, ERC20 token claims, safe ETH refund withdrawals, and burning of unsold inventory.

## Stack

- Solidity `0.8.28`
- OpenZeppelin Contracts `5.6.1`
- Hardhat `3.18.0` with TypeScript, Mocha, and ethers
- React `19`, Vite `8`, TypeScript, ethers `6`
- MetaMask on a local Hardhat network

## Install

```bash
npm install
```

The project uses a dependency lockfile. Hardhat scripts redirect their small home/config writes into `.hardhat-home/` so local commands do not need access to user-level preference folders.

## Verify

```bash
npm run compile
npm run test
npm run typecheck
npm run build
npm run demo
```

Current verified result:

- Contract tests: 18 passing.
- Frontend typecheck: passing.
- Production build: passing. Vite reports a chunk-size warning because ethers is bundled.
- Deterministic demo: passing.
- Slither: not installed in this environment, so static analysis could not be executed locally.

## Local Deployment And Frontend

Terminal 1:

```bash
npm run node
```

Terminal 2:

```bash
npm run deploy:local
npm run dev
```

The deployment script:

1. Deploys `LaunchToken`.
2. Deploys `DutchAuction`.
3. Transfers the full sale supply into the auction.
4. Starts the auction.
5. Writes local addresses and ABIs into `src/generated/`.

Open the Vite URL printed by `npm run dev`, usually:

```text
http://127.0.0.1:5173
```

## MetaMask Setup

Add a local network:

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: `ETH`

Import one or more private keys printed by `npm run node`. These are local test accounts only.

## Demo Under 10 Minutes

Run:

```bash
npm run demo
```

The deterministic script demonstrates:

1. Successful sale with surplus refunds.
2. Undersubscribed sale with token burning.
3. A refund recipient that rejects ETH without blocking settlement.
4. A blocked refund reentrancy attempt.

For a narrated video, follow `docs/demo-script.md`.

## Core Contracts

- `contracts/LaunchToken.sol`: fixed-supply ERC20 token with burn support.
- `contracts/DutchAuction.sol`: one-shot auction engine.
- `contracts/RejectingReceiver.sol`: test-only rejecting refund receiver.
- `contracts/ReentrantRefundAttacker.sol`: test-only reentrancy attacker.

## Important Policy Assumptions

These assumptions are documented for TA review and have not been approved:

- Early economic clearing may lock the auction outcome, while claims and withdrawals remain unavailable until the scheduled 1,200 second endpoint.
- Refunds are calculated automatically but transferred through safe user-triggered withdrawals.
- A threshold-crossing contribution is fully accepted as budget, and surplus is credited as refund after settlement.

## Known Limitations

- Issuer proceeds become withdrawable as participants settle. This avoids bidder loops and protects refunds, but proceeds from a participant who never settles remain in the contract.
- A contract participant that rejects ETH must call `withdrawRefundTo` with a recipient capable of receiving ETH.
- The frontend is a local educational dashboard, not a production token-sale platform.
- No allowlist, KYC, factory, upgradeability, testnet deployment, oracle, backend, or cross-chain support is included.

## Documentation

- `docs/spec.md`: requirements, auction math, examples, and conservation rules.
- `docs/architecture.md`: contract/frontend/test architecture.
- `docs/assumptions.md`: ambiguities and TA questions.
- `docs/requirements-checklist.md`: requirement-to-feature-to-test map.
- `docs/ai-audit-report.md`: draft AI audit report.
- `docs/ai-development-log.md`: factual development log and evidence.
- `docs/demo-script.md`: under-10-minute demo plan.

