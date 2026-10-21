import { useState } from "react";

import { Snapshot } from "../hooks/useAuction";
import { DURATION } from "../lib/auctionMath";
import { Deployment, LOCAL_CHAIN_ID, chainName } from "../lib/contracts";
import { shortAddress } from "../lib/format";

type Props = {
  deployment: Deployment;
  snapshot: Snapshot;
};

/** "22 Oct 2026, 3:42 pm – 4:02 pm"; the end date is repeated only if the window crosses midnight. */
function formatWindow(start: bigint, end: bigint): string {
  const from = new Date(Number(start) * 1000);
  const to = new Date(Number(end) * 1000);
  const sameDay = from.toDateString() === to.toDateString();
  const startText = from.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const endText = sameDay
    ? to.toLocaleTimeString(undefined, { timeStyle: "short" })
    : to.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return `${startText} – ${endText}`;
}

function AddressRow({ label, address, explorer }: { label: string; address: string; explorer: string | null }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; the full address is still in the tooltip and the link.
    }
  };

  return (
    <div>
      <dt>{label}</dt>
      <dd className="address">
        {explorer ? (
          <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer" title={address}>
            {shortAddress(address)} ↗
          </a>
        ) : (
          <code title={address}>{shortAddress(address)}</code>
        )}
        <button className="copy" onClick={() => void copy()} aria-label={`Copy the ${label.toLowerCase()} address`}>
          {copied ? "Copied" : "Copy"}
        </button>
      </dd>
    </div>
  );
}

/** Which contracts this page talks to and when the sale runs, with explorer links on public networks. */
export function SaleInfo({ deployment, snapshot }: Props) {
  const local = deployment.chainId === LOCAL_CHAIN_ID;
  let schedule: string;
  if (!snapshot.started) {
    schedule = "Not started yet";
  } else if (local) {
    schedule = "20 minutes (local clock)";
  } else {
    schedule = formatWindow(snapshot.startTime, snapshot.startTime + DURATION);
  }

  return (
    <section className="card">
      <h2>Sale details</h2>
      <dl className="rows">
        <div>
          <dt>Network</dt>
          <dd>{chainName(deployment.chainId)}</dd>
        </div>
        <div>
          <dt>Token</dt>
          <dd>
            {snapshot.tokenName} ({snapshot.tokenSymbol}), ERC20
          </dd>
        </div>
        <AddressRow label="Token contract" address={deployment.token} explorer={deployment.explorer} />
        <AddressRow label="Auction contract" address={deployment.auction} explorer={deployment.explorer} />
        <AddressRow label="Issuer" address={snapshot.owner} explorer={deployment.explorer} />
        <div>
          <dt>Sale window</dt>
          <dd>{schedule}</dd>
        </div>
      </dl>
      {local ? (
        <p className="hint">Local addresses change every time the contracts are redeployed.</p>
      ) : (
        deployment.explorer && (
          <a className="btn wide" href={`${deployment.explorer}/address/${deployment.auction}#code`} target="_blank" rel="noreferrer">
            View the auction contract's source code
          </a>
        )
      )}
    </section>
  );
}
