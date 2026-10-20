import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { network } from "hardhat";

import { exportFrontendArtifacts } from "./lib/export-frontend.js";

// Sale parameters; override with environment variables, e.g. START_PRICE=0.05 npm run deploy:local
const SALE_SUPPLY = process.env.SALE_SUPPLY ?? "1000"; // GVRA
const START_PRICE = process.env.START_PRICE ?? "0.02"; // ETH per GVRA
const RESERVE_PRICE = process.env.RESERVE_PRICE ?? "0.005"; // ETH per GVRA
// Set START_AUCTION=false to deploy now and start the 20-minute window later from the UI.
const START_AUCTION = process.env.START_AUCTION !== "false";

const EXPLORERS: Record<number, string> = {
  11155111: "https://sepolia.etherscan.io"
};

async function main() {
  const { ethers, networkName } = await network.getOrCreate();
  const [issuer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const explorer = EXPLORERS[chainId];

  const saleSupply = ethers.parseUnits(SALE_SUPPLY, 18);
  const startPrice = ethers.parseEther(START_PRICE);
  const reservePrice = ethers.parseEther(RESERVE_PRICE);

  console.log(`Deploying DutchPoint to ${networkName} (chain ${chainId}) from ${issuer.address}`);

  const token = (await (await ethers.getContractFactory("GavoraToken")).deploy(
    saleSupply,
    issuer.address
  )) as any;
  await token.waitForDeployment();
  const tokenAddress: string = await token.getAddress();

  const auction = (await (await ethers.getContractFactory("DutchAuction")).deploy(
    tokenAddress,
    saleSupply,
    startPrice,
    reservePrice,
    issuer.address
  )) as any;
  await auction.waitForDeployment();
  const auctionAddress: string = await auction.getAddress();
  const auctionReceipt = await auction.deploymentTransaction()!.wait();

  const fundTx = await token.transfer(auctionAddress, saleSupply);
  await fundTx.wait();

  let startTxHash: string | null = null;
  if (START_AUCTION) {
    const startTx = await auction.start();
    await startTx.wait();
    startTxHash = startTx.hash;
  }

  await exportFrontendArtifacts({
    chainId,
    networkName,
    token: tokenAddress,
    auction: auctionAddress,
    deployedAtBlock: auctionReceipt.blockNumber,
    explorer: explorer ?? null
  });

  const record = {
    network: networkName,
    chainId,
    deployer: issuer.address,
    deployedAt: new Date().toISOString(),
    parameters: { saleSupply: SALE_SUPPLY, startPrice: START_PRICE, reservePrice: RESERVE_PRICE },
    contracts: { GavoraToken: tokenAddress, DutchAuction: auctionAddress },
    transactions: {
      deployToken: token.deploymentTransaction()!.hash,
      deployAuction: auction.deploymentTransaction()!.hash,
      fundAuction: fundTx.hash,
      startAuction: startTxHash
    }
  };

  const link = (kind: "address" | "tx", value: string) =>
    explorer ? `${explorer}/${kind}/${value}` : value;

  console.log(`GavoraToken:  ${link("address", tokenAddress)}`);
  console.log(`DutchAuction: ${link("address", auctionAddress)}`);
  for (const [name, hash] of Object.entries(record.transactions)) {
    if (hash) {
      console.log(`  ${name.padEnd(13)} ${link("tx", hash)}`);
    }
  }
  console.log(START_AUCTION ? "Auction started: the 20-minute window is open." : "Auction deployed but not started.");
  console.log("Frontend artifacts written to src/generated/");

  // Keep a permanent record of public-network deployments as evidence for the audit report.
  if (chainId !== 31337) {
    const dir = path.join(process.cwd(), "deployments");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${networkName}.json`), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`Deployment record written to deployments/${networkName}.json`);
    console.log("\nVerify the source code on Etherscan with:");
    console.log(`  npm run verify:sepolia -- ${tokenAddress} ${saleSupply} ${issuer.address}`);
    console.log(
      `  npm run verify:sepolia -- ${auctionAddress} ${tokenAddress} ${saleSupply} ${startPrice} ${reservePrice} ${issuer.address}`
    );
  }
}

await main();
