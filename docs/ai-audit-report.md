# DutchPoint - AI Audit Report

**DutchPoint: A Decentralized Dutch Auction Platform** - SC4053 Blockchain Technology, AY2026-27 Semester 1, Option 2 (Dutch Auction).
Token: Gavora (GVRA). Repository branch with all evidence: `audit/claude-review`.

> Items marked **TODO (team)** need facts only the team has (roles, original prompts). They are left
> blank on purpose rather than guessed.

## Summary

Three AI tools built and reviewed DutchPoint in sequence: **ChatGPT** wrote the plan, **Codex** wrote the
first implementation, and **Claude Code** reviewed both, then fixed and extended them. Each defect
below was reproduced with a test that fails on the AI's original code and passes after the fix. Both
outputs are committed under [`evidence/`](evidence/).

| ID | Severity | Finding (in the Codex implementation unless noted) | Status |
| --- | --- | --- | --- |
| F1 | High | Pro-rata allocation lets a late, oversized bid take ~91% of the supply from earlier bidders | Fixed (`20e24b1`) |
| F2 | Medium | `status()`/`currentPrice()` ignore clearing caused by time passing, so the UI shows a live auction that has already sold out | Fixed (`20e24b1`, `c689e3c`) |
| F3 | Medium | An auction that sells out never reports "ready to finalize", so the UI's Finalize button is unreachable | Fixed (`20e24b1`, `c689e3c`) |
| F4 | Medium | Issuer proceeds stay locked until every bidder claims; one inactive bidder strands revenue | Fixed (`20e24b1`) |
| F5 | Low | State written after external calls (dead "restore then revert" code) - flagged High by Slither | Fixed (`20e24b1`) |
| F6 | Low | The reentrancy "demonstration" could not fail, so it proved nothing | Fixed (`031b753`) |

Validation: 52 tests (45 Mocha + 3 fuzz tests x 1,000 runs + 4 invariants x 256 runs), **100% line and
statement coverage** of `DutchAuction.sol` and `GavoraToken.sol`, a mutation check, Slither before and
after, and an end-to-end run of the real UI in headless Chrome.

---

## 1. Initial Specification & System Scope

What the team set out to build, from the brief and the team's own decisions:

**Core requirements (brief, Option 2)**
- An ERC20 project token and a *separate* auction contract.
- A token launch where bidders commit ETH during a Dutch auction lasting exactly 20 minutes.
- The price starts high and decays automatically; the auction clears when committed ETH meets the
  total token supply; every winner pays the same clearing price and excess ETH is refunded.
- Tokens sell out at or above the reserve price, otherwise unsold tokens are burned.
- Token claims and automatic refunds of surplus ETH; bonus: demonstrate reentrancy resistance.
- Tricky points to resolve: block-based time and continuous decay, a bid that bridges the clearing
  threshold, safe refunds, and permanent burning.

**Team decisions**
- Platform **DutchPoint**; token **Gavora (GVRA)**, from "gavel"; tagline *"Falling prices. One clearing price."*
- Local Hardhat deployment for the demo. According to the teammate's notes on the companion documents
  (`Document.pdf`, `Document 2.pdf`, recorded in [`ai-development-log.md`](ai-development-log.md)), local
  deployment is acceptable and the demo video must be at most 10 minutes. A Sepolia deployment is
  optional extra evidence.
- Target the rubric's "High Standard" band in all three criteria.

**UI features intended:** wallet connection, live price and countdown, a bid form, the user's
allocation, claim and refund actions, and visible burn/settlement results.

**TODO (team):** describe any planning done *before* the first AI prompt (meeting notes, sketches,
division of work). If the first written plan was the ChatGPT output, say so - the report already
treats [`prompts/chatgpt-plan.txt`](prompts/chatgpt-plan.txt) as AI output.

## 2. Development Methodology & AI Tooling Infrastructure

### Tools

| Tool | Role |
| --- | --- |
| ChatGPT | Planning: naming, auction flow, contract and function outline, security checklist, test plan ([`prompts/chatgpt-plan.txt`](prompts/chatgpt-plan.txt)) |
| Codex desktop agent | First implementation "FairLaunch": contracts, Hardhat tests, React app, docs (commit `0a75a78`); its log is [`ai-development-log.md`](ai-development-log.md) |
| Claude Code (Claude Opus 5.5, VS Code extension) | Cross-model review of the plan and code, regression tests, contract fixes, fuzz/invariant tests, Slither triage, CI, deploy tooling, frontend rebuild, this report ([`prompts/claude-code-session.md`](prompts/claude-code-session.md)) |

