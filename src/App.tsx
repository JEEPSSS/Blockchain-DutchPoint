import { BrowserProvider, Contract, Eip1193Provider, isAddress } from "ethers";
import { useCallback, useEffect, useMemo, useState } from "react";

import { auctionAbi, expectedChainId, hasDeployment, localAddresses, tokenAbi } from "./lib/contracts";
import {
  formatEth,
  formatPrice,
  formatToken,
  parseEthInput,
  secondsToClock,
  trimDecimal
} from "./lib/format";

const TOKEN_SCALE = 10n ** 18n;
const DURATION = 1200n;

type Snapshot = {
  account: string;
  chainId: number;
  blockTimestamp: bigint;
  loadedAt: number;
  tokenName: string;
  tokenSymbol: string;
  saleSupply: bigint;
  status: number;
  started: boolean;
  finalized: boolean;
  cleared: boolean;
  startTime: bigint;
  endTime: bigint;
  startPrice: bigint;
  reservePrice: bigint;
  currentPrice: bigint;
  finalPrice: bigint;
  totalCommitted: bigint;
  burnedUnsold: bigint;
  participantCount: bigint;
  settledParticipantCount: bigint;
  commitment: bigint;
  settlementTokens: bigint;
  settlementAccepted: bigint;
  settlementRefund: bigint;
  settlementFinal: boolean;
  refundCredit: bigint;
  tokenBalance: bigint;
  issuerProceedsAvailable: bigint;
  issuerProceedsWithdrawn: bigint;
};

type TxKind =
  | "connect"
  | "contribute"
  | "finalize"
  | "claim"
  | "refund"
  | "burn"
  | "issuer"
  | null;

const statusLabels = ["Pending", "Active", "Cleared", "Ready to finalize", "Finalized"];

function priceAtElapsed(startPrice: bigint, reservePrice: bigint, elapsed: bigint): bigint {
  if (elapsed >= DURATION) {
    return reservePrice;
  }
  const spread = startPrice - reservePrice;
  const decay = (spread * elapsed) / DURATION;
  const price = startPrice - decay;
  return price < reservePrice ? reservePrice : price;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybe = error as { code?: number; shortMessage?: string; message?: string; reason?: string };
    if (maybe.code === 4001) {
      return "Request rejected in wallet.";
    }
    return maybe.shortMessage ?? maybe.reason ?? maybe.message ?? "Transaction failed.";
  }
  return "Transaction failed.";
}

function useTicker(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return tick;
}

