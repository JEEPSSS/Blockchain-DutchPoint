import { Bid } from "../hooks/useAuction";
import { TOKEN_SCALE } from "../lib/auctionMath";
import { formatEth, formatPrice, secondsToClock, shortAddress } from "../lib/format";

type Props = {
  bids: Bid[];
  saleSupply: bigint;
  startTime: bigint;
  account: string | null;
  explorer: string | null;
};

export function BidHistory({ bids, saleSupply, startTime, account, explorer }: Props) {
  if (bids.length === 0) {
    return <p className="empty">No bids yet. The first bid will appear here.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="bids">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Bidder</th>
            <th scope="col" className="num">Price</th>
            <th scope="col" className="num">Accepted</th>
            <th scope="col" className="num">Refunded</th>
          </tr>
        </thead>
        <tbody>
          {[...bids].reverse().map((bid) => {
            const refunded = bid.amount - bid.accepted;
            // The bid that fills the supply at its price is the one that cleared the auction.
            const clearedAuction = bid.totalCommitted >= (saleSupply * bid.price) / TOKEN_SCALE;
            const mine = account !== null && bid.account.toLowerCase() === account.toLowerCase();
            const elapsed = bid.timestamp > startTime ? bid.timestamp - startTime : 0n;
            return (
              <tr key={bid.key} className={mine ? "mine" : undefined}>
                <td>
                  {explorer ? (
                    <a href={`${explorer}/tx/${bid.txHash}`} target="_blank" rel="noreferrer">
                      {secondsToClock(elapsed)}
                    </a>
                  ) : (
                    secondsToClock(elapsed)
                  )}
                </td>
                <td>
                  {mine ? "You" : shortAddress(bid.account)}
                  {clearedAuction && <span className="tag">Cleared</span>}
                </td>
                <td className="num">{formatPrice(bid.price)}</td>
                <td className="num">{formatEth(bid.accepted)}</td>
                <td className="num">{refunded > 0n ? formatEth(refunded) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
