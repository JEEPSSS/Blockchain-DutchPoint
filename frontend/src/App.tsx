import { Contract, ContractTransactionResponse, JsonRpcProvider, Provider } from "ethers";
import { useCallback, useMemo, useState } from "react";

import { BidHistory } from "./components/BidHistory";
import { BidPanel } from "./components/BidPanel";
import { DemandMeter } from "./components/DemandMeter";
import { DevTools } from "./components/DevTools";
import { Header } from "./components/Header";
import { HowItWorks } from "./components/HowItWorks";
import { NotDeployed } from "./components/NotDeployed";
import { PositionPanel } from "./components/PositionPanel";
import { PriceChart } from "./components/PriceChart";
import { SettlementPanel } from "./components/SettlementPanel";
import { useAuction } from "./hooks/useAuction";
import { useNow } from "./hooks/useNow";
import { useTheme } from "./hooks/useTheme";
import { useWallet } from "./hooks/useWallet";
import { STATUS_LABELS, Status, viewAt } from "./lib/auctionMath";
import {
  LOCAL_CHAIN_ID,
  auctionAbi,
  chainName,
  defaultChainId,
  deployedChainIds,
  deploymentFor,
  readRpcUrl
} from "./lib/contracts";
import { describeError } from "./lib/errors";
import { formatEth, formatPrice, formatToken, secondsToClock } from "./lib/format";

type TxState =
  | { stage: "idle" }
  | { stage: "wallet"; label: string }
  | { stage: "mining"; label: string; hash: string }
  | { stage: "done"; label: string; hash: string }
  | { stage: "failed"; label: string; message: string };

