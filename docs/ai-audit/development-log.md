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

## 2026-10-21 - Repository transfer and GitHub Pages live

The repository moved from JEEPSSS to JacksonSeowJX. GitHub redirects the old address, and every commit
hash is unchanged, so the hashes cited in the audit report still resolve. Pages was then enabled through
the API with GitHub Actions as the source (`POST /repos/{owner}/{repo}/pages`, `build_type=workflow`).

| Check | Result |
| --- | --- |
| Repository owner and permissions | `JacksonSeowJX/Blockchain-DutchPoint`, admin; JEEPSSS and afwh24 keep write access |
| `f7d935c` (links to the new owner) | Pages workflow: build and deploy succeeded; CI succeeded |
| <https://jacksonseowjx.github.io/Blockchain-DutchPoint/> | `index.html`, JS and CSS all HTTP 200 under the sub-path; Sepolia chain ID and read RPC in the bundle |
| Headless Chrome render of the live site | Header, "DutchPoint isn't deployed on Sepolia yet" card with the README link, and the how-it-works section |

## 2026-10-21 - Dependency audit and the submission zip

| Commit | Change |
| --- | --- |
| `c55fcc1` | Runtime and development dependencies split (only `react`, `react-dom` and `ethers` are runtime); Vite 8.3.5 and `npm audit fix` without `--force`. `npm audit`: 10 (2 high, 8 low) -> 0; none reached the contracts or the shipped site (evidence 10) |
| `4981dbc` | `npm run package` (`scripts/package.sh`): `DutchPoint.zip` built from a fresh single-branch clone, so it holds the tracked files and the full history, and refuses to run with uncommitted changes |

Grader simulation on the zip built from `4981dbc` (3.1 MB), unzipped into an empty folder:

| Check | Result |
| --- | --- |
| Contents | 84 files, all tracked; no `node_modules`, build output, `.env`, local deployment record or agent worktrees |
| History | 25 commits on `main` only; `origin` points to GitHub; `git show 35253ce` works |
| `npm ci` | 216 packages, 0 vulnerabilities |
| `npm run check` | Compiled 7 files; 53 passing; build succeeded |
| `npm run demo` | Five scenarios; no tracked files changed by the run |

## 2026-10-22 - Manual run-through with the real MetaMask extension

A student ran the local dApp in Chrome with MetaMask (fresh auction, no seeded bids), guided step by step.
The wallet started on BNB Chain (chain 56). The app showed "DutchPoint isn't deployed on Chain 56" and
its *Switch to Hardhat Local* button added and switched the network. The agent then read the auction
state back from the node:

| Step | On-chain result |
| --- | --- |
| Bid 1 ETH | Accepted in full at 0.013875 ETH/GVRA |
| Sell-out bid (11.75 ETH) | 11.5 ETH accepted at 0.0125; `SurplusRefunded` 0.25 ETH in the same transaction; status Sold out |
| +20 min, finalize, claim | Finalized at 0.0125 ETH/GVRA; 1,000 GVRA sold and claimed (80 from the 1 ETH bid, above its 72 GVRA minimum quote); 0 burned |
| Issuer withdrawal (12.5 ETH) | Done from the issuer account; the student confirmed the ETH in MetaMask |

Things the run surfaced (no defects):
- An earlier seeded auction showed "Sold out" while the student was still setting up. The 8 ETH of
  seeded bids could buy the whole supply once the price reached 0.008 (minute 16), so time alone cleared
  it. This is the intended behaviour, fixed in F2.
- Usability notes for possible polish: the *Sell-out* chip was hard to spot; adding GVRA to MetaMask
  needed manual *Import tokens*; and dark mode follows the OS setting with no toggle.

## 2026-10-22 - UX polish from the MetaMask run

| Change | Why | Browser check (headless Chrome, mock wallet forwarding reads to the local node) |
| --- | --- | --- |
| Theme toggle in the header: Auto / Light / Dark, remembered in `localStorage`, applied before the first paint | Dark mode only followed the OS, so it could not be shown on demand | Auto → Light → Dark → Auto; the body background switched to the dark tokens; the choice survived a reload and was cleared on returning to Auto |
| *Add GVRA to your wallet* (`wallet_watchAsset`) under *Your position* | The student had to import the token by hand with its address | One request with `ERC20`, `GVRA`, 18 decimals and the deployed token address; the button then shows the added state |
| *Sell-out amount* chip, styled apart from the quick amounts | The student could not find the old *Sell-out* chip | Accent styling confirmed; clicking it fills the amount and shows the sell-out callout |
| "1 bidder" (was "1 bidders"); an exact sell-out no longer says "0 ETH comes straight back" | Spotted in the check screenshots | Re-checked after the fix |

## 2026-10-22 - Patterns from established Dutch auction platforms