### Toolchain

Solidity 0.8.28, OpenZeppelin Contracts 5.6.1, Hardhat 3.18 (Mocha + ethers v6 tests, and native
Solidity tests with forge-std 1.9.7 for fuzzing and invariants), Slither 0.11.6, React 19 + Vite 8 +
ethers 6, GitHub Actions, and headless Chrome driven over the DevTools protocol for end-to-end UI checks.

### Workflow

The working rule was **"the AI proposes, tests decide"**:

1. Read the brief, the plan and the code, and compare the two AI designs against each other and the brief.
2. For every suspected defect, first write a regression test that encodes the *intended* behaviour, and
   run it against the untouched AI code. Commit the failing output as evidence (`35253ce`, [`evidence/01`](evidence/01-regressions-before-fix.txt)).
3. Fix the code, re-run, and commit the passing output ([`evidence/03`](evidence/03-regressions-after-fix.txt)).
4. Back each fix with properties that must hold for *all* inputs (fuzz and invariant tests), and check
   that the properties can catch planted bugs (mutation check).
5. Run static analysis on the original and the fixed code, and triage every result.
6. Exercise the real UI end to end, and fix what the screenshots reveal.

Each step is a separate commit, so the history is itself part of the evidence.

### Division of labour

**TODO (team):** who owned which part (contracts, frontend, testing, report), and how AI output was
reviewed between members before merging.

## 3. Specification Engineering & Prompt Logs

- **Specification files:** [`spec.md`](spec.md) (auction mathematics and conservation rules),
  [`architecture.md`](architecture.md), [`assumptions.md`](assumptions.md) (ambiguities and TA
  questions), [`requirements-checklist.md`](requirements-checklist.md) (requirement → code → test).
  Codex wrote these before its Solidity code. They were then updated to the corrected
  allocation rule, so the AI was always working from a written spec, never from chat alone.
- **Prompt logs:** [`prompts/`](prompts/README.md).
  - Claude Code prompts are reproduced verbatim with what each produced.
  - The Codex prompt is summarised in [`ai-development-log.md`](ai-development-log.md).
  - The ChatGPT output is kept as-is.
- **Context provided to the agents:** the brief (`project.pdf`), the ChatGPT plan, and the repository
  itself. For review work the agent ran the code (tests, scripts, a local node) rather than only reading
  it.

**Representative prompt chain (Claude Code):**
1. "Take a look at this project pdf…": the agent produced a requirements summary and a list of design
   risks.
2. "Read through the ChatGPT plan… we want an A": the agent compared the plan, the code and the rubric,
   and found F1-F6.
3. "Tell me what you plan to create": the agent produced a scoped plan with decisions for the team.
4. "Do the items in the scope / go with your recommendation on item 1": the agent wrote failing tests
   first, then the fixes, then validation.

