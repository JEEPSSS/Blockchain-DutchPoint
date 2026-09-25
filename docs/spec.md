# FairLaunch Specification

FairLaunch is an educational Ethereum token launch dApp for SC4053 Blockchain Technology, Option 2: Dutch Auction. The primary source is `project.pdf`; `Document.pdf` and `Document 2.pdf` add submission logistics but do not change the Option 2 functional requirements.

## Source Hierarchy

1. Primary brief: `project.pdf`, especially Option 2 on pages 5-6 and the AI Audit requirements on pages 1-2.
2. Companion logistics: `Document.pdf` and `Document 2.pdf`, which confirm a complete codebase, README, local deployment, and a demo video of 10 minutes or less.
3. Lecture support: Module 3 Ethereum lectures for account, transaction, gas, and contract execution mental models; DeFi lectures for auction, gas-war, MEV, and burn framing.
4. Current official tool docs checked on 2026-09-25:
   - Hardhat 3 Ethers + Mocha toolbox for TypeScript tests.
   - OpenZeppelin Contracts 5 API for ERC20, Ownable, Math, SafeERC20, and `utils/ReentrancyGuard.sol`.
   - ethers v6 `BrowserProvider` for MetaMask.
   - Vite React TypeScript guidance.

## Product Goal

Build one local Ethereum token-launch dApp where users commit ETH during a 1,200 second descending-price auction. Successful participants pay one final clearing price, claim ERC20 tokens, and withdraw any surplus ETH safely. Unsold tokens are burned. The project is intentionally small enough for two or three students: no factories, no proxies, no cross-chain features, no off-chain backend, and no mainnet deployment requirement.

## Auction Policy

FairLaunch uses an ETH-budget commitment model. A contribution is not a purchase at the submission price. Instead, committed ETH represents a maximum budget. The final token amount and refund are computed from the uniform final price after settlement.

Because the brief has two ambiguities, the first implementation uses these labelled assumptions:

1. Early economic clearing may lock the outcome before 1,200 seconds, but final settlement is only available at the scheduled 1,200 second endpoint.
2. Refund amounts are calculated automatically by the contract, but ETH transfer uses safe user-triggered withdrawal.

These are assumptions for implementation, not TA-approved interpretations.

## Core Requirements Map

| Brief requirement | Planned feature | Verification |
| --- | --- | --- |
| ERC20 project token | `LaunchToken` extends OpenZeppelin ERC20 and mints a fixed supply once | Constructor and supply tests |
| Auction logic separate from token logic | `DutchAuction` owns sale mechanics and receives token inventory | Deployment and interface tests |
| Accept ETH commitments | `contribute()` and `receive()` accept ETH during active auction only | Before-open, active, after-close tests |
| Deterministic descending price | Linear decay from start price to reserve over exactly 1,200 seconds | Start, midpoint, deadline, monotonic tests |
| Reserve price floor | `priceAt()` never returns below reserve | Reserve floor tests |
| Duration exactly 1,200 seconds | `AUCTION_DURATION = 1200` constant | Constant and time manipulation tests |
| Uniform final clearing price | Finalized auction stores one `finalPrice` used for every participant | Uniform pricing tests |
| Threshold-crossing contribution | Full ETH is accepted as budget; surplus becomes refund under pro-rata settlement | Crossing-bid tests |
| Clearing by time without new bid | Finalization computes earliest clearing time from total committed capital | Late finalization tests |
| Token claims | Participants claim tokens after finalization | Claim tests |
| ETH refunds | Refund credits are computed automatically and withdrawn by users | Refund and rejecting receiver tests |
| Burn unsold tokens | Clearly unsold inventory burns at finalization; rounding dust burns after all participants settle | No-contributor, undersubscribed, dust tests |
| Reentrancy resistance | Checks-effects-interactions plus OpenZeppelin `ReentrancyGuard` | Malicious receiver tests |
| Avoid unbounded loops | Settlement, refund, proceeds withdrawal, and burning do not iterate over bidders | Review and tests |
| Local demo | Hardhat local network scripts and Vite frontend | README and demo script |

## Auction Mathematics

All on-chain token amounts use the token's smallest unit. Because `LaunchToken` uses 18 decimals, define:

- `TOKEN_SCALE = 1e18`
- `S = saleSupply` in token units
- `D = 1200 seconds`
- `P0 = startPrice` in wei per whole token
- `Pr = reservePrice` in wei per whole token
- `C = totalCommitted` in wei
- `t = block timestamp`
- `e = min(max(t - startTime, 0), D)`

### Price Decay

The indicative price is a deterministic linear function:

```text
spread = P0 - Pr
priceAt(t) = max(Pr, P0 - floor(spread * e / D))
```

Example with `P0 = 0.020 ETH`, `Pr = 0.005 ETH`, and `D = 1200`:

| Elapsed | Price |
| --- | --- |
| 0 sec | 0.020 ETH |
| 400 sec | 0.015 ETH |
| 800 sec | 0.010 ETH |
| 1200 sec | 0.005 ETH |

### Clearing Condition

At a candidate price `P`, the sale clears when committed ETH can buy the full sale supply:

