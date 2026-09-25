# Requirement-To-Test Checklist

| Requirement | Implementation | Test / Evidence |
| --- | --- | --- |
| ERC20 project token | `LaunchToken.sol` extends OpenZeppelin ERC20 and mints fixed supply once | `settles an undersubscribed sale...`, `handles no contributors...` |
| Auction logic separate from token logic | `DutchAuction.sol` manages sale, `LaunchToken.sol` manages token | Compile and deployment fixtures |
| Accept ETH commitments | `contribute()` and `receive()` | `rejects contributions before opening and after closing`, contribution-heavy tests |
| Deterministic descending price | `priceAt()` linear decay | `uses the required 1,200 second duration...` |
| Reserve floor | `priceAt()` returns reserve after deadline | `is monotonic and never falls below reserve` |
| Exactly 1,200 seconds | `AUCTION_DURATION = 1200` | `uses the required 1,200 second duration...` |
| Uniform final price | `finalPrice` stored once and used for settlement | `applies one uniform final price...` |
| Crossing threshold | Full crossing contribution accepted as budget; surplus refunded | `credits surplus refunds when a contribution crosses...` |
| Time-only clearing | `_syncTimeClearing()` reconstructs earliest valid clearing after latest commitment | `detects clearing caused by time passing...` |
| Settlement delayed until endpoint | `finalize()` only after `startTime + 1200` | `locks clearing before the deadline...` |
| Token claims | `claimTokens()` | Claim tests and demo |
| Safe ETH refunds | `withdrawRefundTo()` pull refunds | `preserves refund credit when a receiver rejects ETH...` |
| No duplicate claims/withdrawals | `settled` and refund-credit accounting | `prevents duplicate claims...` |
| Burn unsold tokens | Burn obvious unsold at finalization and residual dust after all settle | `handles no contributors...`, `settles an undersubscribed sale...`, `handles tiny commitments...` |
| Do not burn owed tokens | Residual burn gated by `settledParticipantCount == participantCount` | `handles tiny commitments...`, `conserves tracked ETH...` |
| Reentrancy resistance | `ReentrancyGuard`, CEI, pull payments | `blocks a malicious receiver...` |
| Avoid unbounded bidder loops | Settlement and burning are per-user or aggregate checks | Code review; no tests rely on participant iteration |
| Reject unauthorized actions | OpenZeppelin `Ownable` | `enforces owner-only start and proceeds withdrawal` |
| No contributors | Finalization burns entire sale inventory | `handles no contributors...` |
| Partial sale at reserve | Deadline settlement at reserve when not cleared | `settles an undersubscribed sale...` |
| Multiple contributions | Commitments aggregate by wallet | `aggregates multiple contributions...` |
| Rounding and dust | Floor token units, ceil accepted ETH, burn residual after all settle | `handles tiny commitments...` |
| Conservation | Tracked ETH and token accounting checks | `conserves tracked ETH...` |
| Frontend wallet and network state | React dashboard with MetaMask and wrong-network UI | `npm run typecheck`, `npm run build` |
| Price chart and countdown | React/SVG display-only chart and timer | `npm run build`; manual demo flow |
| Deployment script | `scripts/deploy-local.ts` | README local deployment instructions |
| Deterministic demo | `scripts/demo.ts` | `npm run demo` |
| AI audit evidence | `docs/ai-development-log.md`, `docs/ai-audit-report.md` | Documentation |

