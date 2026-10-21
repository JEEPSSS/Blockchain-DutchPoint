# AI Development Log

This log supports the AI Audit Report. It records real prompts, decisions, issues, and verification evidence as the project is built. Do not invent bugs, test output, or approvals.

## Required AI Audit Sections

The final report must include:

1. Initial specification and system scope.
2. Development methodology and AI tooling.
3. Specification engineering and prompt logs.
4. Initial AI-generated architecture.
5. Problems discovered and vulnerability analysis.
6. Validation process and testing strategy.
7. Improvements and refinements.
8. Lessons learned.

## 2026-09-25 - Initial Prompt And Scope

User prompt summary:

- Build SC4053 Option 2 Dutch Auction as FairLaunch.
- Read `project.pdf`, `Document.pdf`, and `Document 2.pdf` first.
- Inspect workspace and AGENTS instructions.
- Establish specification and auction mathematics before implementation.
- Use Solidity, OpenZeppelin, Hardhat, React, Vite, TypeScript, ethers, and MetaMask.
- Implement complete contracts, frontend, tests, scripts, docs, and AI audit evidence.
- Do not deploy to mainnet or require paid services.

Workspace findings:

- No `AGENTS.md` was found under the project parent tree.
- The workspace initially contained the assignment PDFs and lecture PDFs only.
- `project.pdf` is the primary source. `Document.pdf` and `Document 2.pdf` provide assessment, registration, submission, README, local deployment, and demo-video logistics.

AI/tooling used:

- Codex desktop coding agent.
- PDF extraction using the local PDF skill and bundled Python/pdfplumber.
- Web documentation checks for current Hardhat, OpenZeppelin, ethers, and Vite guidance.

## 2026-09-25 - Source Reading Notes

Primary brief requirements from `project.pdf`:

- Build a dApp using tokens and smart contracts on Ethereum.
- Option 2 is a Dutch auction token launch over a 20-minute window.
- Use an ERC20 token and separate auction contract mechanics.
- Use descending price and uniform final clearing price.
- Participants commit ETH capital.
- When committed capital meets total token supply, the auction clears.
- Every winning bidder pays the same final clearing price and excess ETH is refunded.
- Unsold tokens are burned.
- Bonus includes reentrancy attack resistance demonstration.
- AI Audit Report is required with eight named sections.

Companion document notes:

- Local deployment is acceptable.
- Complete codebase and README are required.
- Demo video must be no more than 10 minutes.

Lecture material used:

- Module 3 Ethereum lectures: contract accounts, transactions, message calls, contract code execution, gas, and immutability.
- DeFi lectures: gas wars, transaction ordering, Dutch auctions in liquidation contexts, and burn mechanics.

> **Audit note (2026-10-21):** the course slides do not support this line. No deck mentions auctions,
> liquidations, gas wars or front-running; see "Other issues found in the AI output" in the AI Audit Report.

## 2026-09-25 - Architecture Decisions

Initial AI-generated architecture:

- `LaunchToken.sol`: fixed-supply ERC20 with burn capability.
- `DutchAuction.sol`: commitment accounting, price decay, finalization, claims, refunds, and burn accounting.
- Test-only receiver/attacker contracts for refund rejection and reentrancy.
- React/Vite dashboard with direct contract reads.
- Hardhat TypeScript tests for auction math and failure cases.

Reasoning:

- Keeping token and auction logic separate matches the brief.
- Pull refunds reduce reentrancy and denial-of-service risk.
- No unbounded settlement loops keeps the design scalable enough for Ethereum gas limits.

## 2026-09-25 - Auction Math Decisions

Important decisions:

- This is an ETH-budget commitment auction, not a pay-at-submission-price sale.
- Price is linear over exactly 1,200 seconds and floored at reserve.
- Clearing condition uses full-precision `ceil(S * P / TOKEN_SCALE)`.
- Time-decay clearing is reconstructed at finalization if no transaction occurs at the clearing second.
- Threshold-crossing contributions are accepted fully and surplus is refunded after settlement.
- Cleared sale token allocation is pro-rata by total committed ETH.
- Undersubscribed sale allocation is budget divided by reserve price.
- Per-account token amounts round down; accepted ETH rounds up.

Potential risk identified before coding:

- Burning the full remaining token balance at finalization can burn unclaimed entitlements.

Planned mitigation:

- Burn only globally provable unsold inventory at finalization.
- Burn residual dust only after all recorded participants settle.

## Issue Log Template

Use this format for every real major issue discovered:

### Issue: Title

- Status:
- Where found:
- Likely reason it occurred: Inference: ...
- Why it matters:
- What changed:
- Evidence the fix works:

## Verification Log

Add command outputs here after they are actually run.

