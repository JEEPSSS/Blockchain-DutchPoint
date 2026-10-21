import { Contract, EventLog, Provider } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuctionState } from "../lib/auctionMath";
import { Deployment, LOCAL_CHAIN_ID, auctionAbi, tokenAbi } from "../lib/contracts";
import { describeError } from "../lib/errors";

export type Position = {
  commitment: bigint;
  claimed: boolean;
  tokensClaimed: bigint;
  refundCredit: bigint;
  tokenBalance: bigint;
  ethBalance: bigint;
};

export type Snapshot = AuctionState & {
  tokenName: string;
  tokenSymbol: string;
  owner: string;
  totalTokensSold: bigint;
  totalTokensClaimed: bigint;
  burnedUnsold: bigint;
  participantCount: bigint;
  claimedParticipantCount: bigint;
  refundLiability: bigint;
  issuerProceedsWithdrawn: bigint;
  auctionTokenBalance: bigint;
  blockNumber: number;
  blockTimestamp: bigint;
  /** Wall-clock time the snapshot was read, used to extrapolate the chain clock. */
  loadedAt: number;
  position: Position | null;
};

export type Bid = {
  key: string;
  txHash: string;
  blockNumber: number;
  timestamp: bigint;
  account: string;
  amount: bigint;
  accepted: bigint;
  price: bigint;
  totalCommitted: bigint;
};

export type AuctionData = {
  snapshot: Snapshot | null;
  bids: Bid[];
  error: string;
  refresh: () => Promise<void>;
};

const FALLBACK_REFRESH_MS = 15_000;

