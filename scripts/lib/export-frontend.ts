import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Deployment = {
  chainId: number;
  networkName: string;
  token: string;
  auction: string;
  deployedAtBlock: number;
  explorer: string | null;
};

const LOCAL_CHAIN_ID = 31337;
const generatedDir = path.join(process.cwd(), "src", "generated");
// Public deployments are committed; local ones change on every run and are gitignored.
const deploymentsFile = (chainId: number) =>
  path.join(generatedDir, chainId === LOCAL_CHAIN_ID ? "deployments.local.json" : "deployments.json");

async function exportAbi(contract: string) {
  const artifact = JSON.parse(
    await readFile(
      path.join(process.cwd(), "artifacts", "contracts", `${contract}.sol`, `${contract}.json`),
      "utf8"
    )
  );
  await writeFile(
    path.join(generatedDir, `${contract}.json`),
    `${JSON.stringify({ abi: artifact.abi }, null, 2)}\n`
  );
}

/** Copies contract ABIs to the frontend and records a deployment under its chain ID. */
export async function exportFrontendArtifacts(deployment?: Deployment) {
  await mkdir(generatedDir, { recursive: true });
  await exportAbi("DutchAuction");
  await exportAbi("GavoraToken");

  if (deployment === undefined) {
    return;
  }
  const file = deploymentsFile(deployment.chainId);
  let deployments: Record<string, Deployment> = {};
  try {
    deployments = JSON.parse(await readFile(file, "utf8"));
  } catch {
    // First export for this file: start with an empty map.
  }
  deployments[String(deployment.chainId)] = deployment;
  await writeFile(file, `${JSON.stringify(deployments, null, 2)}\n`);
}