| Date | Command | Result | Notes |
| --- | --- | --- | --- |
| 2026-09-25 | PDF extraction of primary documents | Passed | Extracted `project.pdf`, `Document.pdf`, and `Document 2.pdf` to `tmp/pdfs/` for analysis. |
| 2026-09-25 | `npm run compile` | Passed | Downloaded and used solc `0.8.28`; compiled 4 Solidity files. |
| 2026-09-25 | `npm run test` | Passed | 18 passing Hardhat/Mocha tests. |
| 2026-09-25 | `npm run typecheck` | Passed | App and Hardhat TypeScript projects pass. |
| 2026-09-25 | `npm run build` | Passed | Vite production build passed; chunk-size warning due ethers bundle. |
| 2026-09-25 | `npm run demo` | Passed | Demonstrated successful sale, undersubscribed burn, rejecting receiver, and blocked reentrancy. |
| 2026-09-25 | `which slither` | Not available | `slither not found`; static analysis not executed locally. |

### Issue: Naive time-clearing can use capital before it existed

- Status: Fixed before first test run.
- Where found: Auction math design.
- Likely reason it occurred: Inference: a simple finalization formula might compute earliest clearing from final `totalCommitted` and ignore when the latest contribution arrived.
- Why it matters: A late large contribution could retroactively move clearing earlier, changing the final price unfairly.
- What changed: Added `lastCommitmentTimestamp`; time-only clearing is valid only after the current committed capital existed. Crossing contributions lock at the contribution timestamp.
- Evidence the fix works: `detects clearing caused by time passing without a new contribution` and `locks clearing before the deadline...` pass.

### Issue: Burning raw token balance could destroy unclaimed entitlements

- Status: Fixed in design before implementation.
- Where found: Specification phase.
- Likely reason it occurred: Inference: "burn unsold tokens" can be misread as "burn every token still held by the auction at finalization."
- Why it matters: Before claims, the auction contract still holds tokens owed to participants.
- What changed: Burn only provably unsold inventory at finalization. Burn residual dust only after all participants have settled.
- Evidence the fix works: `handles tiny commitments, rounding, and residual dust burning` and conservation tests pass.

### Issue: Initial duplicate-withdrawal test accidentally bid after time clearing

- Status: Fixed test case.
- Where found: First test run.
- Likely reason it occurred: The first contribution amount was high enough that time decay cleared before the later bid.
- Why it matters: The test no longer exercised duplicate withdrawals.
- What changed: Adjusted commitments so the later bid is the actual threshold-crossing contribution.
- Evidence the fix works: Full suite passes with 18 tests.

### Issue: Demo script called dust burn when no dust remained

- Status: Fixed script.
- Where found: First demo run.
- Likely reason it occurred: The undersubscribed example sold an exact token amount, so no post-claim dust existed.
- Why it matters: Demo failed despite correct contract behavior.
- What changed: Demo checks auction token balance before calling `burnRemainderAfterAllSettled`.
- Evidence the fix works: `npm run demo` completes.

## 2026-10-20 - Cross-model review and remediation (Claude Code)

Tool: Claude Code VS Code extension, model Claude Opus 5.5. Prompts are reproduced verbatim in
[`prompts/claude-code-session.md`](prompts/claude-code-session.md).

Inputs reviewed: the brief, the ChatGPT plan ([`prompts/chatgpt-plan.txt`](prompts/chatgpt-plan.txt)), and
this repository at `0a75a78` (18 tests passing).

Key observation: the two AI tools disagreed on the threshold-crossing bid. ChatGPT allocated only the
remaining supply to the final bidder; Codex shared the supply pro-rata. A proof of concept showed the
pro-rata rule lets a late 100 ETH bid take 90.9% of the supply (finding F1).

Team decisions recorded during the session: platform DutchPoint, token Gavora (GVRA), title
"DutchPoint: A Decentralized Dutch Auction Platform", tagline "Falling prices. One clearing price.";
adopt arrival-order filling; Sepolia optional.

| Commit | Change |
| --- | --- |
| `35253ce` | Regression tests F1-F4 and crowd-out PoC; all four fail on the original code (`evidence/01`, `02`) |
| `20e24b1` | Fill-order allocation with same-transaction surplus refund, exact time-clearing price, correct `status()`/`currentPrice()`, proceeds at finalization (`evidence/03`, `04`) |
| `031b753` | Vulnerable vs. secure reentrancy demonstration (`evidence/05`) |
| `7d4a531` | Solidity fuzz and invariant suite, mutation check, edge-case tests, coverage (`evidence/06`, `07`) |
| `1ba8883` | Rebrand to DutchPoint / GavoraToken (GVRA); token without owner |
| `2c450c4` | Slither config and triage, CI workflow (`evidence/08`) |
| `4c991e6` | Network-agnostic deploy script, optional Sepolia, time helper |
| `c689e3c` | Frontend rebuild, end-to-end UI run, screenshots |

### Verification log (2026-10-20)

