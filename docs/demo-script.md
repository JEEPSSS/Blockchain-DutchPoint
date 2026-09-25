# FairLaunch Demo Script

Target length: 8-10 minutes.

## 0:00-1:00 - Architecture Intro

- Show `contracts/LaunchToken.sol` and `contracts/DutchAuction.sol`.
- Explain separation of token logic and auction logic.
- Explain the two documented assumptions:
  - Early clearing can lock outcome, settlement waits for 1,200 seconds.
  - Refunds are calculated automatically but withdrawn safely by users.

## 1:00-2:00 - Run Checks

Show:

```bash
npm run test
npm run build
```

Mention:

- 18 contract tests pass.
- Frontend builds.
- Slither was unavailable locally and is recorded as not run.

## 2:00-3:00 - Local Frontend Setup

Terminal 1:

```bash
npm run node
```

Terminal 2:

```bash
npm run deploy:local
npm run dev
```

Open the Vite URL and connect MetaMask to chain `31337`.

## 3:00-4:30 - Successful Sale

Use the deterministic script output or frontend interactions to show:

- Alice, Bob, and Carol commit ETH.
- A crossing contribution locks a clearing price before the deadline.
- Finalization is only available at the 20-minute endpoint.
- All participants pay the same final price.
- Surplus ETH is available as refund credit.

Command evidence:

```bash
npm run demo
```

Expected output includes:

```text
Successful sale with surplus refunds
Final price: 0.01125 ETH/token
Tokens sold: 1000.0 FAIR
```

## 4:30-5:45 - Undersubscribed Sale

Show:

- Only 1 ETH is committed.
- Auction reaches reserve without clearing the full supply.
- Participant receives 200 FAIR at 0.005 ETH/token.
- 800 FAIR burns as unsold inventory.

Expected output includes:

```text
Undersubscribed sale with token burn
Tokens claimed: 200.0 FAIR
Tokens burned: 800.0 FAIR
```

## 5:45-7:00 - Safe Refund Failure

Show:

- `RejectingReceiver` rejects direct ETH.
- Failed refund transfer does not erase credit.
- The receiver withdraws to an alternate recipient.

Expected output includes:

```text
Rejected direct refund preserved credit: 0.75 ETH
Alternate recipient refund credit after withdrawal: 0 wei
```

## 7:00-8:15 - Reentrancy Attempt

Show:

- `ReentrantRefundAttacker` tries to reenter refund withdrawal.
- `ReentrancyGuard` blocks the nested withdrawal.
- Outer refund completes once.

Expected output includes:

```text
Reentry succeeded: false
Remaining attacker refund credit: 0 wei
```

## 8:15-9:30 - Audit And Limitations

Open:

- `docs/ai-audit-report.md`
- `docs/assumptions.md`
- `docs/requirements-checklist.md`

Mention:

- No TA approval has been claimed for ambiguous requirements.
- Issuer proceeds accrue as users settle to avoid unbounded loops.
- This is a local educational dApp, not a production token sale.

