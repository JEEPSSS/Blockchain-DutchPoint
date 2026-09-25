import { network } from "hardhat";

import { exportFrontendArtifacts } from "./lib/export-frontend.js";

async function main() {
  const { ethers } = await network.getOrCreate();
  const [issuer] = await ethers.getSigners();

  const saleSupply = ethers.parseUnits("1000", 18);
  const startPrice = ethers.parseEther("0.02");
  const reservePrice = ethers.parseEther("0.005");

  const Token = await ethers.getContractFactory("LaunchToken");
  const token = await Token.deploy("FairLaunch Token", "FAIR", saleSupply, issuer.address);
  await token.waitForDeployment();

  const Auction = await ethers.getContractFactory("DutchAuction");
  const auction = await Auction.deploy(
    await token.getAddress(),
    saleSupply,
    startPrice,
    reservePrice,
    issuer.address
  );
  await auction.waitForDeployment();

  await (await token.transfer(await auction.getAddress(), saleSupply)).wait();
  await (await auction.start()).wait();

  const networkInfo = await ethers.provider.getNetwork();
  const startedAt = (await auction.startTime()).toString();

  await exportFrontendArtifacts({
    chainId: Number(networkInfo.chainId),
    auction: await auction.getAddress(),
    token: await token.getAddress(),
    startedAt
  });

  console.log("FairLaunch local deployment complete");
  console.log(`Issuer:  ${issuer.address}`);
  console.log(`Token:   ${await token.getAddress()}`);
  console.log(`Auction: ${await auction.getAddress()}`);
  console.log(`Chain:   ${networkInfo.chainId}`);
  console.log(`Started: ${startedAt}`);
  console.log("Frontend artifacts written to src/generated/");
}

await main();
