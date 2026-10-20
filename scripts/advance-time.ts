import { network } from "hardhat";

// Local demo helper: fast-forwards the local Hardhat chain clock.
// Usage: ADVANCE_SECONDS=600 npm run time:advance
const seconds = Number(process.env.ADVANCE_SECONDS ?? "300");

const { ethers, networkName } = await network.getOrCreate();
if (networkName !== "localhost") {
  throw new Error("time:advance only works against the local Hardhat node");
}

await ethers.provider.send("evm_increaseTime", [seconds]);
await ethers.provider.send("evm_mine", []);
const block = await ethers.provider.getBlock("latest");
console.log(`Advanced local chain time by ${seconds}s (latest block timestamp ${block?.timestamp}).`);
