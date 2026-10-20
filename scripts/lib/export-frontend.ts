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

const generatedDir = path.join(process.cwd(), "src", "generated");
const deploymentsFile = path.join(generatedDir, "deployments.json");

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

  let deployments: Record<string, Deployment> = {};
  try {
    deployments = JSON.parse(await readFile(deploymentsFile, "utf8"));
  } catch {
    // First export: start with an empty map.
  }
  if (deployment !== undefined) {
    deployments[String(deployment.chainId)] = deployment;
  }
  await writeFile(deploymentsFile, `${JSON.stringify(deployments, null, 2)}\n`);
}
