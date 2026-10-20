import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type DeploymentAddresses = {
  chainId: number;
  auction: string;
  token: string;
  startedAt?: string;
};

const generatedDir = path.join(process.cwd(), "src", "generated");

export async function exportFrontendArtifacts(addresses?: DeploymentAddresses) {
  await mkdir(generatedDir, { recursive: true });

  const auctionArtifact = JSON.parse(
    await readFile(
      path.join(process.cwd(), "artifacts", "contracts", "DutchAuction.sol", "DutchAuction.json"),
      "utf8"
    )
  );
  const tokenArtifact = JSON.parse(
    await readFile(
      path.join(process.cwd(), "artifacts", "contracts", "GavoraToken.sol", "GavoraToken.json"),
      "utf8"
    )
  );

  await writeFile(
    path.join(generatedDir, "DutchAuction.json"),
    `${JSON.stringify({ abi: auctionArtifact.abi }, null, 2)}\n`
  );
  await writeFile(
    path.join(generatedDir, "GavoraToken.json"),
    `${JSON.stringify({ abi: tokenArtifact.abi }, null, 2)}\n`
  );

  if (addresses !== undefined) {
    await writeFile(
      path.join(generatedDir, "addresses.local.json"),
      `${JSON.stringify(addresses, null, 2)}\n`
    );
  }
}

