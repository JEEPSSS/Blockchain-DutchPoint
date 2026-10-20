# Requirement-To-Test Checklist

| Requirement | Implementation | Test / Evidence |
| --- | --- | --- |
| ERC20 project token | `LaunchToken.sol` extends OpenZeppelin ERC20 and mints fixed supply once | `settles an undersubscribed sale...`, `handles no contributors...` |
| Auction logic separate from token logic | `DutchAuction.sol` manages sale, `LaunchToken.sol` manages token | Compile and deployment fixtures |
| Accept ETH commitments | `contribute()` and `receive()` | `rejects contributions before opening and after closing`, contribution-heavy tests |
| Deterministic descending price | `priceAt()` linear decay | `uses the required 1,200 second duration...` |
| Reserve floor | `priceAt()` returns reserve after deadline | `is monotonic and never falls below reserve` |
| Exactly 1,200 seconds | `AUCTION_DURATION = 1200` | `uses the required 1,200 second duration...` |
| Uniform final price | `finalPrice` stored once and used for every claim | `fills earlier bidders in full and charges everyone the same final price` |
| Crossing threshold | Accept remaining capacity only; push surplus or preserve a credit | `accepts a crossing bid only up to capacity...` |
| Time-only clearing | `_timeClearing()` derives exact price and earliest valid time | `finds the exact clearing point...` |
| Settlement delayed until endpoint | `finalize()` only after `startTime + 1200` | `locks clearing before the deadline...` |
| Token claims | `claimTokens()` | Claim tests and demo |
| Safe ETH refunds | Failed automatic refunds become `refundCredits`; `withdrawRefundTo()` redirects them | rejecting receiver and reentrancy tests |
| No duplicate claims/withdrawals | `claimed` and zeroed refund-credit accounting | duplicate claim/refund tests |
| Burn unsold tokens | Burn provably unsold inventory at finalization and residual dust after all claim | no-contributor, undersubscribed, and dust tests |
| Do not burn owed tokens | Residual burn gated by `claimedParticipantCount == participantCount` | dust and conservation tests |
| Reentrancy resistance | `ReentrancyGuard`, CEI, pull payments | `blocks a malicious receiver...` |
| Avoid unbounded bidder loops | Settlement and burning are per-user or aggregate checks | Code review; no tests rely on participant iteration |
| Reject unauthorized actions | OpenZeppelin `Ownable` | `enforces owner-only start and proceeds withdrawal` |
| No contributors | Finalization burns entire sale inventory | `handles no contributors...` |
| Partial sale at reserve | Deadline settlement at reserve when not cleared | `settles an undersubscribed sale...` |
| Multiple contributions | Commitments aggregate by wallet | `aggregates multiple contributions...` |
| Rounding and dust | Floor token units; cap accepted ETH; burn residual after all claim | edge-case and invariant tests |
| Conservation | ETH solvency and token conservation invariants | Solidity invariant suite and lifecycle test |
| Frontend wallet and network state | React dashboard with MetaMask and wrong-network UI | `npm run typecheck`, `npm run build` |
| Price chart and countdown | React/SVG display-only chart and timer | `npm run build`; manual demo flow |
| Deployment script | `scripts/deploy-local.ts` | README local deployment instructions |
| Deterministic demo | `scripts/demo.ts` | `npm run demo` |
| AI audit evidence | `docs/ai-development-log.md`, `docs/ai-audit-report.md` | Documentation |

