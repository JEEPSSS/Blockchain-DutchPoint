import { Status, View } from "../lib/auctionMath";
import { formatEth, percent } from "../lib/format";

type Props = {
  view: View;
  totalCommitted: bigint;
};

/** How close committed ETH is to buying out the supply at the current price. */
export function DemandMeter({ view, totalCommitted }: Props) {
  const soldOut = view.clearing.cleared;
  const filled = soldOut ? 100 : Math.min(100, percent(totalCommitted, view.demandTarget));

  let caption: string;
  if (view.status === Status.Pending) {
    caption = "Bids open when the auction starts.";
  } else if (soldOut) {
    caption = "Demand met the full supply. Every winning bidder pays the clearing price.";
  } else if (view.status === Status.Active) {
    caption = `${formatEth(view.capacity)} more at today's price sells out the auction. As the price falls, the same ETH buys more GVRA, so this gap shrinks on its own.`;
  } else {
    caption = "The window closed before demand met supply. Unsold GVRA is burned at finalization.";
  }

  return (
    <div className="meter">
      <div className="meter-head">
        <span>Demand vs. supply</span>
        <strong>
          {formatEth(totalCommitted)} <span className="muted">/ {formatEth(view.demandTarget)}</span>
        </strong>
      </div>
      <div
        className="meter-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={filled}
        aria-label="Committed ETH as a share of the ETH needed to sell out"
      >
        <div className={`meter-fill ${soldOut ? "full" : ""}`} style={{ width: `${filled}%` }} />
      </div>
      <p className="meter-caption">{caption}</p>
    </div>
  );
}
