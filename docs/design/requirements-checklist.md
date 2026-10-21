# Requirement → Implementation → Evidence

| Requirement (brief, Option 2) | Implementation | Evidence |
| --- | --- | --- |
| ERC20 project token | `GavoraToken` (OpenZeppelin ERC20), fixed supply, no mint, no owner | `GavoraToken.test.ts` |
| Auction engine in separate contract(s) | `DutchAuction` holds the sale inventory; `GavoraToken` holds token logic | Deployment fixtures; `scripts/deploy.ts` |
| Bid for tokens using Ether | `contribute()` and plain transfers via `receive()` | `accepts plain ETH transfers…`, bidding tests |
| Descending price via a decay function | `priceAt()`: linear decay on `block.timestamp`, floored at reserve | `decays linearly over exactly 1,200 seconds`, `is monotonic and never falls below reserve`, fuzz `testFuzz_PriceIsMonotonicAndBounded` |
| Exactly 20 minutes | `AUCTION_DURATION = 20 minutes`; bids rejected at `endTime`; finalize only from `endTime` | `rejects contributions… after closing`, `rejects early and repeated finalization` |
| Clears when committed ETH meets supply | Crossing bid clears at the current price; time-based clearing at `ceil(C/S)` | `accepts a crossing bid only up to capacity…`, `finds the exact clearing point…`, fuzz `testFuzz_TimeClearingPriceIsExact` |
| Bid that bridges the threshold | Accepted up to capacity; surplus refunded in the same transaction | Regression F1; `docs/ai-audit/evidence/04` |
| Uniform clearing price | `tokens = commitment / finalPrice` for everyone | `fills earlier bidders in full and charges everyone the same final price`, invariant `invariant_ClaimsUseOneUniformPrice` |
| Excess ETH refunded automatically | Push refund with credit fallback; `withdrawRefundTo` | `credits the surplus when a bidder rejects ETH…`, demo scenario 3 |
| Sell out at/above reserve or burn unsold | `finalize()` burns `S − totalTokensSold`; dust burned after all claims | `burns the full inventory when nobody bids`, `settles an undersubscribed sale…`, `burns rounding dust only after every participant has claimed` |
| Burned permanently from supply | `ERC20Burnable.burn` reduces `totalSupply` | `GVRA totalSupply` checks; invariant `invariant_TokensAreConserved` |
| Token claims | `claimTokens()` once per bidder | `rejects claims before finalization, without a commitment, and twice` |
| Safe ETH handling | Checks-effects-interactions, `ReentrancyGuard`, separate refund/proceeds accounting | Invariant `invariant_EthIsFullyBacked`; `keeps credited refunds solvent…` |
| (Bonus) Reentrancy resistance | As above | `Reentrancy.test.ts`; `docs/ai-audit/evidence/05`; Slither `docs/ai-audit/evidence/08` |
| Access control | `Ownable`: only the issuer can `start` and withdraw proceeds | `only starts once, only by the owner…`, `lets only the owner withdraw…` |
| Frontend | React dashboard: wallet, live price/countdown, chart, bid form, position, settlement, history | `npm run build`; e2e screenshots in `docs/demo/screenshots/` |
| AI Audit Report | `docs/ai-audit/report.md` | Evidence in `docs/ai-audit/evidence/`, prompts in `docs/ai-audit/prompts/` |
| README to deploy and run | `README.md` | Quick start verified on a fresh local node |
| Demo video ≤ 10 minutes | `docs/demo/demo-script.md` | `npm run demo` |
