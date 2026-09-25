# FairLaunch AI Audit Report Draft

## 1. Initial Specification And System Scope

FairLaunch targets SC4053 Option 2, Dutch Auction. The intended system is a local Ethereum dApp with:

- A fixed-supply ERC20 project token.
- A separate Dutch auction contract.
- ETH-budget commitments.
- A deterministic descending price over exactly 1,200 seconds.
- One final clearing price for all successful participants.
- Token claims, safe refund withdrawals, issuer proceeds accounting, and unsold-token burning.
- A React/Vite frontend for local MetaMask demonstration.

Out of scope:

- Mainnet deployment.
- Multiple auctions or auction factories.
- Upgradeable proxies.
- Oracles, allowlists, KYC, backend services, cross-chain support, and secondary trading.

## 2. Development Methodology And AI Tooling

AI tooling used:

- Codex desktop coding agent for specification, code generation, tests, and documentation.
- Local PDF extraction with pdfplumber to read the brief and companion documents.
- Official documentation checks for Hardhat, OpenZeppelin, ethers, and Vite.

Workflow:

1. Extracted and reviewed `project.pdf`, `Document.pdf`, and `Document 2.pdf`.
2. Wrote specification, architecture, assumptions, and development log before Solidity implementation.
3. Defined auction equations and numeric examples.
4. Implemented contracts and adversarial test helpers.
5. Built a Hardhat test suite for the required failure cases.
6. Built the React/Vite dashboard.
7. Added deployment, ABI export, and deterministic demo scripts.
8. Ran compile, tests, typecheck, build, and demo.

## 3. Specification Engineering And Prompt Logs

Representative initial prompt summary:

> Build SC4053 Option 2 Dutch Auction as FairLaunch. Read the PDFs first. Implement a manageable complete project with docs, auction math, Solidity, Hardhat tests, React/Vite frontend, safe settlement, AI audit evidence, README, deployment scripts, deterministic demo, limitations, and TA questions.

Specification files created for AI-guided implementation:

- `docs/spec.md`
- `docs/architecture.md`
- `docs/assumptions.md`
- `docs/ai-development-log.md`

Important prompt constraints preserved:

- Treat `project.pdf` as primary source.
- Do not claim assumptions are approved.
- Do not implement pay-at-submission-price.
- Handle clearing caused by time passing without a new bid.
- Avoid unbounded loops for settlement, refunds, and burning.
- Do not invent audit findings.

## 4. Initial AI-Generated Architecture

The architecture proposed and implemented:

- `LaunchToken.sol`: fixed-supply ERC20 with OpenZeppelin burn support.
- `DutchAuction.sol`: one auction per deployment, immutable sale parameters, 1,200-second price decay, early clearing lock, deadline finalization, pull refunds, and tracked issuer proceeds.
- `RejectingReceiver.sol`: test-only refund rejection helper.
- `ReentrantRefundAttacker.sol`: test-only reentrancy helper.
- Hardhat TypeScript tests.
- React/Vite frontend with ethers v6 and MetaMask.
- Local deployment and deterministic demo scripts.

## 5. Problems Discovered And Vulnerability Analysis

### Issue: Naive time-clearing can use capital before it existed

- Status: Fixed before first test run.
- Where found: Auction math design.
- Likely reason it occurred: Inference: a simple implementation might compute the earliest clearing time from final `totalCommitted` only, ignoring when the latest contribution arrived.
- Why it matters: A late large contribution could incorrectly move the clearing time into the past, changing the final price and over-rewarding participants.
- What changed: `DutchAuction` tracks `lastCommitmentTimestamp`. Time-decay clearing is reconstructed only at or after the time when the current committed capital became available. If a new contribution crosses the threshold, clearing locks at that contribution timestamp.
- Evidence the fix works: `detects clearing caused by time passing without a new contribution` and `locks clearing before the deadline...` both pass.

### Issue: Burning remaining balance at finalization can burn owed tokens

- Status: Fixed in design before implementation.
- Where found: Specification and settlement design.
- Likely reason it occurred: Inference: the brief says unsold tokens are burned, but unclaimed entitlements also remain in the auction contract before users claim.
- Why it matters: Burning the raw auction token balance immediately after finalization would destroy tokens owed to participants.
- What changed: Finalization burns only globally provable unsold inventory. Residual dust is burnable only after every recorded participant has settled.
- Evidence the fix works: `handles tiny commitments, rounding, and residual dust burning` and `conserves tracked ETH and token accounting across settlement` pass.

### Issue: Initial duplicate-withdrawal test tried to bid after time clearing

- Status: Fixed test.
- Where found: First `npm run test` run.
- Likely reason it occurred: The test committed enough ETH early that the auction time-cleared before the later contribution.
- Why it matters: The test was not exercising duplicate withdrawals; it was accidentally verifying post-clearing contribution rejection.
- What changed: Adjusted commitments so the second contribution is the threshold-crossing bid.
- Evidence the fix works: Full test suite now passes with 18 tests.

### Issue: Demo script attempted dust burn when no dust existed

- Status: Fixed script.
- Where found: First `npm run demo` run.
- Likely reason it occurred: The undersubscribed example sold exactly 200 tokens, leaving no residual dust after the participant claimed.
- Why it matters: The demo failed even though contract behavior was correct.
- What changed: The script checks the auction token balance before calling `burnRemainderAfterAllSettled`.
- Evidence the fix works: `npm run demo` now completes all four scenarios.

## 6. Validation Process And Testing Strategy

Commands run:

```bash
npm run compile
npm run test
npm run typecheck
npm run build
npm run demo
```

Results:

- Compile: passed with solc `0.8.28`.
- Contract tests: 18 passing.
- Typecheck: passed.
- Production frontend build: passed.
- Demo: passed.
- Slither: unavailable locally (`slither not found`).

Test coverage includes:

- Price start, midpoint, deadline, monotonic decay, reserve floor.
- Rejection before opening and after closing.
- No contributors.
- Partial reserve-price sale.
- Early clearing.
- Time-only clearing.
- Threshold-crossing contribution.
- Multiple contributions by one wallet.
- Small amounts, rounding, and dust.
- Uniform final pricing.
- Claim-order independence.
- Duplicate claims and withdrawals.
- Early and repeated finalization.
- Unauthorized start and proceeds withdrawal.
- Rejecting refund receiver.
- Reentrancy attempt.
- ETH and token conservation.

## 7. Improvements And Refinements

Improvements over a minimal implementation:

- Explicit auction math with examples before coding.
- `lastCommitmentTimestamp` to prevent retroactive clearing.
- Pull refunds with alternate recipient support.
- Issuer proceeds accrue from settled accounts rather than raw ETH balance.
- Dust burn gated by all participants settling.
- No bidder loops in settlement, refund withdrawal, or burning.
- Responsive frontend with wrong-network handling and provisional allocation labels.
- Deterministic demo script for repeatable evidence.

## 8. Lessons Learned

AI was useful for quickly structuring the project, generating tests, and keeping documentation aligned with implementation. The most valuable guardrail was forcing the auction mathematics into a written spec before Solidity work started.

AI needed careful review around economic edge cases. In particular, time-only clearing and unsold-token burning are easy to describe but subtle to implement safely.

Future AI-assisted dApp work should:

- Require equations and conservation properties before code.
- Test adversarial receivers early.
- Treat raw ETH and token balances as unsafe accounting shortcuts.
- Record assumptions instead of silently choosing an interpretation of ambiguous briefs.
- Run static analysis where available and disclose when unavailable.

