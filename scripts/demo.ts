import { network } from "hardhat";

const DURATION = 1200n;

async function deployStartedAuction(ethers: any, issuer: any, overrides?: {
  saleSupply?: bigint;
  startPrice?: bigint;
  reservePrice?: bigint;
}) {
  const saleSupply = overrides?.saleSupply ?? ethers.parseUnits("1000", 18);
  const startPrice = overrides?.startPrice ?? ethers.parseEther("0.02");
  const reservePrice = overrides?.reservePrice ?? ethers.parseEther("0.005");

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

  return { token, auction, saleSupply, startPrice, reservePrice, start: BigInt(await auction.startTime()) };
}

async function main() {
  const { ethers, networkHelpers } = await network.create();
  const [issuer, alice, bob, carol, refundRecipient] = await ethers.getSigners();

  console.log("FairLaunch deterministic local demo");
  console.log("-----------------------------------");

  console.log("\n1. Successful sale with surplus refunds");
  {
    const { auction, token, saleSupply, start } = await deployStartedAuction(ethers, issuer);
    await (await auction.connect(alice).contribute({ value: ethers.parseEther("6") })).wait();
    await (await auction.connect(bob).contribute({ value: ethers.parseEther("4") })).wait();
    await networkHelpers.time.setNextBlockTimestamp(Number(start + 700n));
    await (await auction.connect(carol).contribute({ value: ethers.parseEther("2") })).wait();
    await networkHelpers.time.setNextBlockTimestamp(Number(start + DURATION));
    await (await auction.finalize()).wait();

    for (const signer of [alice, bob, carol]) {
      await (await auction.connect(signer).claimTokens()).wait();
      const refund = await auction.refundCredits(signer.address);
      if (refund > 0n) {
        await (await auction.connect(signer).withdrawRefundTo(signer.address)).wait();
      }
    }
    await (await auction.burnRemainderAfterAllSettled()).wait();

    console.log(`Final price: ${ethers.formatEther(await auction.finalPrice())} ETH/token`);
    console.log(`Tokens sold: ${ethers.formatUnits(saleSupply, 18)} FAIR`);
    console.log(`Burned dust/unsold: ${ethers.formatUnits(await auction.burnedUnsold(), 18)} FAIR`);
    console.log(`Auction token balance: ${ethers.formatUnits(await token.balanceOf(await auction.getAddress()), 18)}`);
  }

  console.log("\n2. Undersubscribed sale with token burn");
  {
    const { auction, token, start } = await deployStartedAuction(ethers, issuer);
    await (await auction.connect(alice).contribute({ value: ethers.parseEther("1") })).wait();
    await networkHelpers.time.setNextBlockTimestamp(Number(start + DURATION));
    await (await auction.finalize()).wait();
    await (await auction.connect(alice).claimTokens()).wait();
    if ((await token.balanceOf(await auction.getAddress())) > 0n) {
      await (await auction.burnRemainderAfterAllSettled()).wait();
    }

    console.log(`Final reserve price: ${ethers.formatEther(await auction.finalPrice())} ETH/token`);
    console.log(`Tokens claimed: ${ethers.formatUnits(await token.balanceOf(alice.address), 18)} FAIR`);
    console.log(`Tokens burned: ${ethers.formatUnits(await auction.burnedUnsold(), 18)} FAIR`);
  }

  console.log("\n3. Refund recipient that rejects ETH");
  {
    const { auction, start } = await deployStartedAuction(ethers, issuer);
    const RejectingReceiver = await ethers.getContractFactory("RejectingReceiver");
    const receiver = await RejectingReceiver.deploy(await auction.getAddress());
    await receiver.waitForDeployment();

    await networkHelpers.time.setNextBlockTimestamp(Number(start + 700n));
    await (await receiver.contribute({ value: ethers.parseEther("12") })).wait();
    await networkHelpers.time.setNextBlockTimestamp(Number(start + DURATION));
    await (await auction.finalize()).wait();
    await (await receiver.claimTokens()).wait();

    const credit = await auction.refundCredits(await receiver.getAddress());
    try {
      await (await receiver.withdrawToSelf()).wait();
    } catch {
      console.log(`Rejected direct refund preserved credit: ${ethers.formatEther(credit)} ETH`);
    }
    await (await receiver.withdrawTo(refundRecipient.address)).wait();
    console.log(`Alternate recipient refund credit after withdrawal: ${await auction.refundCredits(await receiver.getAddress())} wei`);
  }

  console.log("\n4. Blocked refund reentrancy attempt");
  {
    const { auction, start } = await deployStartedAuction(ethers, issuer);
    const Attacker = await ethers.getContractFactory("ReentrantRefundAttacker");
    const attacker = await Attacker.deploy(await auction.getAddress());
    await attacker.waitForDeployment();

    await networkHelpers.time.setNextBlockTimestamp(Number(start + 700n));
    await (await attacker.contribute({ value: ethers.parseEther("12") })).wait();
    await networkHelpers.time.setNextBlockTimestamp(Number(start + DURATION));
    await (await auction.finalize()).wait();
    await (await attacker.attackWithdraw()).wait();

    console.log(`Reentry succeeded: ${await attacker.reentrySucceeded()}`);
    console.log(`Remaining attacker refund credit: ${await auction.refundCredits(await attacker.getAddress())} wei`);
  }

  console.log("\nDemo complete. All scenarios used local Hardhat accounts and test ETH.");
}

await main();