| Command | Result | Notes |
| --- | --- | --- |
| `npm run test -- test/AuditRegressions.test.ts` on `0a75a78` contracts | 4 failing | Expected: proves F1-F4 exist |
| `npm run test` | 52 passing | 45 Mocha, 7 Solidity (3 fuzz × 1,000 runs, 4 invariants × 256 runs) |
| `npm run coverage` | 100% lines/statements | `DutchAuction.sol`, `GavoraToken.sol` |
| Mutation check (M1, M2) | Caught | 6/7 and 3/7 property tests fail; contract restored |
| `npm run slither` | Passes Medium/High gate | Original code: 19 results incl. High `reentrancy-eth` |
| `npm run typecheck`, `npm run build` | Pass | Bundle-size warning from ethers |
| `npm run demo` | Pass | Five scenarios |
| Local node + `deploy:local` + `seed:local` + headless Chrome UI run | Pass | Connect, sell-out bid with refund, finalize, claim; light/dark; 390/820/1280 px |
| GitHub Actions CI | Not run yet | Runs when the branch is pushed |
| `npm run deploy:sepolia` | Not run | Optional; needs a funded test wallet and RPC key |

## 2026-10-21 - Merge to main, audit follow-ups and repository restructure

Tool: Claude Code. PR #1 was merged into `main`, and the team now commits directly to `main`.
GitHub Actions CI passed on the PR and on `main`.

| Commit | Change |
| --- | --- |
| `a7b6565` | AI Audit Report §1 rewritten (how the pre-AI scope was recorded, intended contract logic, delivery constraints, open questions linked to F1-F6); Appendix A maps lecture concepts to the design; three new known limitations |
| `7f32aad` | Recorded Codex's unsupported lecture citation (see the audit note under "2026-09-25 - Source Reading Notes") |
| this entry | Repository restructure, below |

Restructure (team-approved; `git mv`, so file history is kept):

| Before | After | Why |
| --- | --- | --- |
| `index.html`, `vite.config.ts`, `tsconfig.app.json`, `src/` | `frontend/` | Separates on-chain code from the browser app, mirroring the course's client-blockchain architecture |
| `contracts/test/` | `contracts/mocks/` | Avoids confusion with `test/`; makes clear the attacker and vulnerable contracts are not production code |
| `docs/ai-audit-report.md`, `ai-development-log.md`, `evidence/`, `prompts/` | `docs/ai-audit/` | Keeps the graded report together with everything it cites |
| `docs/spec.md`, `architecture.md`, `assumptions.md`, `requirements-checklist.md` | `docs/design/` | Groups the design documents |
| `docs/demo-script.md`, `screenshots/` | `docs/demo/` | Groups the demo material |

Paths quoted in evidence files and in earlier entries of this log are left as they were at the time.

| Check after the move | Result |
| --- | --- |
| Clean `npm run check` (compile, 52 tests, typecheck, build) | Pass; build output now in `frontend/dist/` |
| `npm run demo`, `npm run slither` | Pass; same 14 low/informational Slither results as before |
| `npm run node` + `deploy:local` + `seed:local` + `npm run dev` | Pass; ABIs and addresses written to and read from `frontend/src/generated/` |
| Root `.env` reaches the frontend (`envDir: ".."`) | Pass |
| Relative Markdown links in all tracked docs | 0 broken |

## 2026-10-21 - Gas evidence, prompt log and GitHub Pages

Tool: Claude Code, plus one Claude Code subagent for the Pages work.

| Commit | Change |
| --- | --- |
| `da81b1e` | `test/Gas.test.ts`: five calls cost exactly the same after 1, 10, 50 and 100 earlier bidders. Mutation M3 (a planted per-bidder loop) fails it. `npm run gas`; evidence 09 |
| `16232b9` | Claude Code prompt log completed for both days, with the wording edited for grammar and tone and labelled as such |
| `4d88495` | Subagent: "not deployed yet" card, offline warning, and a fix for the wrong-network prompt offering a chain with no deployment; inline favicon |
| `388399e` | Subagent: bid history read in 10,000-block chunks (PublicNode caps `eth_getLogs` at 50,000 blocks) |
| `9d828ae` | Subagent: `.github/workflows/pages.yml` publishes the frontend to GitHub Pages, targeting Sepolia |

Subagent review by the main session before merging (cherry-picked onto `main`):

| Check | Result |
| --- | --- |
| Read the full diff (workflow, component, hook, error helper, docs) | Accepted; no contract or test changes |
| Action versions against GitHub's release API (`checkout` v7.0.1, `setup-node` v7.1.0, `configure-pages` v6.0.0, `upload-pages-artifact` v5.0.0, `deploy-pages` v5.0.1) | All exist as the subagent reported |
| `npm run check` on the merged `main` | 53 passing; typecheck and build pass |
| Pages-style build (`--base /Blockchain-DutchPoint/`, Sepolia default) and the normal build | Assets under the sub-path for Pages, and under `/` for the normal build |
| Running local dev server after the merge | Still serves the local auction |
| GitHub Pages enabled on the repository | **No** (API returns 404); the repo owner must enable it once |