**Prompt-engineering lesson:** the Codex prompt told the agent to "Handle clearing caused by time
passing without a new bid" and "Avoid unbounded loops". Codex followed both instructions literally,
but in the state-changing code paths only (F2), and by deferring proceeds to per-bidder settlement (F4).
Constraints phrased as *properties* ("the UI must never show bidding as open after demand meets
supply"; "every wei must be withdrawable by someone") would have been harder to satisfy only partly.

**TODO (team):** add the ChatGPT conversation link and the Codex session export to [`prompts/`](prompts/README.md).

## 4. AI-Generated Architecture

Both AI tools proposed broadly the same two-contract design. They differed on one critical rule.

| Aspect | ChatGPT plan | Codex implementation (`0a75a78`) |
| --- | --- | --- |
| Token | `GavoraToken`, ERC20 with mint control and burn | `LaunchToken`: ERC20 + `ERC20Burnable` + `Ownable`, supply minted once |
| Auction | `DutchAuction` with `startAuction`, `bid`, `finalizeAuction`, `claimTokens`, `withdrawRefund`, `burnUnsoldTokens` | `DutchAuction`: `start`, `contribute`/`receive`, `finalize`, `claimTokens`, `withdrawRefundTo`, `withdrawIssuerProceeds`, `burnRemainderAfterAllSettled` |
| Price | Linear decay on `block.timestamp`, floored at reserve | Same; 1,200 s; `Math.mulDiv` |
| **Crossing bid** | **Final bidder gets only the remaining supply; excess refunded** | **Whole crossing bid accepted; supply shared pro-rata by ETH committed** |
| Time-only clearing | Not mentioned | Reconstructed in `finalize`/`contribute` from `lastCommitmentTimestamp` |
| Refunds | Pull-based `withdrawRefund`, CEI, optional guard | Pull-based, computed at settlement, `ReentrancyGuard` |
| Proceeds | Not mentioned | Accrue per bidder as each bidder settles |
| State | Per-bidder `allocations` mapping (implies loops or stale data) | Per-bidder settlement flags and receipts; 5-state `Status` enum |
| Frontend | Dashboard list | One 633-line `App.tsx`, polling 22 contract reads every second |

The final architecture keeps Codex's structure (immutable sale parameters, pull refunds,
`ReentrancyGuard`, custom errors, no loops). It adopts the ChatGPT plan's crossing-bid rule, and it
replaces per-bidder proceeds accrual with aggregate accounting ([`architecture.md`](architecture.md)).

## 5. Problems Discovered & Vulnerability Analysis

### F1 - Late oversized bid crowds out earlier bidders (High)

**Where:** `0a75a78` `contracts/DutchAuction.sol:457`: `tokens = Math.mulDiv(commitment, saleSupply, totalCommitted)`.

**Why the AI made the mistake.**
- The brief asks "How to calculate claims when a bid bridges across the clearing threshold?". Codex
  treated this as a question of *simplicity*, writing in `assumptions.md` that the rule is
  "deterministic, simple for students to explain". It chose the pro-rata rule used by oversubscribed
  token sales.
- It never modelled an adversary choosing the size of the crossing bid.
- It recorded the rule as an assumption "not approved by the TA" but did not analyse its consequences.
- ChatGPT had proposed the correct rule. The two tools contradicted each other, and only cross-checking
  them exposed the problem.

**Why it is problematic.**
- Excess ETH is refunded, so over-committing costs nothing. A whale can wait, then commit an arbitrarily
  large amount at the moment of their choosing and take almost the entire supply.
- With Alice 6 ETH and Bob 4 ETH committed early, a 100 ETH bid at t = 700 s
  ([`evidence/02`](evidence/02-crowd-out-poc-before-fix.txt)):

  | | Alice | Bob | Whale |
  | --- | --- | --- | --- |
  | GVRA received | 54.55 (5.45%) | 36.36 | 909.09 (90.9%) |
  | ETH paid | | | 10.23 |
  | Fair allocation at the same price | 533.33 | 355.56 | |

- This breaks the brief's "fair participant equity" goal and rewards exactly the late sniping and
  front-running behaviour a Dutch auction is meant to remove.
- It contradicts the brief's clearing rule: the auction should clear when committed capital meets supply,
  not let capital beyond that point dilute everyone.

**How it was fixed (`20e24b1`).**
- Commitments are filled in arrival order.
- The crossing bid is accepted only up to the remaining capacity, `floor(saleSupply × price / 1e18) − totalCommitted`.
- Its surplus is refunded **in the same transaction**. If the bidder is a contract that rejects ETH, the
  surplus is credited for `withdrawRefundTo` instead, so the bid cannot be blocked.
- Bids after clearing revert with `AuctionAlreadyCleared`.
- Every bidder then receives `commitment / clearingPrice` tokens.

**Evidence the fix works.**
- Regression test F1 fails on the original code: `expected 54545454545454545454 to equal 533333333333333333333`
  ([`evidence/01`](evidence/01-regressions-before-fix.txt)). It passes after the fix ([`evidence/03`](evidence/03-regressions-after-fix.txt)).
- The proof of concept after the fix: Alice 533.33 GVRA, Bob 355.56, whale 111.11 GVRA for 1.25 ETH, with
  98.75 ETH returned in the bid transaction ([`evidence/04`](evidence/04-crowd-out-poc-after-fix.txt)).
