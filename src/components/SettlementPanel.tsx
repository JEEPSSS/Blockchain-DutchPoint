import { Snapshot } from "../hooks/useAuction";
import { Status, View } from "../lib/auctionMath";
import { formatEth, formatPrice, formatToken } from "../lib/format";

type Props = {
  snapshot: Snapshot;
  view: View;
  isOwner: boolean;
  canTransact: boolean;
  busy: boolean;
  onStart: () => void;
  onFinalize: () => void;
  onBurnDust: () => void;
  onWithdrawProceeds: () => void;
};

export function SettlementPanel({
  snapshot,
  view,
  isOwner,
  canTransact,
  busy,
  onStart,
  onFinalize,
  onBurnDust,
  onWithdrawProceeds
}: Props) {
  const finalized = view.status === Status.Finalized;
  const allClaimed =
    snapshot.participantCount > 0n && snapshot.claimedParticipantCount === snapshot.participantCount;
  const proceedsLeft = snapshot.totalCommitted - snapshot.issuerProceedsWithdrawn;
  const disabled = busy || !canTransact;

  return (
    <section className="card">
      <h2>Settlement</h2>
      <dl className="rows">
        <div>
          <dt>{finalized ? "Final clearing price" : "Clearing price"}</dt>
          <dd>
            {finalized
              ? formatPrice(snapshot.finalPrice)
              : view.clearing.cleared
                ? formatPrice(view.clearing.price)
                : "Not yet"}
          </dd>
        </div>
        {finalized && (
          <>
            <div>
              <dt>GVRA sold</dt>
              <dd>{formatToken(snapshot.totalTokensSold)}</dd>
            </div>
            <div>
              <dt>GVRA burned</dt>
              <dd>{formatToken(snapshot.burnedUnsold)}</dd>
            </div>
            <div>
              <dt>Bidders claimed</dt>
              <dd>
                {snapshot.claimedParticipantCount.toString()} / {snapshot.participantCount.toString()}
              </dd>
            </div>
          </>
        )}
      </dl>

      {view.status === Status.AwaitingFinalization && (
        <>
          <p className="hint">
            The window has closed. Anyone can finalize: it fixes the price and burns unsold GVRA.
          </p>
          <button className="btn primary wide" onClick={onFinalize} disabled={disabled}>
            {canTransact ? "Finalize auction" : "Connect a wallet to finalize"}
          </button>
        </>
      )}
      {finalized && allClaimed && snapshot.auctionTokenBalance > 0n && (
        <button className="btn wide" onClick={onBurnDust} disabled={disabled}>
          Burn {snapshot.auctionTokenBalance.toString()} units of rounding dust
        </button>
      )}

      {isOwner && (
        <div className="issuer">
          <h3>Issuer</h3>
          {view.status === Status.Pending && (
            <button className="btn primary wide" onClick={onStart} disabled={disabled}>
              Start the 20-minute auction
            </button>
          )}
          {finalized && proceedsLeft > 0n && (
            <button className="btn wide" onClick={onWithdrawProceeds} disabled={disabled}>
              Withdraw {formatEth(proceedsLeft)} proceeds
            </button>
          )}
          {finalized && proceedsLeft === 0n && snapshot.totalCommitted > 0n && (
            <p className="muted">Proceeds withdrawn: {formatEth(snapshot.issuerProceedsWithdrawn)}.</p>
          )}
          {!finalized && view.status !== Status.Pending && (
            <p className="muted">Proceeds become withdrawable once the auction is finalized.</p>
          )}
        </div>
      )}
    </section>
  );
}
