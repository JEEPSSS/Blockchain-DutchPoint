import { AuctionState, DURATION, View } from "../lib/auctionMath";
import { formatPrice, trimDecimal } from "../lib/format";

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 18, right: 18, bottom: 34, left: 64 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

type Props = {
  state: AuctionState;
  view: View;
};

/** Linear price decay over 20 minutes, with the current point and the clearing point. */
export function PriceChart({ state, view }: Props) {
  const spread = state.startPrice - state.reservePrice;
  const x = (elapsed: bigint) => PAD.left + (PLOT_W * Number(elapsed)) / Number(DURATION);
  const y = (price: bigint) =>
    PAD.top + (PLOT_H * Number(state.startPrice - price)) / Number(spread === 0n ? 1n : spread);

  const startX = x(0n);
  const endX = x(DURATION);
  const topY = y(state.startPrice);
  const bottomY = y(state.reservePrice);

  const clearingElapsed =
    view.clearing.cleared && state.started ? view.clearing.time - state.startTime : null;
  // The solid segment shows how far the price has travelled; it stops where the auction cleared.
  const travelled = clearingElapsed ?? view.elapsedSeconds;
  const travelledPrice = state.startPrice - (spread * travelled) / DURATION;

  const yTicks = [state.startPrice, state.startPrice - spread / 2n, state.reservePrice];
  const label = (price: bigint) => trimDecimal(formatPrice(price).replace(" ETH", ""), 5);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Gavora price over the 20-minute auction">
        {yTicks.map((price) => (
          <g key={price.toString()}>
            <line className="chart-grid" x1={startX} x2={endX} y1={y(price)} y2={y(price)} />
            <text className="chart-axis" x={PAD.left - 10} y={y(price) + 4} textAnchor="end">
              {label(price)}
            </text>
          </g>
        ))}
        {[0, 5, 10, 15, 20].map((minute) => (
          <text
            key={minute}
            className="chart-axis"
            x={x(BigInt(minute * 60))}
            y={HEIGHT - 10}
            textAnchor="middle"
          >
            {minute}m
          </text>
        ))}

        <line className="chart-future" x1={startX} y1={topY} x2={endX} y2={bottomY} />
        {state.started && travelled > 0n && (
          <line
            className="chart-past"
            x1={startX}
            y1={topY}
            x2={x(travelled)}
            y2={y(travelledPrice)}
          />
        )}

        {view.clearing.cleared && clearingElapsed !== null && (
          <g>
            <line
              className="chart-clearing"
              x1={x(clearingElapsed)}
              x2={endX}
              y1={y(view.clearing.price)}
              y2={y(view.clearing.price)}
            />
            <circle className="chart-clearing-dot" cx={x(clearingElapsed)} cy={y(view.clearing.price)} r={7} />
            {/* Late clearings label below-left of the point, early ones above-right, so the
                text never sits on the price line. */}
            <text
              className="chart-callout"
              x={x(clearingElapsed) + (x(clearingElapsed) > WIDTH * 0.6 ? -12 : 12)}
              y={y(view.clearing.price) + (x(clearingElapsed) > WIDTH * 0.6 ? 26 : -14)}
              textAnchor={x(clearingElapsed) > WIDTH * 0.6 ? "end" : "start"}
            >
              Cleared at {label(view.clearing.price)} ETH
            </text>
          </g>
        )}

        {state.started && !view.clearing.cleared && view.elapsedSeconds < DURATION && (
          <circle className="chart-now" cx={x(view.elapsedSeconds)} cy={y(view.price)} r={7} />
        )}
      </svg>
      <figcaption className="sr-only">
        The price starts at {formatPrice(state.startPrice)} and falls linearly to the reserve price of{" "}
        {formatPrice(state.reservePrice)} over 20 minutes.
      </figcaption>
    </figure>
  );
}