- Fuzz property `testFuzz_SettlementIsUniformFairAndConserving` (1,000 random runs) asserts that only the
  clearing bid can be partly filled, that the surplus is returned immediately, and that everyone pays one price.
- Screenshot [`02-sellout-bid-auto-refund.png`](screenshots/02-sellout-bid-auto-refund.png) shows the same
  behaviour in the UI.

### F2 - Views ignore clearing caused by time passing (Medium)

**Where:** `0a75a78` `DutchAuction.sol:253` (`currentPrice`) and `:267` (`status`); `src/App.tsx:252` (`displayPrice`).

**Why the AI made the mistake.**
- The prompt explicitly required handling "clearing caused by time passing without a new bid". Codex
  implemented this in `_syncTimeClearing`, but only on *state-changing* paths (`finalize`, `contribute`).
- The view functions read only the stored `clearingTime`, which stays 0 until a transaction writes it.
- The AI treated "the auction has cleared" as an event that happens in a transaction, when for time-only
  clearing it is a property of the current time and must be derived the same way in every read path.

**Why it is problematic.**
- Once the price falls far enough for existing bids to buy the supply, nothing on-chain changes until
  someone transacts. `status()` still returns `Active` and `currentPrice()` keeps falling. In the F2
  scenario at t = 900 s it returns 0.00875 ETH, while the true clearing price is 0.01 ETH.
- The UI keeps the bid button enabled, so users submit bids that revert and waste gas.
- It also shows them a price lower than the one they will actually pay (an inaccurate price display).

**How it was fixed.**
- A single `clearingState()` view now derives explicit and time-based clearing (`20e24b1`). `status()`,
  `currentPrice()`, `remainingCapacity()`, `tokensOwed()` and `_contribute()` all use it.
- The frontend mirrors the same rules in BigInt (`src/lib/auctionMath.ts`, `c689e3c`), so the display is
  right even between blocks.

**Evidence the fix works.**
- Regression test F2: `expected 1 to equal 2` before ([`evidence/01`](evidence/01-regressions-before-fix.txt)), passing after.
- Tests `rejects bids once falling prices alone have cleared the auction` and `finds the exact clearing
  point when falling prices alone clear the auction`.
- In the UI check, an auction with 8 ETH committed and no bids after minute 7 is shown as cleared at
  0.008 ETH at minute 16, then as ready to finalize after minute 20
  ([`06-time-cleared-ready-to-finalize.png`](screenshots/06-time-cleared-ready-to-finalize.png)).

### F3 - A cleared auction can never be finalized from the UI (Medium)

**Where:** `0a75a78` `DutchAuction.sol:274`: `status()` returns `Cleared` before checking the deadline.
`src/App.tsx:336`: `canFinalize = snapshot?.status === 3`.

**Why the AI made the mistake.**
- The contract and the frontend were generated and tested separately.
- Every contract test and the demo script called `finalize()` directly. Nothing exercised the path from
  the UI through the `Status` enum to the contract, so an ordering mistake in `status()` was invisible.

**Why it is problematic.**
- For any auction that sells out early (the *success* path), `status()` reports `Cleared` forever, so the
  "Finalize auction" button stays disabled.
- Without finalization nobody can claim GVRA or withdraw refunds or proceeds through the dApp. Funds
  appear bricked to every UI user, even though a direct contract call would still work.

**How it was fixed.**
- `status()` checks the deadline before clearing, so after 20 minutes it returns `AwaitingFinalization`
  (`20e24b1`).
- The rebuilt UI derives finalizability from the same rule (`c689e3c`).

**Evidence the fix works.**
- Regression test F3: `expected 2 to equal 3` before, passing after.
- Test `moves through Pending, Active, Cleared, AwaitingFinalization and Finalized`.
- The end-to-end UI run sold out the auction, clicked Finalize and Claim, and confirmed the claim
  ([`03-finalized-and-claimed.png`](screenshots/03-finalized-and-claimed.png)).
- A time-cleared auction shows "Ready to finalize" after the window ends
  ([`06-time-cleared-ready-to-finalize.png`](screenshots/06-time-cleared-ready-to-finalize.png)).

### F4 - Issuer proceeds locked behind every bidder's claim (Medium)

