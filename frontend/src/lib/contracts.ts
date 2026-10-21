import auctionArtifact from "../generated/DutchAuction.json";
import tokenArtifact from "../generated/GavoraToken.json";

export const auctionAbi = auctionArtifact.abi;
export const tokenAbi = tokenArtifact.abi;

export type Deployment = {
  chainId: number;
  networkName: string;
  token: string;
  auction: string;
  deployedAtBlock: number;
  explorer: string | null;
};

// deployments.json (committed, public networks) plus deployments.local.json (gitignored,
// written by `npm run deploy:local`). The glob tolerates the local file being absent.
const deploymentFiles = import.meta.glob<Record<string, Deployment>>("../generated/deployments*.json", {
  eager: true,
  import: "default"
});
const deployments: Record<string, Deployment> = Object.assign({}, ...Object.values(deploymentFiles));

/** Every chain this build has DutchPoint addresses for. Empty on a build with no deployment. */
export const deployedChainIds: number[] = Object.keys(deployments).map(Number);

export const LOCAL_CHAIN_ID = 31337;
export const LOCAL_RPC_URL = "http://127.0.0.1:8545";

export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum Mainnet",
  [LOCAL_CHAIN_ID]: "Hardhat Local",
  11155111: "Sepolia"
};

export function chainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

export function deploymentFor(chainId: number | null): Deployment | null {
  if (chainId === null) {
    return null;
  }
  return deployments[String(chainId)] ?? null;
}

/** The chain the app reads from before a wallet connects, and asks wallets to switch to. */
export const defaultChainId = Number(
  import.meta.env.VITE_DEFAULT_CHAIN_ID ?? Object.keys(deployments)[0] ?? LOCAL_CHAIN_ID
);

/** Optional public RPC for read-only browsing of a non-local deployment. */
export const readRpcUrl: string | null =
  import.meta.env.VITE_READ_RPC_URL ?? (defaultChainId === LOCAL_CHAIN_ID ? LOCAL_RPC_URL : null);
