# DutchPoint

[![CI](https://github.com/JacksonSeowJX/Blockchain-DutchPoint/actions/workflows/ci.yml/badge.svg)](https://github.com/JacksonSeowJX/Blockchain-DutchPoint/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/JacksonSeowJX/Blockchain-DutchPoint/actions/workflows/pages.yml/badge.svg)](https://github.com/JacksonSeowJX/Blockchain-DutchPoint/actions/workflows/pages.yml)

**DutchPoint: A Decentralized Dutch Auction Platform** - *Falling prices. One clearing price.*

DutchPoint launches the **Gavora (GVRA)** ERC20 token through a 20-minute uniform-price Dutch auction on
Ethereum. Connect your wallet to DutchPoint and bid for Gavora tokens using ETH:

- the price falls in a straight line from a high start price to a reserve price over exactly 20 minutes;
- bidders commit ETH whenever the price looks fair, and as the price keeps falling the same ETH buys more GVRA;
- the moment committed ETH can buy the whole supply, the auction sells out. The bid that crosses the
  line only buys what is left, and its surplus ETH is refunded in the same transaction;
- every winner pays the **same clearing price**, however early they bid;
- if the window ends first, everyone pays the reserve price and unsold GVRA is **burned**.

SC4053 Blockchain Technology, AY2026-27 Semester 1 - Development Project, Option 2.

**Live site:** <https://jacksonseowjx.github.io/Blockchain-DutchPoint/> (built for Sepolia). It becomes
interactive once the contracts are deployed to Sepolia; until then it shows a "not deployed on Sepolia yet"
card. To use the full auction now, follow the [local quick start](#quick-start-local).

![DutchPoint dashboard](docs/demo/screenshots/01-live-auction.png)

## Quick start (local)

Everything runs on your machine: a local Hardhat chain, the two contracts and the React dashboard. You
don't need testnet ETH, API keys or a `.env` file.

**Requirements**

- **Node.js 22.13.0 or later**, with npm. Hardhat 3.18 refuses to start on older versions; CI uses
  Node 24. Check with `node --version`.
- **MetaMask** (or another browser wallet) in a desktop browser.
- **macOS, Linux or WSL.** The npm scripts use POSIX shell syntax (`mkdir -p`, `HOME=...`), so on
  Windows run them inside WSL.
- Ports **8545** (local chain) and **5173** (dashboard) free, and internet access for the first install
  (npm packages, plus the Solidity 0.8.28 compiler that Hardhat downloads on first use).

### 1. Get the code

```bash
git clone https://github.com/JacksonSeowJX/Blockchain-DutchPoint.git
cd Blockchain-DutchPoint
```

Or unzip the submitted archive and `cd` into the folder that contains `package.json`.

### 2. Install

```bash
npm ci    # exact versions from package-lock.json; replaces any existing node_modules
```

One install at the root covers the contracts, tests, scripts and frontend, and every command below runs
from the root. `npm install` also works.

### 3. Start the chain, deploy and open the dashboard

```bash
npm run node            # terminal 1: local chain on 127.0.0.1:8545, mines a block every 2 s; keep it running
npm run deploy:local    # terminal 2: deploys GavoraToken + DutchAuction and starts the auction
npm run dev             # terminal 2: http://127.0.0.1:5173
```

`npm run node` prints 20 test accounts, each with 10,000 ETH, and their private keys. Account #0 deploys
the contracts and is the **issuer**.

The 20-minute window starts as soon as `deploy:local` finishes. For a fresh auction at any time, run
`npm run deploy:local` again while the node is running, then reload the page.

The default sale is 1,000 GVRA, with the price falling from 0.02 to 0.005 ETH per GVRA. Override it with
`SALE_SUPPLY`, `START_PRICE` or `RESERVE_PRICE`, for example `START_PRICE=0.05 npm run deploy:local`.
`START_AUCTION=false` deploys without starting, so the issuer can start the 20-minute window from the
dashboard.

Optional: `npm run seed:local` places three bids from accounts #1-#3 (Alice, Bob and Carol), so the
dashboard has history. It also moves the chain clock forward 7 minutes.

### 4. Connect MetaMask

1. **Add the network.** Open the dashboard and click *Connect wallet*. If MetaMask is on another network,
   a banner offers *Switch to Hardhat Local*: click it and approve adding the network. To add it by hand
   instead, use network name `Hardhat Local`, RPC URL `http://127.0.0.1:8545`, chain ID `31337` and
   currency symbol `ETH`.
2. **Import a test account.** Use MetaMask's *Import account* option and paste a private key printed by
   `npm run node`. Bid from account #4 or later, since #0 is the issuer and #1-#3 are used by
   `seed:local`. Import #0 as well to try the issuer actions. These keys are public test keys: never use
   them on a real network.
3. **After restarting the node**, the chain starts empty. Run `npm run deploy:local` again, and in
   MetaMask use *Settings → Advanced → Clear activity tab data* so nonces reset.

### 5. Run an auction from start to finish

1. The dashboard shows the live auction even before you connect: the falling price, the 20-minute
   countdown, the price chart and the demand meter.
2. As a bidder, enter an ETH amount (or click a quick amount) and click *Bid … ETH*. The quote shows the
   least GVRA you will receive: the final price can only be at or below the current price, so the
   allocation can only grow.
3. To sell out the auction, click *Sell-out amount* (it fills in the ETH that buys everything left) and
   add a little more. The callout shows how much comes straight back in the same transaction. Once the bid is mined, the status changes to *Sold out*.
4. In the *Local demo tools* card, click **+20 min**. The status becomes *Ready to finalize*.
5. Click *Finalize auction*, then *Claim …* under *Your position*. The GVRA arrives in your wallet;
   *Add GVRA to your wallet* lists the token in MetaMask without typing its address.
6. Switch MetaMask to account #0 (the issuer) and click *Withdraw … proceeds* under *Settlement*.

**Skipping time:** the *Local demo tools* card (shown only on the local chain) moves the chain clock
forward 1, 5, 10 or 20 minutes, so a demo doesn't wait 20 real minutes. The command-line equivalent is
`ADVANCE_SECONDS=600 npm run time:advance` (300 seconds if `ADVANCE_SECONDS` is not set).

**Light and dark:** the theme button in the header cycles *Auto* (follows your operating system),
*Light* and *Dark*, and the browser remembers the choice.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Can't reach the local Hardhat node at 127.0.0.1:8545" | Start `npm run node` and keep that terminal open |
| "No auction on the local chain yet" or "No DutchPoint auction is deployed on the local node" | Run `npm run deploy:local` (again after every node restart), then reload the page |
| MetaMask transactions fail with nonce errors after a node restart | *Settings → Advanced → Clear activity tab data* |
| Port 5173 is already in use | Vite picks the next free port and prints the URL |
| "You are using Node.js … which is not supported by Hardhat" | Install Node.js 22.13.0 or later |

## Deterministic demo

```bash
npm run demo
```

It runs five scenarios on an in-process chain and prints the results:
1. a sale that clears early, with the crossing bid's surplus refunded automatically;
2. an undersubscribed sale settling at reserve, with unsold GVRA burned;
3. a contract bidder that rejects ETH and keeps its refund as a withdrawable credit;
4. a reentrancy attack draining a deliberately vulnerable auction;
5. the same attack failing against DutchPoint.

It needs no node, wallet or browser. The narrated video plan is in
[`docs/demo/demo-script.md`](docs/demo/demo-script.md).

## Testing and security

| Command | What it runs |
| --- | --- |
| `npm test` | All 53 tests: 46 Mocha tests, plus 3 Solidity fuzz tests (1,000 runs each) and 4 invariants (256 runs, depth 50) |
| `npm run test:mocha` / `npm run test:solidity` | Only the Mocha tests, or only the Solidity fuzz and invariant tests |
| `npm run gas` | Gas-scaling table (each call costs the same with 1 or 100 earlier bidders) and per-function gas statistics |
| `npm run coverage` | All tests, with coverage - `DutchAuction.sol` and `GavoraToken.sol` are at 100% lines and statements |
| `npm run slither` | Slither static analysis; fails on any Medium or High finding (needs `slither-analyzer` and `solc` 0.8.28) |
| `npm run typecheck` / `npm run build` | Frontend and script type checks; production build |
| `npm run check` | `compile`, `test`, `typecheck` and `build` in one go |

Install Slither the way CI does (Python 3.12), then select the compiler:

```bash
pip install slither-analyzer==0.11.6 solc-select
# or: uv tool install --python 3.12 slither-analyzer==0.11.6 && uv tool install solc-select
solc-select install 0.8.28 && solc-select use 0.8.28
```

CI (`.github/workflows/ci.yml`) runs `compile`, `coverage`, `typecheck`, `build`, `demo` and `slither` on
every push to `main` and on every pull request.

## Optional: Sepolia testnet

You don't need this for testing or the demo. A public deployment adds Etherscan links as evidence and
makes the live site interactive.

```bash
npm run keystore -- set SEPOLIA_RPC_URL        # e.g. an Alchemy/Infura Sepolia URL
npm run keystore -- set SEPOLIA_PRIVATE_KEY    # a throwaway wallet holding Sepolia test ETH
npm run keystore -- set ETHERSCAN_API_KEY      # only for source verification
npm run deploy:sepolia
```

Instead of the keystore, you can export the same names as environment variables in your shell.

The script prints Etherscan links and the `npm run verify:sepolia -- …` commands for both contracts, and
records addresses and transaction hashes in `deployments/sepolia.json`. It also writes the addresses to
`frontend/src/generated/deployments.json`; commit that file and push to `main` to put the auction on the
[live site](#live-site-github-pages). To have a local frontend default to Sepolia, copy `.env.example`
to `.env` and set `VITE_DEFAULT_CHAIN_ID=11155111` (and optionally `VITE_READ_RPC_URL`). The
`START_AUCTION=false` option works here too.

## Live site (GitHub Pages)

**<https://jacksonseowjx.github.io/Blockchain-DutchPoint/>**

The site is live. `.github/workflows/pages.yml` builds the frontend and publishes it on every push to
`main` (or by hand from the Actions tab).

- **What it shows today:** nothing is deployed to Sepolia yet, so the site shows a "DutchPoint isn't
  deployed on Sepolia yet" card that links back to the [local quick start](#quick-start-local).
- **Making it interactive:** run `npm run deploy:sepolia`, commit the updated
  `frontend/src/generated/deployments.json` and push to `main`. The next Pages build bundles the addresses.
- **Build settings:** the hosted build is served from the `/Blockchain-DutchPoint/` sub-path, defaults to
  Sepolia, and reads chain data through the `VITE_READ_RPC_URL` repository variable, or the keyless
  PublicNode Sepolia RPC if the variable is not set. Everything in the build is public JavaScript, so
  `VITE_READ_RPC_URL` must be a keyless (or domain-restricted) RPC URL, never a secret. Set it under
  *Settings → Secrets and variables → Actions → Variables*.
- **Repository setting (already done):** *Settings → Pages → Build and deployment → Source: GitHub
  Actions*. A fork or a copy of this repository needs the same one-time setting, or the Pages workflow
  fails at its `configure-pages` step; CI is unaffected.
- GitHub's free plans only offer Pages for **public** repositories. If this repository is made private,
  the site needs a paid plan (Pro, Team or Enterprise).

To preview the hosted build locally:

```bash
VITE_DEFAULT_CHAIN_ID=11155111 npm run build -- --base /Blockchain-DutchPoint/
npx vite preview frontend --base /Blockchain-DutchPoint/ --port 4173   # http://127.0.0.1:4173/Blockchain-DutchPoint/
```

## All commands

Every script in `package.json`, run from the repository root.

| Command | What it does |
| --- | --- |
| **Local app** | |
| `npm run node` | Local Hardhat chain on `127.0.0.1:8545`, mining a block every 2 s |
| `npm run deploy:local` | Deploy and start the auction locally; write ABIs and addresses for the frontend |
| `npm run seed:local` | Three sample bids from test accounts #1-#3 |
| `npm run time:advance` | Move the local chain clock forward `ADVANCE_SECONDS` (default 300) |
| `npm run dev` | Dashboard dev server on `http://127.0.0.1:5173` |
| **Build** | |
| `npm run compile` | Compile the contracts (Solidity 0.8.28) |
| `npm run typecheck` | Type-check the frontend, `hardhat.config.ts`, `scripts/` and `test/` |
| `npm run build` | Type-check and build the frontend into `frontend/dist/` |
| `npm run export:frontend` | Compile and copy the ABIs into `frontend/src/generated/` without deploying |
| `npm run check` | `compile`, `test`, `typecheck` and `build` in sequence |
| **Tests and analysis** | |
| `npm test` | All 53 tests (Mocha, fuzz and invariants) |
| `npm run test:mocha` | The 46 Mocha tests |
| `npm run test:solidity` | The 3 fuzz tests and 4 invariants |
| `npm run coverage` | All tests with a coverage report (`coverage/`) |
| `npm run gas` | Mocha tests with the gas-scaling table and per-function gas statistics |
| `npm run slither` | Slither on both contracts |
| `npm run demo` | The five deterministic scenarios |
| **Submission** | |
| `npm run package` | Build `DutchPoint.zip` from the last commit: tracked files plus the full git history (cited as evidence in the AI Audit Report), without `node_modules` or build output. Refuses to run with uncommitted changes |
| **Sepolia (optional)** | |
| `npm run keystore -- set <NAME>` | Store a secret in the Hardhat keystore |
| `npm run deploy:sepolia` | Deploy, fund and start the auction on Sepolia |
| `npm run verify:sepolia -- <address> <constructor args>` | Verify a contract on Etherscan (the deploy script prints the exact commands) |

## Project structure

```text
contracts/                   On-chain code
  GavoraToken.sol            ERC20 "Gavora" (GVRA): fixed supply, burnable, no owner, no mint
  DutchAuction.sol           The auction engine
  mocks/                     Test-only: ReentrancyAttacker, RejectingReceiver,
                             VulnerableAuction (deliberately vulnerable)
test/
  DutchAuction.test.ts       Scenario and unit tests
  AuditRegressions.test.ts   Regression tests for audit findings F1-F4
  Reentrancy.test.ts         Vulnerable vs. secure reentrancy demonstration
  GavoraToken.test.ts        Token tests
  Gas.test.ts                Gas-scaling test (cost independent of the number of bidders)
  solidity/                  Fuzz and invariant tests (forge-std)
scripts/                     deploy, demo, seed-local, advance-time, poc-crowd-out, export-frontend
frontend/                    Off-chain code: the React + Vite dApp
  index.html, vite.config.ts
  src/                       components/, hooks/, lib/, generated/ (ABIs and addresses)
docs/
  ai-audit/                  AI Audit Report, development log, evidence/, prompts/
  design/                    Spec, architecture, assumptions, requirements checklist
  demo/                      Demo script, screenshots/
.github/workflows/           ci.yml (tests, build, Slither) and pages.yml (GitHub Pages)
hardhat.config.ts            Solidity 0.8.28, networks (local node, Sepolia), fuzz/invariant settings
slither.config.json          Slither remappings and filters
.env.example                 Optional frontend settings; Sepolia secrets go in the keystore
```

Generated and gitignored: `artifacts/`, `cache/`, `coverage/`, `frontend/dist/`,
`frontend/src/generated/deployments.local.json` and `.hardhat-home/` (every Hardhat script runs with
`HOME` set to it). `deployments/` is created by `npm run deploy:sepolia`.

## How the contracts work

- **`GavoraToken`** mints its whole supply once to the deployer, who transfers the sale supply into the
  auction. There is no mint function and no owner, so the supply can only go down (by burning).
- **`DutchAuction`**:
  - `start()` (issuer only) opens the 20-minute window.
  - `contribute()` / plain ETH transfers place bids.
  - `finalize()` (anyone, after the window) fixes the price and burns unsold GVRA.
  - `claimTokens()` pays each bidder `commitment / finalPrice` GVRA.
  - `withdrawRefundTo()` is a fallback for refunds a bidder contract rejected.
  - `withdrawIssuerProceeds()` (issuer only) withdraws the sale revenue.
  - `burnRemainderAfterAllClaimed()` burns rounding dust.
- There are no loops over bidders. Refunds follow checks-effects-interactions behind `ReentrancyGuard`.
- The maths, including the exact clearing price when time alone clears the auction, is in
  [`docs/design/spec.md`](docs/design/spec.md).

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/ai-audit/report.md`](docs/ai-audit/report.md) | **AI Audit Report** (8 sections, findings F1-F6 with evidence, and an appendix linking the design to the lectures) |
| [`docs/ai-audit/evidence/`](docs/ai-audit/evidence/) | Evidence 01-10: before/after regression runs, crowd-out PoC, reentrancy demo, mutation check, test suite and coverage, Slither, gas scaling, dependency audit |
| [`docs/ai-audit/prompts/`](docs/ai-audit/prompts/README.md) | Prompt logs for ChatGPT, Codex and Claude Code |
| [`docs/ai-audit/development-log.md`](docs/ai-audit/development-log.md) | Chronological AI development log |
| [`docs/design/spec.md`](docs/design/spec.md) | Requirements and auction mathematics |
| [`docs/design/architecture.md`](docs/design/architecture.md) | Contract, frontend, hosting and test architecture |
| [`docs/design/assumptions.md`](docs/design/assumptions.md) | Interpretations of ambiguous requirements and questions for the TA |
| [`docs/design/requirements-checklist.md`](docs/design/requirements-checklist.md) | Requirement → implementation → test |
| [`docs/demo/demo-script.md`](docs/demo/demo-script.md) | Under-10-minute demo plan |

## Team

**TODO (team):** names, matriculation numbers and responsibilities.