**Where:** `0a75a78` `DutchAuction.sol:443`: `issuerProceedsAvailable += acceptedEth` inside per-bidder `_settleAccount`.

**Why the AI made the mistake.**
- The prompt said "Avoid unbounded loops for settlement, refunds, and burning". Under pro-rata settlement
  each bidder's accepted ETH is unknown until that bidder settles. Codex therefore accrued proceeds one
  bidder at a time, which avoids a loop but makes revenue depend on bidder behaviour.
- It listed this as a "known limitation" instead of questioning the design that caused it.

**Why it is problematic.**
- Any bidder who never claims (lost keys, abandoned wallet) permanently strands their share of the
  issuer's revenue in the contract.
- "ETH becoming permanently stuck" is on the ChatGPT plan's own audit checklist.

**How it was fixed (`20e24b1`).**
- With arrival-order filling, every accepted wei is sale revenue. Proceeds are therefore exactly
  `totalCommitted`, known at finalization and withdrawable at once.
- Refund credits are tracked separately (`refundLiability`), so withdrawing proceeds can never consume
  ETH owed back to bidders.

**Evidence the fix works.**
- Regression test F4: `reverted with custom error 'NoProceedsAvailable()'` before, passing after.
- Invariant `invariant_EthIsFullyBacked`: balance = unwithdrawn proceeds + refund credits, over 256 random
  sequences.
- Mutation M2 in [`evidence/06`](evidence/06-mutation-check.txt): letting the issuer withdraw the raw
  balance is caught by 3 invariants.

### F5 - State written after external calls (Low; Slither: High)

**Where:** `0a75a78` `DutchAuction.sol:207` and `:230`: after a failed ETH transfer the code restored
`refundCredits`, `refundLiability`, `refundsWithdrawn` and `issuerProceedsWithdrawn`, then reverted.

**Why the AI made the mistake.**
- This is defensive pattern-matching ("undo on failure"). It misses that `revert` already rolls back
  every state change in the call, so the restoring writes are dead code.

**Why it is problematic.**
- It is not exploitable, because the functions are `nonReentrant` and revert immediately.
- However, it writes state after an external call, which obscures checks-effects-interactions.
- Slither reports it as **High** `reentrancy-eth` in two functions ([`evidence/08`](evidence/08-slither.txt), part A).
  Noise at that severity hides real findings and costs every future reviewer time.

**How it was fixed (`20e24b1`).**
- The dead writes are removed.
- The new surplus refund writes state after the call *only when the call failed*. Anything the receiver
  changed during a failed call has already been reverted.

**Evidence the fix works.**
- Slither on the current contract reports no High findings (part B).
- `npm run slither` fails CI on any Medium or High finding.

### F6 - The reentrancy "demonstration" could not fail (Low)

**Where:** `0a75a78` `test/DutchAuction.test.ts:382` with `ReentrantRefundAttacker.sol`.

**Why the AI made the mistake.**
- The bonus asks to "demonstrate reentrancy attack resistance". Codex wrote an attacker that re-enters
  `withdrawRefundTo`, but the refund credit is zeroed before the transfer.
- By inspection, even without `ReentrancyGuard` the nested call finds no credit, so the test passes either
  way. There is also no vulnerable baseline showing what the attack does when it works.
- The AI satisfied the wording of the requirement without producing evidence that could discriminate.

**Why it is problematic.**
- A test that cannot fail is not evidence. Markers would see the attacker "fail" without ever seeing why
  that matters.

**How it was fixed (`031b753`).**
- Added `VulnerableAuction.sol`: a deliberately vulnerable, test-only contract whose refund sends ETH
  before clearing the credit.
- Added a generic `ReentrancyAttacker.sol` that can be pointed at either contract.

**Evidence the fix works.**
- Against `VulnerableAuction`, the attacker re-enters 10 times and leaves with **11 ETH** (its own 1 ETH
  plus Alice's and Bob's bids).
- Against `DutchAuction`, the nested call is rejected and it receives **only its 0.75 ETH refund**
  ([`evidence/05`](evidence/05-reentrancy-demo.txt)).
- Slither flags the vulnerable contract as `reentrancy-eth`, confirming the demonstration targets a real
  vulnerability class.

### Other issues found in the AI output