```text
requiredEth(P) = ceil(S * P / TOKEN_SCALE)
clears when C >= requiredEth(P)
```

Use full-precision multiplication and division on-chain. In Solidity this is OpenZeppelin `Math.mulDiv(..., Math.Rounding.Ceil)`.

### Clearing Caused By Time

If no new bid arrives exactly when the descending price becomes affordable, finalization must still find the earliest economic clearing point. The highest affordable price is:

```text
affordablePrice = floor(C * TOKEN_SCALE / S)
```

If `affordablePrice >= P0`, clearing is immediate. If `affordablePrice < Pr`, the auction does not fully clear and settles at reserve with a partial sale. Otherwise:

```text
dropNeeded = P0 - affordablePrice
elapsedToClear = ceil(dropNeeded * D / (P0 - Pr))
clearingPrice = priceAt(startTime + elapsedToClear)
```

Example: `S = 1000 tokens`, `P0 = 0.020 ETH`, `Pr = 0.005 ETH`, and `C = 10 ETH`.

```text
affordablePrice = 10 ETH / 1000 = 0.010 ETH
elapsedToClear = ceil((0.020 - 0.010) * 1200 / 0.015) = 800 sec
clearingPrice = 0.010 ETH
```

If finalization is mined at 1,200 seconds, the economic result still locks at 800 seconds and 0.010 ETH.

### Contribution Crossing The Threshold

If a contribution makes `C >= requiredEth(currentPrice)`, FairLaunch accepts the full ETH as budget and locks the current price as the clearing price. The excess is not rejected at contribution time; it is credited as refund at settlement. This keeps contribution handling simple and deterministic.

Example: `S = 1000`, current price `P = 0.01125 ETH`, commitments before the crossing bid are Alice `6 ETH` and Bob `4 ETH`. Carol contributes `2 ETH`, so `C = 12 ETH` and the auction clears because `requiredEth = 11.25 ETH`.

Settlement is pro-rata by budget:

```text
Alice provisional tokens = floor(6 / 12 * 1000) = 500
Bob provisional tokens = floor(4 / 12 * 1000) = 333.333...
Carol provisional tokens = floor(2 / 12 * 1000) = 166.666...
acceptedCost = ceil(tokens * 0.01125 ETH)
refund = commitment - acceptedCost
```

All three pay the same final price per token. Alice does not receive a refund merely because the price fell from the price shown when she contributed. Refunds arise from oversubscription and integer rounding.

### Partial Sale At Reserve

If the full sale does not clear by the deadline, the final price is the reserve price. Each participant's token entitlement is:

```text
tokens = floor(commitment * TOKEN_SCALE / Pr)
acceptedCost = ceil(tokens * Pr / TOKEN_SCALE)
refund = commitment - acceptedCost
```

Global tokens sold for burn accounting are:

```text
totalTokensSold = floor(C * TOKEN_SCALE / Pr)
initialUnsoldBurn = S - totalTokensSold
```

### Cleared Sale Allocation

If the auction clears, the sale supply is allocated pro-rata by committed ETH:

```text
tokens = floor(commitment * S / C)
acceptedCost = ceil(tokens * finalPrice / TOKEN_SCALE)
refund = commitment - acceptedCost
```

Any sub-unit token dust caused by per-account flooring remains in the auction contract until all recorded participants settle, then it can be burned safely because no outstanding participant entitlement remains.

### Conservation Properties

For every account:

```text
commitment = acceptedCost + refund
acceptedCost <= commitment
```

For the contract:

```text
tracked ETH = unsettled commitments + refund credits + issuer proceeds not withdrawn
issuer withdrawals <= issuer proceeds accrued from settled accounts
```

The issuer cannot withdraw from the raw ETH balance. This prevents unsolicited ETH from being mistaken for sale proceeds and keeps outstanding refunds solvent.

For tokens:

```text
saleSupply = tokens claimed + tokens still claimable + tokens burned + rounding dust not yet burnable
```

No unclaimed entitlement is burned. Burnable dust becomes known only after every recorded participant has settled.

## Frontend Requirements

The React/Vite frontend will show:

- Wallet connection, account, chain ID, and wrong-network state.
- Token name, symbol, sale supply, and auction status.
- Current indicative price, starting price, reserve price, and final price when known.
- A 20-minute countdown and descending price chart.
- Total ETH committed.
- A contribution form explaining ETH-budget commitments.
- Provisional allocation estimates clearly labelled provisional.
- Permissionless finalization when eligible.
- Settlement receipt: deposited ETH, accepted cost, refund credit, and tokens received.
- Claim, refund, issuer proceeds, burn dust, and finalization controls with transaction states.
- Burned token amount after settlement.
- A compact "How this auction works" section and an early-vs-late uniform price visual.

The frontend must read authoritative state from the contract. The browser countdown and chart are display aids only.

## Non-Goals

- Auction factory or multiple concurrent auctions.
- Upgradeable proxy pattern.
- Mainnet deployment.
- Oracle integration.
- Secondary trading or DEX features.
- Backend indexer or database.
- Cross-chain support.

