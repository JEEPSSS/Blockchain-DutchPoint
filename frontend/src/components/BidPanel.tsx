import { formatEther } from "ethers";
import { useState } from "react";

import { Position } from "../hooks/useAuction";
import { Status, View, quoteBid } from "../lib/auctionMath";
import { formatEth, formatPrice, formatToken, parseEthInput, trimDecimal } from "../lib/format";

type Props = {
  view: View;
  position: Position | null;
  connected: boolean;
  wrongNetwork: string | null;
  busy: boolean;
  onConnect: () => void;
  onSwitchNetwork: () => void;
  onBid: (amount: bigint) => void;
};

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

export function BidPanel({
  view,
  position,
  connected,
  wrongNetwork,
  busy,
  onConnect,
  onSwitchNetwork,
  onBid
}: Props) {
  const [input, setInput] = useState("1");

  if (view.status !== Status.Active) {
    const message =
      view.status === Status.Pending
        ? "Bidding opens when the issuer starts the 20-minute auction."
        : view.status === Status.Cleared
          ? "Gavora has sold out. Bidding is closed; claims open once the 20-minute window ends and the auction is finalized."
          : view.status === Status.Finalized
            ? "The auction is finalized. Winning bidders can claim their GVRA under Your position."
            : "Bidding is closed. Claims open once anyone finalizes the auction.";
    return (
      <section className="card">
        <h2>Place a bid</h2>
        <p className="muted">{message}</p>
      </section>
    );
  }

  let amount = 0n;
  let inputError = "";
  try {
    amount = parseEthInput(input);
  } catch {
    inputError = "Enter an ETH amount, e.g. 0.5";
  }
  const quote = quoteBid(view, position?.commitment ?? 0n, amount);
  const balance = position?.ethBalance ?? null;
  if (!inputError && balance !== null && amount > balance) {
    inputError = `This wallet only has ${formatEth(balance)}.`;
  }

  let action: { label: string; onClick: () => void; disabled: boolean };
  if (!connected) {
    action = { label: "Connect wallet to bid", onClick: onConnect, disabled: false };
  } else if (wrongNetwork) {
    action = { label: `Switch to ${wrongNetwork}`, onClick: onSwitchNetwork, disabled: busy };
  } else {
    action = {
      label: busy ? "Waiting for wallet…" : `Bid ${trimDecimal(formatEther(amount), 6)} ETH`,
      onClick: () => onBid(amount),
      disabled: busy || amount === 0n || inputError !== ""
    };
  }

  return (
    <section className="card bid-card">
      <h2>Place a bid</h2>
      <label className="field">
        <span>Amount of ETH to commit</span>
        <div className="input-wrap">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            inputMode="decimal"
            placeholder="0.0"
            aria-invalid={inputError !== ""}
          />
          <span className="unit">ETH</span>
        </div>
      </label>
      <div className="chips">
        {QUICK_AMOUNTS.map((value) => (
          <button key={value} className="chip" onClick={() => setInput(value)}>
            {value}
          </button>
        ))}
        <button
          className="chip accent"
          onClick={() => setInput(trimDecimal(formatEther(view.capacity), 6))}
          title="Fill in the ETH that buys all remaining GVRA at the current price"
        >
          Sell-out amount
        </button>
      </div>
      {inputError && <p className="field-error">{inputError}</p>}

      <dl className="quote">
        <div>
          <dt>Price now</dt>
          <dd>{formatPrice(view.price)} / GVRA</dd>
        </div>
        <div>
          <dt>You receive at least</dt>
          <dd>{formatToken(quote.minTokens)}</dd>
        </div>
      </dl>

      {quote.clearsAuction && amount > 0n ? (
        <p className="callout success">
          {quote.refunded > 0n ? (
            <>
              This bid sells out the auction. {formatEth(quote.accepted)} is accepted and{" "}
              {formatEth(quote.refunded)} comes straight back to your wallet in the same transaction.
            </>
          ) : (
            "This bid sells out the auction exactly. Add a little more and the extra comes straight back in the same transaction."
          )}
        </p>
      ) : (
        <p className="hint">
          You'll pay the final clearing price, which can only be at or below today's price, so your GVRA
          allocation can only grow.
        </p>
      )}

      <button className="btn primary wide" onClick={action.onClick} disabled={action.disabled}>
        {action.label}
      </button>
    </section>
  );
}