The student asked for DutchPoint's design to follow well-known Dutch auction sites. The agent researched
Art Blocks (Dutch auction with settlement: the same uniform-price-with-refund rule), Sushi MISO (a token
launchpad with Dutch auctions), Gnosis Auction (sealed batch auction with one clearing price), Fjord
Foundry (liquidity bootstrapping pools) and CoinList's 2019 Algorand sale. It recommended borrowing their
UX patterns rather than copying their visual design, because of copyright, because the rubric marks the
team's own UX, and because most of those platforms run different mechanisms. Of five proposals it built
four and advised against a MISO-style "minimum tokens" input, which would add rounding questions for
little gain. It also found that one proposal, Etherscan links on bids, already existed but was easy to
miss.

| Change | Browser check (headless Chrome, mock wallet, focus emulation for the clipboard) |
| --- | --- |
| *Sale details* card: network, token, token, auction and issuer addresses (copy button, explorer link on public networks), sale window; placed under *Bids* to balance the columns | Rows, three copy buttons and the window correct; *Copy* put the full auction address on the clipboard; local chain shows no explorer links and a redeploy note; with a temporary Sepolia explorer, all three addresses link to sepolia.etherscan.io |
| Bid times link to the transaction (↗) with a hint line, on networks with an explorer | Local: no link or hint. Temporary explorer: link matches `https://sepolia.etherscan.io/tx/0x…` |
| *Share of supply* in *Your position* | Shown as a percentage beside the allocation ("at least" before finalization) |
| *Questions*: six collapsible answers (quote vs. final price, no sell-out, overpaying, claiming, proceeds, test money) | Six collapsed items; clicking a question opens it |
| Layout | No horizontal scroll at 390 px |

## 2026-10-23 - Sepolia deployment and first testnet run

The student deployed from their own machine. The key was generated locally, imported into MetaMask and
stored in the encrypted Hardhat keystore; the agent never saw it. The auction was deployed unstarted and
run from the live GitHub Pages site. The agent verified each stage from Sepolia over RPC.

| Stage | Transaction | Checked on-chain |
| --- | --- | --- |
| Deploy token, auction; fund | [token](https://sepolia.etherscan.io/tx/0x7ff92a3fbc66ea280f04bd8e610b6501116571dfb3861c7f0a9820e6ff4f5d9e), [auction](https://sepolia.etherscan.io/tx/0xab077a62ce7854e6735ffebaab0407c2916a07b5ff2622b1c394edcfbf4b6496), [fund](https://sepolia.etherscan.io/tx/0x2fe0a241b7d29d0951945fbd762848410475172ec928739a7393b48fd479de74) | Auction holds 1,000 GVRA; owner is the issuer; status Pending |
| Start (from the site) | [0x191b4045…](https://sepolia.etherscan.io/tx/0x191b404550c411cca0ed98d8632d44491264117e92d6ce4de4dde57c6529c7d3) | `AuctionStarted` |
| Bids | [0.01 ETH at 0.0000968](https://sepolia.etherscan.io/tx/0x5be76690b28dd658e23b2522155e935f56d794c29e200ba1146f156d65e2c85a), [0.005 ETH at 0.0000584](https://sepolia.etherscan.io/tx/0xc6bccbff49828febc70b37cf434ec1e38fdc6dbfb4f2c7c854c1a97b17e89131) | 0.015 ETH committed; not enough to sell out |
| Finalize | [0x6f6f2b25…](https://sepolia.etherscan.io/tx/0x6f6f2b258ee65412ce38361d1ba3ecf076a4b67c656ad4f31021fc5c41c211c4) | Final price = reserve 0.00002; 750 sold; `TokensBurned` 250; GVRA total supply 750 |
| Claim | [0xf1d4c0b8…](https://sepolia.etherscan.io/tx/0xf1d4c0b8c15f0b26923c40de0a6e8bedcfd28098b0000943a8078d35860f8b39) | 750 GVRA, so both bids paid 0.00002 |
| Issuer withdrawal | [0xcb853f26…](https://sepolia.etherscan.io/tx/0xcb853f26d6a35a4400c3f212c124ce7da379396d308288d19c02d26574b698ea) | 0.015 ETH out; auction ETH 0; refund liability 0 |

Observations:
- **Deployment gas:** about 0.016 ETH, far above the agent's estimate, which assumed local-chain gas
  amounts and the current fee. The token and auction deployments used about 3.7M and 12.6M gas on
  Sepolia, against about 0.6M and 1.8M on the local Hardhat chain (evidence 09). The gas-scaling
  evidence measures relative cost on the local chain; absolute costs differ between networks.
- **EIP-7702 smart account:** MetaMask converted the issuer account into a smart account during the
  run. The issuer's code is now a 7702 delegation to `0x63c0c19a…`. The first transaction, the upgrade
  bundled with *Start*, failed and cost about 0.0005 ETH. MetaMask's retry succeeded. MetaMask then routed
  *Start* and *Claim* through its helper contract `0xdb9B1e94…7dB3`, while the bids and *Finalize* went
  directly. Every DutchPoint action worked in both modes. `onlyOwner` held because the delegated EOA,
  not the helper, was `msg.sender`. That makes this a real-world check that the contract and UI work
  with smart-account wallets.
