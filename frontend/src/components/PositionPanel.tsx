import { useState } from "react";

import { Position } from "../hooks/useAuction";
import { Status, View, tokensFor } from "../lib/auctionMath";
import { formatEth, formatToken } from "../lib/format";

type Props = {
  view: View;
  position: Position;
  finalPrice: bigint;
  busy: boolean;
  onClaim: () => void;
  onWithdrawRefund: () => void;
  /** Lists GVRA in the connected wallet; resolves true if the user accepted. */
  onAddToken: () => Promise<boolean>;
};

export function PositionPanel({ view, position, finalPrice, busy, onClaim, onWithdrawRefund, onAddToken }: Props) {
  const [tokenAdded, setTokenAdded] = useState(false);
  const finalized = view.status === Status.Finalized;
  const owed = tokensFor(position.commitment, finalized ? finalPrice : view.price);
  const hasBid = position.commitment > 0n;

  return (
    <section className="card">
      <h2>Your position</h2>
      {!hasBid && position.refundCredit === 0n ? (
        <p className="muted">You haven't bid in this auction yet.</p>
      ) : (
        <dl className="rows">
          <div>
            <dt>ETH committed</dt>
            <dd>{formatEth(position.commitment)}</dd>
          </div>
          <div>
            <dt>{finalized ? "GVRA allocation" : "GVRA allocation (at least)"}</dt>
            <dd>{formatToken(position.claimed ? position.tokensClaimed : owed)}</dd>
          </div>
          <div>
            <dt>GVRA in wallet</dt>
            <dd>{formatToken(position.tokenBalance)}</dd>
          </div>
          {position.refundCredit > 0n && (
            <div>
              <dt>Refund waiting</dt>
              <dd>{formatEth(position.refundCredit)}</dd>
            </div>
          )}
        </dl>
      )}

      {hasBid && finalized && !position.claimed && (
        <button className="btn primary wide" onClick={onClaim} disabled={busy}>
          Claim {formatToken(owed)}
        </button>
      )}
      {hasBid && position.claimed && <p className="callout success">Claimed. Your GVRA is in your wallet.</p>}
      {hasBid && !finalized && (
        <p className="hint">
          Claims open after the 20-minute window ends and anyone finalizes the auction.
        </p>
      )}
      {hasBid && (
        <button
          className="btn wide"
          onClick={() => void onAddToken().then((added) => setTokenAdded(added))}
          disabled={tokenAdded}
        >
          {tokenAdded ? "GVRA added to your wallet" : "Add GVRA to your wallet"}
        </button>
      )}
      {position.refundCredit > 0n && (
        <button className="btn wide" onClick={onWithdrawRefund} disabled={busy}>
          Withdraw {formatEth(position.refundCredit)} refund
        </button>
      )}
    </section>
  );
}
