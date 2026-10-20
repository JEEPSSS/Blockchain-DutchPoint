import { readFile } from "node:fs/promises";
import path from "node:path";

import { network } from "hardhat";

// Local demo helper: places a few bids from Hardhat test accounts so the dashboard has a
// live auction with history. Run after `npm run deploy:local`.

const { ethers, networkName } = await network.getOrCreate();
if (networkName !== "localhost") {
  throw new Error("seed:local only works against the local Hardhat node");
}

const deployments = JSON.parse(
  await readFile(path.join(process.cwd(), "src", "generated", "deployments.local.json"), "utf8")
);
const deployment = deployments["31337"];
if (!deployment) {
  throw new Error("No local deployment found. Run `npm run deploy:local` first.");
}

const [, alice, bob, carol] = await ethers.getSigners();
const auction = (await ethers.getContractAt("DutchAuction", deployment.auction)) as any;

const advance = async (seconds: number) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
};

const bids: Array<[string, any, string, number]> = [
  ["Alice", alice, "4", 120],
  ["Bob", bob, "2.5", 180],
  ["Carol", carol, "1.5", 120]
];

for (const [name, signer, amount, wait] of bids) {
  await advance(wait);
  await (await auction.connect(signer).contribute({ value: ethers.parseEther(amount) })).wait();
  console.log(`${name} bid ${amount} ETH at ${ethers.formatEther(await auction.currentPrice())} ETH/GVRA`);
}
console.log(`Total committed: ${ethers.formatEther(await auction.totalCommitted())} ETH`);