| Area | Issue | Resolution |
| --- | --- | --- |
| Token | `LaunchToken` inherited `Ownable` but no function used it - an unnecessary privileged role | `GavoraToken` has no owner and no mint function (`1ba8883`); test `exposes no mint function and no owner` |
| Contract | Unused `issuer` immutable; redundant `participantRegistered` mapping | Removed (`20e24b1`) |
| Frontend | 22 RPC reads every second; no bid history; owner-only buttons shown to everyone; raw error strings; "provisional allocation" estimated with the pro-rata rule | Block-driven refresh, event-based history, owner-gated issuer panel, decoded custom errors (`c689e3c`) |
| Audit report | The Codex draft's two lead "issues" were hypothetical ("Inference: a simple implementation might…") and two others were bugs in its own test/demo scripts; none had before/after evidence | Replaced by this report; only defects reproduced on the original code are listed as findings |
| Tooling | Slither never run ("not installed"); no fuzzing; no CI | Sections 6-7 |

### Issues in the second AI pass (Claude Code) caught by validation

The reviewing AI also made mistakes. They were caught by the same process:

| Issue | Caught by |
| --- | --- |
| Gas cost computed as `receipt.gasUsed * receipt.gasPrice` on untyped values, which TypeScript inferred as `number` mixed with `bigint` | `npm run typecheck` |
| Mobile layout overflowed to 516 px on a 390 px screen (a grid track sized to the bid table's minimum width) | Measuring `scrollWidth` in headless Chrome; fixed with `minmax(0, 1fr)` tracks |
| "Cleared at…" chart label drawn on top of the price line | Screenshot review |
| Bid panel said "Claims open once the auction is finalized" *after* finalization | Screenshot review of the finalized state |
| End-to-end driver searched case-sensitively for text that CSS renders in upper case | First driver run timed out; page text dumped and inspected |

## 6. Validation Process & Testing Strategy

| Layer | What | Result |
| --- | --- | --- |
| Regression tests | F1-F4 encoded as tests, run before and after the fix | 4 failing → 4 passing ([`01`](evidence/01-regressions-before-fix.txt), [`03`](evidence/03-regressions-after-fix.txt)) |
| Unit and scenario tests (Mocha) | Configuration, price, bidding, crossing bid, both clearing modes, status machine, claims, dust burn, refunds (incl. ETH-rejecting bidder), issuer access control, conservation, token | 45 passing |
| Fuzz tests (Solidity, forge-std) | Price monotonic and bounded; random bidders/amounts/times settle uniformly, fairly and conservatively; exact time-clearing price | 3 tests × 1,000 runs |
| Invariant tests | Handler drives random bids, time jumps, finalization, claims and withdrawals (incl. a rejecting bidder). Invariants: ETH fully backed, tokens conserved, demand ≤ supply, one uniform price | 4 invariants × 256 runs × depth 50 |
| Mutation check | Plant M1 (round time-clearing price down) and M2 (issuer withdraws raw balance), confirm failures, restore | M1: 6/7 property tests fail; M2: 3/7 fail ([`06`](evidence/06-mutation-check.txt)) |
| Coverage | `npm run coverage` | `DutchAuction.sol` and `GavoraToken.sol`: 100% lines and statements ([`07`](evidence/07-test-suite-and-coverage.txt)) |
| Static analysis | Slither 0.11.6 on original and current code, token, and vulnerable demo | Original: 19 results incl. High `reentrancy-eth`. Current: 0 High; 4 Medium `incorrect-equality` false positives annotated inline; remaining Low/Info are by design ([`08`](evidence/08-slither.txt)) |
| Reentrancy demo | Same attacker vs. vulnerable and real auction | 11 ETH drained vs. 0.75 ETH own refund ([`05`](evidence/05-reentrancy-demo.txt)) |
| End-to-end UI | Local node + deploy + seeded bids; headless Chrome with an injected test wallet clicks Connect, sell-out bid, Finalize, Claim | All steps confirmed; screenshots in [`screenshots/`](screenshots/) |
| Visual checks | Light/dark mode, 1280/820/390 px widths | No horizontal page scroll at 390 px after fix |
| CI | `.github/workflows/ci.yml`: compile, coverage, typecheck, build, demo, Slither | Added; **not yet run on GitHub** (branch not pushed) |
| Testnet | `npm run deploy:sepolia` records addresses and tx hashes in `deployments/sepolia.json` | **Not yet run** - TODO (team) if desired |

**Slither triage (current contract).**
- `incorrect-equality` (Medium, 4): the flagged comparisons are zero-guards on internal accounting values,
  not balances an attacker can steer. The one balance check (`burnRemainderAfterAllClaimed`) can only be
  affected by donations, which just add tokens to burn. Annotated inline.
- `timestamp` (Low, 10): the auction is time-based by design. After the Merge, slots are fixed at 12 s,
  so a proposer cannot meaningfully move `block.timestamp`.
- `reentrancy-benign` (Low, 1): explained under F5.
- `low-level-calls` (Info, 3): `call` is used deliberately so contract wallets receive ETH with enough
  gas. Return values are checked and the calls are guarded.
- **Slither found none of F1-F4.** They are business-logic defects that only tests encoding the
  intended economics could expose.

## 7. Improvements & Refinements

**Contracts**
- Arrival-order filling with an automatic surplus refund that falls back to a pull-based credit.
- An exact continuous-decay clearing price, `ceil(totalCommitted / saleSupply)`, for time-only clearing,
  which provably keeps total claims ≤ supply.
- A single `clearingState()` used by every read path.
- New views for the frontend: `remainingCapacity`, `maxCommitmentAt`, `tokensOwed` (a lower bound before
  finalization).
- Proceeds withdrawable at finalization, with refunds tracked separately.
- `GavoraToken` with a fixed supply, no mint function and no owner.
- Constructor rejects parameters under which the auction could never clear.

**Testing and tooling**
- Fuzz and invariant suite plus the mutation check, a regression suite, and a reentrancy demonstration
  with a vulnerable baseline.
- Slither config with a Medium/High gate, CI workflow and coverage script.
- A network-agnostic deploy script that writes Etherscan links, verification commands and a
  deployment record for public networks.
- Local helpers: `seed:local` and `time:advance`.

**Frontend**
- Rebuilt from one 633-line file into hooks and components.
- Status, price and countdown derived from a BigInt mirror of the contract rules.
- Sell-out quote that previews the immediate refund; demand-vs-supply meter; clearing point on the chart.
- Event-based bid history that tags the bid which cleared the auction.
- Owner-only issuer panel and readable error messages.
- Network switching that offers to add the local chain; read-only view before connecting.
- Local time-travel tools for the demo; dark mode and a mobile layout.

**Documentation**
- This report, the evidence folder, prompt logs, an updated spec, assumptions and checklist, and a
  demo script.

## 8. Lessons Learned

**Where AI excelled**
- Scaffolding a complete, compiling project quickly: contracts, tests, frontend, scripts and docs.
- Breadth of tests for *stated* requirements, and careful integer arithmetic (`mulDiv`, rounding direction).
- Reviewing another AI's work. A second model with a different plan found the allocation flaw that the
  first model had documented as a reasonable assumption.
- Mechanical work: rebranding, test rewrites, CI and deployment tooling.

**Where AI failed**
- **Adversarial economics.** No tool asked "what does a rational attacker do with this rule?" until the
  rule was tested with an attacker in mind (F1).
- **Cross-layer integration.** Each layer was correct in isolation. Bugs lived at the seams: views vs.
  state-changing paths (F2), contract enum vs. UI (F3).
- **Requirements as properties.** Instructions were followed literally rather than as invariants (F2, F4).
- **Self-assessment.** The first AI audit report listed hypothetical and test-script issues as findings,
  and its reentrancy test could not fail (F6). AI-written evidence needs the same scrutiny as AI-written code.
- **Visual and layout details.** Overflow and label placement were only caught by rendering the page.

**Recommendations for AI-driven dApp development**
1. Have a second, different model review the plan and the code, and treat disagreements between them as
   audit leads.
2. Write the failing test before accepting any AI fix, and commit both outputs.
3. State requirements as invariants (conservation, solvency, uniform price) and fuzz them. Then plant
   bugs to prove the tests can fail.
4. Run static analysis on the *original* AI output too: it shows what the tools can and cannot see.
5. Exercise the real UI end to end. Many defects only exist between layers.
6. Never accept an AI's claim of a fix, or of a finding, without reproducible evidence.