export default function App() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState<TxKind>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const tick = useTicker();

  const deployed = hasDeployment();

  const connectWallet = useCallback(async () => {
    setError("");
    setNotice("");
    if (!window.ethereum) {
      setError("MetaMask or another injected wallet is required for the local demo.");
      return;
    }

    try {
      setPending("connect");
      const nextProvider = new BrowserProvider(window.ethereum as Eip1193Provider);
      await nextProvider.send("eth_requestAccounts", []);
      setProvider(nextProvider);
      setNotice("Wallet connected.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (!provider || !deployed || !isAddress(localAddresses.auction) || !isAddress(localAddresses.token)) {
      return;
    }

    const signer = await provider.getSigner();
    const account = await signer.getAddress();
    const network = await provider.getNetwork();
    const latestBlock = await provider.getBlock("latest");
    const auction = new Contract(localAddresses.auction, auctionAbi, signer);
    const token = new Contract(localAddresses.token, tokenAbi, signer);

    const [
      tokenName,
      tokenSymbol,
      saleSupply,
      status,
      started,
      finalized,
      cleared,
      startTime,
      endTime,
      startPrice,
      reservePrice,
      currentPrice,
      finalPrice,
      totalCommitted,
      burnedUnsold,
      participantCount,
      settledParticipantCount,
      settlement,
      refundCredit,
      tokenBalance,
      issuerProceedsAvailable,
      issuerProceedsWithdrawn
    ] = await Promise.all([
      token.name(),
      token.symbol(),
      auction.saleSupply(),
      auction.status(),
      auction.started(),
      auction.finalized(),
      auction.cleared(),
      auction.startTime(),
      auction.endTime(),
      auction.startPrice(),
      auction.reservePrice(),
      auction.currentPrice(),
      auction.finalPrice(),
      auction.totalCommitted(),
      auction.burnedUnsold(),
      auction.participantCount(),
      auction.settledParticipantCount(),
      auction.settlementOf(account),
      auction.refundCredits(account),
      token.balanceOf(account),
      auction.issuerProceedsAvailable(),
      auction.issuerProceedsWithdrawn()
    ]);

    setSnapshot({
      account,
      chainId: Number(network.chainId),
      blockTimestamp: BigInt(latestBlock?.timestamp ?? 0),
      loadedAt: Date.now(),
      tokenName,
      tokenSymbol,
      saleSupply,
      status: Number(status),
      started,
      finalized,
      cleared,
      startTime,
      endTime,
      startPrice,
      reservePrice,
      currentPrice,
      finalPrice,
      totalCommitted,
      burnedUnsold,
      participantCount,
      settledParticipantCount,
      commitment: settlement[0],
      settlementTokens: settlement[1],
      settlementAccepted: settlement[2],
      settlementRefund: settlement[3],
      settlementFinal: settlement[4],
      refundCredit,
      tokenBalance,
      issuerProceedsAvailable,
      issuerProceedsWithdrawn
    });
  }, [deployed, provider]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot, tick]);

  useEffect(() => {
    if (!window.ethereum?.on) {
      return;
    }
    const reload = () => {
      setSnapshot(null);
      if (provider) {
        void loadSnapshot();
      }
    };
    window.ethereum.on("accountsChanged", reload);
    window.ethereum.on("chainChanged", reload);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", reload);
      window.ethereum?.removeListener?.("chainChanged", reload);
    };
  }, [loadSnapshot, provider]);

  const derived = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    const elapsedWall = BigInt(Math.max(0, Math.floor((Date.now() - snapshot.loadedAt) / 1000)));
    const displayNow = snapshot.blockTimestamp + elapsedWall;
    const remaining = snapshot.endTime > displayNow ? snapshot.endTime - displayNow : 0n;
    const elapsed = snapshot.started && displayNow > snapshot.startTime ? displayNow - snapshot.startTime : 0n;
    const displayPrice = snapshot.finalized
      ? snapshot.finalPrice
      : priceAtElapsed(snapshot.startPrice, snapshot.reservePrice, elapsed);

    let parsedAmount = 0n;
    let inputError = "";
    try {
      parsedAmount = parseEthInput(amount);
    } catch {
      inputError = "Enter a valid ETH amount.";
    }

    const projectedCommitment = snapshot.commitment + parsedAmount;
    const projectedTotal = snapshot.totalCommitted + parsedAmount;
    const requiredAtDisplay = (snapshot.saleSupply * displayPrice + TOKEN_SCALE - 1n) / TOKEN_SCALE;
    const wouldClear = projectedTotal >= requiredAtDisplay;
    const provisionalTokens =
      parsedAmount === 0n
        ? 0n
        : wouldClear && projectedTotal > 0n
          ? (projectedCommitment * snapshot.saleSupply) / projectedTotal
          : (projectedCommitment * TOKEN_SCALE) / displayPrice;

    return {
      displayNow,
      remaining,
      elapsed,
      displayPrice,
      parsedAmount,
      inputError,
      provisionalTokens,
      wouldClear
    };
  }, [amount, snapshot, tick]);

  const runTx = async (kind: TxKind, action: (auction: Contract) => Promise<unknown>) => {
    if (!provider || !snapshot) {
      setError("Connect a wallet first.");
      return;
    }
    setError("");
    setNotice("");
    try {
      setPending(kind);
      const signer = await provider.getSigner();
      const auction = new Contract(localAddresses.auction, auctionAbi, signer);
      const tx = (await action(auction)) as { wait?: () => Promise<unknown> };
      await tx.wait?.();
      setNotice("Transaction confirmed.");
      await loadSnapshot();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const contribute = async () => {
    if (!derived || derived.parsedAmount <= 0n) {
      setError("Enter an ETH commitment greater than zero.");
      return;
    }
    await runTx("contribute", (auction) => auction.contribute({ value: derived.parsedAmount }));
  };

  const switchNetwork = async () => {
    if (!window.ethereum) {
      return;
    }
    try {
      setPending("connect");
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${expectedChainId.toString(16)}` }]
      });
      await loadSnapshot();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const wrongNetwork = snapshot !== null && snapshot.chainId !== expectedChainId;
  const canFinalize = snapshot?.status === 3;
  const canContribute = snapshot?.status === 1 && !wrongNetwork;
  const canClaim = snapshot?.finalized && snapshot.commitment > 0n && snapshot.settlementFinal;
  const hasRefund = (snapshot?.refundCredit ?? 0n) > 0n;
  const issuerWithdrawable = snapshot
    ? snapshot.issuerProceedsAvailable - snapshot.issuerProceedsWithdrawn
    : 0n;
  const canBurnDust =
    snapshot?.finalized &&
    snapshot.participantCount === snapshot.settledParticipantCount &&
    snapshot.participantCount > 0n;

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">SC4053 Option 2</p>
          <h1>FairLaunch</h1>
          <p className="hero-text">
            A local Ethereum Dutch auction for educational token launches: descending price,
            uniform settlement, pull refunds, and unsold token burns.
          </p>
        </div>
        <div className="wallet-panel">
          <div>
            <span className="muted">Deployment</span>
            <strong>{deployed ? shortAddress(localAddresses.auction) : "Not deployed"}</strong>
          </div>
          <div>
            <span className="muted">Wallet</span>
            <strong>{snapshot ? shortAddress(snapshot.account) : "Disconnected"}</strong>
          </div>
          <button className="primary-button" onClick={connectWallet} disabled={pending !== null}>
            {pending === "connect" ? "Connecting..." : snapshot ? "Refresh wallet" : "Connect wallet"}
          </button>
        </div>
      </section>

      {!deployed && (
        <section className="notice error">
          Run <code>npm run node</code> and <code>npm run deploy:local</code> to populate the local
          contract addresses.
        </section>
      )}

      {wrongNetwork && (
        <section className="notice warning">
          Connected to chain {snapshot.chainId}, expected {expectedChainId}.{" "}
          <button onClick={switchNetwork} disabled={pending !== null}>Switch network</button>
        </section>
      )}

      {notice && <section className="notice success">{notice}</section>}
      {error && <section className="notice error">{error}</section>}

      <section className="dashboard-grid">
        <div className="metric-card">
          <span>Status</span>
          <strong>{snapshot ? statusLabels[snapshot.status] : "Connect wallet"}</strong>
        </div>
        <div className="metric-card">
          <span>Countdown</span>
          <strong>{derived ? secondsToClock(derived.remaining) : "--:--"}</strong>
        </div>
        <div className="metric-card">
          <span>Indicative price</span>
          <strong>{derived ? formatPrice(derived.displayPrice) : "-"}</strong>
        </div>
        <div className="metric-card">
          <span>Total committed</span>
          <strong>{snapshot ? formatEth(snapshot.totalCommitted) : "-"}</strong>
        </div>
      </section>

      <section className="main-grid">
        <div className="work-surface auction-surface">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Auction</p>
              <h2>{snapshot?.tokenName ?? "FairLaunch Token"}</h2>
            </div>
            <span className="status-pill">{snapshot?.tokenSymbol ?? "FAIR"}</span>
          </div>

          <PriceChart snapshot={snapshot} elapsed={derived?.elapsed ?? 0n} />

          <div className="price-row">
            <div>
              <span>Starting price</span>
              <strong>{snapshot ? formatPrice(snapshot.startPrice) : "-"}</strong>
            </div>
            <div>
              <span>Reserve price</span>
              <strong>{snapshot ? formatPrice(snapshot.reservePrice) : "-"}</strong>
            </div>
            <div>
              <span>Sale supply</span>
              <strong>{snapshot ? formatToken(snapshot.saleSupply, snapshot.tokenSymbol, 0) : "-"}</strong>
            </div>
          </div>

          <div className="how-it-works">
            <h3>How this auction works</h3>
            <p>
              Contributors commit ETH as a maximum budget. The displayed price descends for 20
              minutes, but every successful participant settles at one final clearing price. A
              participant who committed early can receive more tokens as the price falls; refunds
              come from oversubscription or integer rounding, not from paying an old submission
              price.
            </p>
            <div className="uniform-visual">
              <span>Early participant</span>
              <div className="line" />
              <strong>same final price</strong>
              <div className="line" />
              <span>Late participant</span>
            </div>
          </div>
        </div>

        <aside className="work-surface action-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Commit</p>
              <h2>ETH budget</h2>
            </div>
          </div>
          <label className="field">
            <span>Commitment amount</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="1.0"
            />
          </label>
          {derived?.inputError && <p className="field-error">{derived.inputError}</p>}
          <div className="estimate-box">
            <span>Provisional allocation</span>
            <strong>
              {snapshot && derived ? formatToken(derived.provisionalTokens, snapshot.tokenSymbol) : "-"}
            </strong>
            <small>
              Estimate only. Contract settlement uses authoritative on-chain state and integer
              arithmetic.
            </small>
          </div>
          <button
            className="primary-button wide"
            disabled={!snapshot || !canContribute || pending !== null}
            onClick={contribute}
          >
            {pending === "contribute" ? "Committing..." : "Commit ETH"}
          </button>

          <div className="button-stack">
            <button
              disabled={!snapshot || !canFinalize || pending !== null}
              onClick={() => runTx("finalize", (auction) => auction.finalize())}
            >
              {pending === "finalize" ? "Finalizing..." : "Finalize auction"}
            </button>
            <button
              disabled={!snapshot || !canClaim || pending !== null}
              onClick={() => runTx("claim", (auction) => auction.claimTokens())}
            >
              {pending === "claim" ? "Claiming..." : "Claim tokens"}
            </button>
            <button
              disabled={!snapshot || !hasRefund || pending !== null}
              onClick={() => runTx("refund", (auction) => auction.withdrawRefundTo(snapshot!.account))}
            >
              {pending === "refund" ? "Withdrawing..." : "Withdraw refund"}
            </button>
            <button
              disabled={!snapshot || !canBurnDust || pending !== null}
              onClick={() => runTx("burn", (auction) => auction.burnRemainderAfterAllSettled())}
            >
              {pending === "burn" ? "Burning..." : "Burn residual dust"}
            </button>
            <button
              disabled={!snapshot || issuerWithdrawable === 0n || pending !== null}
              onClick={() => runTx("issuer", (auction) => auction.withdrawIssuerProceeds(snapshot!.account))}
            >
              {pending === "issuer" ? "Withdrawing..." : "Withdraw issuer proceeds"}
            </button>
          </div>
        </aside>
      </section>

      <section className="receipt-grid">
        <div className="work-surface">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Settlement receipt</p>
              <h2>Your position</h2>
            </div>
          </div>
          <dl className="receipt-list">
            <div>
              <dt>Deposited ETH</dt>
              <dd>{snapshot ? formatEth(snapshot.commitment) : "-"}</dd>
            </div>
            <div>
              <dt>Accepted cost</dt>
              <dd>{snapshot ? formatEth(snapshot.settlementAccepted) : "-"}</dd>
            </div>
            <div>
              <dt>Refund credit</dt>
              <dd>{snapshot ? formatEth(snapshot.refundCredit || snapshot.settlementRefund) : "-"}</dd>
            </div>
            <div>
              <dt>Tokens received</dt>
              <dd>
                {snapshot
                  ? `${formatToken(snapshot.tokenBalance, snapshot.tokenSymbol)} wallet balance`
                  : "-"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="work-surface">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Burn and proceeds</p>
              <h2>Tracked accounting</h2>
            </div>
          </div>
          <dl className="receipt-list">
            <div>
              <dt>Burned tokens</dt>
              <dd>{snapshot ? formatToken(snapshot.burnedUnsold, snapshot.tokenSymbol) : "-"}</dd>
            </div>
            <div>
              <dt>Participants settled</dt>
              <dd>
                {snapshot
                  ? `${snapshot.settledParticipantCount.toString()} / ${snapshot.participantCount.toString()}`
                  : "-"}
              </dd>
            </div>
            <div>
              <dt>Issuer withdrawable</dt>
              <dd>{formatEth(issuerWithdrawable)}</dd>
            </div>
            <div>
              <dt>Final clearing price</dt>
              <dd>{snapshot?.finalized ? formatPrice(snapshot.finalPrice) : "Not finalized"}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}

function PriceChart({ snapshot, elapsed }: { snapshot: Snapshot | null; elapsed: bigint }) {
  const path = useMemo(() => {
    if (!snapshot) {
      return "";
    }
    const width = 640n;
    const height = 180n;
    const points: string[] = [];
    const spread = snapshot.startPrice - snapshot.reservePrice;
    for (let i = 0; i <= 24; i += 1) {
      const e = (DURATION * BigInt(i)) / 24n;
      const price = priceAtElapsed(snapshot.startPrice, snapshot.reservePrice, e);
      const x = Number((width * BigInt(i)) / 24n);
      const y = Number(height - ((price - snapshot.reservePrice) * height) / spread);
      points.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
    }
    return points.join(" ");
  }, [snapshot]);

  const markerX = Number((640n * (elapsed > DURATION ? DURATION : elapsed)) / DURATION);

  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 640 220" role="img" aria-label="Descending auction price chart">
        <path className="grid-line" d="M 0 180 L 640 180" />
        <path className="grid-line top" d="M 0 0 L 640 0" />
        <path className="price-path" d={path} />
        <line className="time-marker" x1={markerX} x2={markerX} y1="0" y2="180" />
        <text x="0" y="210">0:00</text>
        <text x="580" y="210">20:00</text>
        <text x="8" y="20">
          {snapshot ? trimDecimal(formatPrice(snapshot.startPrice).replace(" ETH/token", ""), 4) : ""}
        </text>
        <text x="8" y="172">
          {snapshot ? trimDecimal(formatPrice(snapshot.reservePrice).replace(" ETH/token", ""), 4) : ""}
        </text>
      </svg>
    </div>
  );
}

