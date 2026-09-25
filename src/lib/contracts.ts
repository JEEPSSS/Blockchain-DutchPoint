import auctionArtifact from "../generated/DutchAuction.json";
import tokenArtifact from "../generated/LaunchToken.json";
import addresses from "../generated/addresses.local.json";

export const auctionAbi = auctionArtifact.abi;
export const tokenAbi = tokenArtifact.abi;

export const localAddresses = addresses as {
  chainId: number;
  auction: string;
  token: string;
  startedAt?: string;
};

export const expectedChainId = Number(
  import.meta.env.VITE_EXPECTED_CHAIN_ID ?? localAddresses.chainId ?? 31337
);

export function hasDeployment(): boolean {
  return Boolean(localAddresses.auction && localAddresses.token);
}

