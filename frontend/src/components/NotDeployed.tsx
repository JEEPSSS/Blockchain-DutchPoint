import { LOCAL_CHAIN_ID, chainName } from "../lib/contracts";

const README_URL = "https://github.com/JEEPSSS/Blockchain-DutchPoint#quick-start-local";

type Props = {
  /** The chain the app is reading from, which has no DutchPoint deployment. */
  chainId: number;
  /** Another chain that does have a deployment, if any. */
  liveOn: number | null;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
  onSwitchNetwork: () => void;
};

/** Shown in place of the dashboard when this build has no auction on the chain being read. */
export function NotDeployed({ chainId, liveOn, connected, connecting, onConnect, onSwitchNetwork }: Props) {
  const local = chainId === LOCAL_CHAIN_ID;

  return (
    <section className="card empty-state" aria-labelledby="empty-state-title">
      <span className="status-pill">Not live yet</span>
      <h2 id="empty-state-title">
        {local ? "No auction on the local chain yet" : `DutchPoint isn't deployed on ${chainName(chainId)} yet`}
      </h2>
      {local ? (
        <p>
          Start a local node with <code>npm run node</code>, then run <code>npm run deploy:local</code> and reload
          this page.
        </p>
      ) : (
        <>
          <p>
            The Gavora auction contracts haven't been deployed to {chainName(chainId)}, so there's no live auction
            to show here yet.
          </p>
          <p>
            You can run the whole auction on your own machine instead (a local Hardhat chain, the contracts and
            this dashboard) by following the Quick start in the README.
          </p>
        </>
      )}
      {liveOn !== null && (
        <p>
          DutchPoint is live on <strong>{chainName(liveOn)}</strong>.{" "}
          {connected ? "Switch your wallet to it to take part." : `Connect a wallet on ${chainName(liveOn)} to take part.`}
        </p>
      )}
      <div className="actions">
        {liveOn !== null &&
          (connected ? (
            <button className="btn primary" onClick={onSwitchNetwork}>
              Switch to {chainName(liveOn)}
            </button>
          ) : (
            <button className="btn primary" onClick={onConnect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          ))}
        <a className={`btn${liveOn === null ? " primary" : ""}`} href={README_URL} target="_blank" rel="noreferrer">
          Run it locally (README)
        </a>
      </div>
    </section>
  );
}