export function useAuction(
  provider: Provider | null,
  deployment: Deployment | null,
  account: string | null
): AuctionData {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [error, setError] = useState("");

  const lastBidBlock = useRef(-1);
  const blockTimes = useRef(new Map<number, bigint>());
  const inFlight = useRef(false);
  const queued = useRef(false);

  const contracts = useMemo(() => {
    if (!provider || !deployment) {
      return null;
    }
    return {
      auction: new Contract(deployment.auction, auctionAbi, provider),
      token: new Contract(deployment.token, tokenAbi, provider)
    };
  }, [provider, deployment]);

  useEffect(() => {
    setSnapshot(null);
    setBids([]);
    setError("");
    lastBidBlock.current = -1;
    blockTimes.current.clear();
  }, [contracts]);

  const blockTime = useCallback(
    async (blockNumber: number) => {
      const cached = blockTimes.current.get(blockNumber);
      if (cached !== undefined) {
        return cached;
      }
      const block = await provider!.getBlock(blockNumber);
      const timestamp = BigInt(block?.timestamp ?? 0);
      blockTimes.current.set(blockNumber, timestamp);
      return timestamp;
    },
    [provider]
  );

  const load = useCallback(async () => {
    if (!contracts || !provider || !deployment) {
      return;
    }
    const { auction, token } = contracts;
    const auctionAddress = deployment.auction;

    if ((await provider.getCode(auctionAddress)) === "0x") {
      setError(
        deployment.chainId === LOCAL_CHAIN_ID
          ? "No DutchPoint auction is deployed on the local node. Run `npm run deploy:local`."
          : `No DutchPoint auction found at ${auctionAddress} on this network.`
      );
      setSnapshot(null);
      return;
    }

    const [block, core, accounting, position] = await Promise.all([
      provider.getBlock("latest"),
      Promise.all([
        token.name(),
        token.symbol(),
        auction.owner(),
        auction.saleSupply(),
        auction.startPrice(),
        auction.reservePrice(),
        auction.started(),
        auction.finalized(),
        auction.cleared(),
        auction.startTime(),
        auction.lastCommitmentTimestamp(),
        auction.clearingTime(),
        auction.clearingPrice(),
        auction.finalPrice(),
        auction.totalCommitted()
      ]),
      Promise.all([
        auction.totalTokensSold(),
        auction.totalTokensClaimed(),
        auction.burnedUnsold(),
        auction.participantCount(),
        auction.claimedParticipantCount(),
        auction.refundLiability(),
        auction.issuerProceedsWithdrawn(),
        token.balanceOf(auctionAddress)
      ]),
      account
        ? Promise.all([
            auction.commitments(account),
            auction.claimed(account),
            auction.tokensClaimed(account),
            auction.refundCredits(account),
            token.balanceOf(account),
            provider.getBalance(account)
          ])
        : Promise.resolve(null)
    ]);

    const [
      tokenName,
      tokenSymbol,
      owner,
      saleSupply,
      startPrice,
      reservePrice,
      started,
      finalized,
      cleared,
      startTime,
      lastCommitmentTimestamp,
      clearingTime,
      clearingPrice,
      finalPrice,
      totalCommitted
    ] = core;
    const [
      totalTokensSold,
      totalTokensClaimed,
      burnedUnsold,
      participantCount,
      claimedParticipantCount,
      refundLiability,
      issuerProceedsWithdrawn,
      auctionTokenBalance
    ] = accounting;

    setSnapshot({
      tokenName,
      tokenSymbol,
      owner,
      saleSupply,
      startPrice,
      reservePrice,
      started,
      finalized,
      cleared,
      startTime,
      lastCommitmentTimestamp,
      clearingTime,
      clearingPrice,
      finalPrice,
      totalCommitted,
      totalTokensSold,
      totalTokensClaimed,
      burnedUnsold,
      participantCount,
      claimedParticipantCount,
      refundLiability,
      issuerProceedsWithdrawn,
      auctionTokenBalance,
      blockNumber: block?.number ?? 0,
      blockTimestamp: BigInt(block?.timestamp ?? 0),
      loadedAt: Date.now(),
      position: position
        ? {
            commitment: position[0],
            claimed: position[1],
            tokensClaimed: position[2],
            refundCredit: position[3],
            tokenBalance: position[4],
            ethBalance: position[5]
          }
        : null
    });

    // Bid history: fetch only blocks we have not scanned yet.
    const latest = block?.number ?? 0;
    const from = Math.max(deployment.deployedAtBlock, lastBidBlock.current + 1);
    if (latest >= from) {
      const logs = await auction.queryFilter(auction.filters.ContributionReceived(), from, latest);
      const fresh: Bid[] = [];
      for (const log of logs) {
        if (!(log instanceof EventLog)) {
          continue;
        }
        fresh.push({
          key: `${log.transactionHash}-${log.index}`,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestamp: await blockTime(log.blockNumber),
          account: log.args.account as string,
          amount: log.args.amount as bigint,
          accepted: log.args.accepted as bigint,
          price: log.args.price as bigint,
          totalCommitted: log.args.totalCommitted as bigint
        });
      }
      lastBidBlock.current = latest;
      if (fresh.length > 0) {
        setBids((previous) => [...previous, ...fresh]);
      }
    }
    setError("");
  }, [contracts, provider, deployment, account, blockTime]);

  /** Serialises refreshes: block events can arrive while a read is still running. */
  const refresh = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        queued.current = false;
        try {
          await load();
        } catch (err) {
          const message = describeError(err);
          setError(
            deployment?.chainId === LOCAL_CHAIN_ID && /fetch|network|ECONNREFUSED|connect/i.test(message)
              ? "Can't reach the local Hardhat node at 127.0.0.1:8545. Start it with `npm run node`."
              : message
          );
        }
      } while (queued.current);
    } finally {
      inFlight.current = false;
    }
  }, [load, deployment]);

  useEffect(() => {
    if (!provider || !contracts) {
      return;
    }
    void refresh();
    const onBlock = () => {
      void refresh();
    };
    void provider.on("block", onBlock);
    const id = window.setInterval(onBlock, FALLBACK_REFRESH_MS);
    return () => {
      void provider.off("block", onBlock);
      window.clearInterval(id);
    };
  }, [provider, contracts, refresh]);

  return { snapshot, bids, error, refresh };
}