export default function App() {
  const wallet = useWallet();
  const theme = useTheme();
  const now = useNow();
  const [tx, setTx] = useState<TxState>({ stage: "idle" });

  // Read through the wallet when it is on a chain with a deployment; otherwise fall back to a
  // read-only RPC so the auction is visible before anyone connects.
  const readOnlyProvider = useMemo(
    () => (readRpcUrl ? new JsonRpcProvider(readRpcUrl, defaultChainId, { staticNetwork: true }) : null),
    []
  );
  const walletDeployment = deploymentFor(wallet.chainId);
  const usingWallet = wallet.provider !== null && walletDeployment !== null;
  const provider: Provider | null = usingWallet ? wallet.provider : readOnlyProvider;
  const deployment = usingWallet ? walletDeployment : deploymentFor(defaultChainId);
  const account = usingWallet ? wallet.account : null;

  const { snapshot, bids, error, offline, refresh } = useAuction(provider, deployment, account);

  // Extrapolate the chain clock between blocks so the countdown and price move every second.
  const chainNow = snapshot
    ? snapshot.blockTimestamp + BigInt(Math.max(0, Math.floor((now - snapshot.loadedAt) / 1000)))
    : 0n;
  const view = snapshot ? viewAt(snapshot, chainNow) : null;

  // A wallet on a chain without a deployment is offered the default chain if it has one,
  // otherwise any chain that does; with no deployment anywhere there is nothing to switch to.
  const switchTarget = deploymentFor(defaultChainId) ? defaultChainId : (deployedChainIds[0] ?? null);
  const wrongNetwork =
    wallet.account !== null && walletDeployment === null && switchTarget !== null ? chainName(switchTarget) : null;
  const switchNetwork = () => {
    if (switchTarget !== null) {
      void wallet.switchChain(switchTarget);
    }
  };
  const canTransact = usingWallet && wallet.account !== null;
  const isOwner =
    snapshot !== null && account !== null && snapshot.owner.toLowerCase() === account.toLowerCase();
  const busy = tx.stage === "wallet" || tx.stage === "mining";

  const run = useCallback(
    async (label: string, action: (auction: Contract) => Promise<ContractTransactionResponse>) => {
      if (!wallet.provider || !deployment) {
        return;
      }
      setTx({ stage: "wallet", label });
      try {
        const signer = await wallet.provider.getSigner();
        const auction = new Contract(deployment.auction, auctionAbi, signer);
        const response = await action(auction);
        setTx({ stage: "mining", label, hash: response.hash });
        await response.wait();
        setTx({ stage: "done", label, hash: response.hash });
        await refresh();
      } catch (err) {
        setTx({ stage: "failed", label, message: describeError(err) });
      }
    },
    [wallet.provider, deployment, refresh]
  );

  const txLink = (hash: string) =>
    deployment?.explorer ? (
      <a href={`${deployment.explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
        View transaction
      </a>
    ) : (
      <code title={hash}>{hash.slice(0, 10)}…</code>
    );

  return (
    <div className="app">
      <Header
        wallet={wallet}
        supported={walletDeployment !== null}
        theme={theme.theme}
        onCycleTheme={theme.cycle}
      />

      <main className="shell">
        {/* Without a deployment, the NotDeployed card below offers the switch instead. */}
        {wrongNetwork && deployment && (
          <div className="notice warning" role="status">
            DutchPoint isn't deployed on {chainName(wallet.chainId!)}.
            <button className="btn small" onClick={switchNetwork}>
              Switch to {wrongNetwork}
            </button>
          </div>
        )}
        {wallet.error && <div className="notice error">{wallet.error}</div>}
        {error && (
          <div className={`notice ${offline ? "warning" : "error"}`} role="status">
            {error}
          </div>
        )}
        {tx.stage !== "idle" && (
          <div className={`notice ${tx.stage === "failed" ? "error" : tx.stage === "done" ? "success" : "info"}`} role="status">
            {tx.stage === "wallet" && <>{tx.label}: confirm in your wallet…</>}
            {tx.stage === "mining" && <>{tx.label}: waiting for the block… {txLink(tx.hash)}</>}
            {tx.stage === "done" && <>{tx.label}: confirmed. {txLink(tx.hash)}</>}
            {tx.stage === "failed" && <>{tx.label} failed: {tx.message}</>}
            {(tx.stage === "done" || tx.stage === "failed") && (
              <button className="btn small ghost" onClick={() => setTx({ stage: "idle" })} aria-label="Dismiss">
                Dismiss
              </button>
            )}
          </div>
        )}

        <section className="hero">
          <div>
            <p className="eyebrow">DutchPoint token launch · Dutch auction</p>
            <h1>
              {snapshot?.tokenName ?? "Gavora"} <span>({snapshot?.tokenSymbol ?? "GVRA"})</span>
            </h1>
            <p className="lede">
              Connect your wallet to DutchPoint and bid for Gavora tokens using ETH. The price falls for 20
              minutes; once bids cover the supply, everyone pays the same clearing price.
            </p>
          </div>
          {view && (
            <div className="countdown" aria-live="polite">
              <span className={`status-pill s${view.status}`}>{STATUS_LABELS[view.status]}</span>
              <strong>
                {view.status === Status.Active || view.status === Status.Cleared
                  ? secondsToClock(view.remainingSeconds)
                  : view.status === Status.Pending
                    ? "20:00"
                    : "00:00"}
              </strong>
              <span className="muted">
                {view.status === Status.Pending
                  ? "bidding window"
                  : view.status === Status.Active
                    ? "left to bid"
                    : view.status === Status.Cleared
                      ? "until claims open"
                      : "window closed"}
              </span>
            </div>
          )}
        </section>

        {!deployment && (
          <NotDeployed
            chainId={defaultChainId}
            liveOn={switchTarget}
            connected={wallet.account !== null}
            connecting={wallet.connecting}
            onConnect={() => void wallet.connect()}
            onSwitchNetwork={switchNetwork}
          />
        )}

        {snapshot && view && (
          <>
            <section className="stats" aria-label="Auction summary">
              <div className="stat">
                <span>{view.clearing.cleared || view.status === Status.Finalized ? "Clearing price" : "Current price"}</span>
                <strong>{formatPrice(view.price)}</strong>
                <small>per GVRA</small>
              </div>
              <div className="stat">
                <span>Total committed</span>
                <strong>{formatEth(snapshot.totalCommitted)}</strong>
                <small>
                  {snapshot.participantCount.toString()} {snapshot.participantCount === 1n ? "bidder" : "bidders"}
                </small>
              </div>
              <div className="stat">
                <span>For sale</span>
                <strong>{formatToken(snapshot.saleSupply, snapshot.tokenSymbol, 0)}</strong>
                <small>fixed supply</small>
              </div>
              <div className="stat">
                <span>Price range</span>
                <strong>{formatPrice(snapshot.startPrice)}</strong>
                <small>down to {formatPrice(snapshot.reservePrice)} reserve</small>
              </div>
            </section>

            <div className="layout">
              <div className="column">
                <section className="card">
                  <h2>Price</h2>
                  <PriceChart state={snapshot} view={view} />
                  <DemandMeter view={view} totalCommitted={snapshot.totalCommitted} />
                </section>
                <section className="card">
                  <h2>Bids</h2>
                  <BidHistory
                    bids={bids}
                    saleSupply={snapshot.saleSupply}
                    startTime={snapshot.startTime}
                    account={account}
                    explorer={deployment?.explorer ?? null}
                  />
                </section>
              </div>

              <aside className="column">
                <BidPanel
                  view={view}
                  position={snapshot.position}
                  connected={wallet.account !== null}
                  wrongNetwork={wrongNetwork}
                  busy={busy}
                  onConnect={() => void wallet.connect()}
                  onSwitchNetwork={switchNetwork}
                  onBid={(amount) => void run("Bid", (auction) => auction.contribute({ value: amount }))}
                />
                {snapshot.position && (
                  <PositionPanel
                    view={view}
                    position={snapshot.position}
                    finalPrice={snapshot.finalPrice}
                    busy={busy}
                    onClaim={() => void run("Claim GVRA", (auction) => auction.claimTokens())}
                    onWithdrawRefund={() =>
                      void run("Withdraw refund", (auction) => auction.withdrawRefundTo(account!))
                    }
                    onAddToken={() => wallet.watchToken(deployment!.token, "GVRA", 18)}
                  />
                )}
                <SettlementPanel
                  snapshot={snapshot}
                  view={view}
                  isOwner={isOwner}
                  canTransact={canTransact}
                  busy={busy}
                  onStart={() => void run("Start auction", (auction) => auction.start())}
                  onFinalize={() => void run("Finalize", (auction) => auction.finalize())}
                  onBurnDust={() => void run("Burn dust", (auction) => auction.burnRemainderAfterAllClaimed())}
                  onWithdrawProceeds={() =>
                    void run("Withdraw proceeds", (auction) => auction.withdrawIssuerProceeds(account!))
                  }
                />
                {deployment?.chainId === LOCAL_CHAIN_ID && <DevTools onAdvanced={refresh} />}
              </aside>
            </div>
          </>
        )}

        <HowItWorks />
      </main>

      <footer className="footer">
        <span>DutchPoint: A Decentralized Dutch Auction Platform · SC4053 Blockchain Technology</span>
        {deployment && (
          <span>
            {chainName(deployment.chainId)} · auction{" "}
            {deployment.explorer ? (
              <a href={`${deployment.explorer}/address/${deployment.auction}`} target="_blank" rel="noreferrer">
                {deployment.auction.slice(0, 10)}…
              </a>
            ) : (
              <code>{deployment.auction.slice(0, 10)}…</code>
            )}
          </span>
        )}
      </footer>
    </div>
  );
}
