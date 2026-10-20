import { network } from "hardhat";

const DURATION = 1200n;

async function deployStartedAuction(ethers: any, issuer: any) {
  const saleSupply = ethers.parseUnits("1000", 18);

  const token = await (await ethers.getContractFactory("LaunchToken")).deploy(
    "Gavora",
    "GVRA",
    saleSupply,
    issuer.address
  );
  await token.waitForDeployment();

  const auction = await (await ethers.getContractFactory("DutchAuction")).deploy(
    await token.getAddress(),
    saleSupply,
    ethers.parseEther("0.02"),
    ethers.parseEther("0.005"),
    issuer.address
  );
  await auction.waitForDeployment();

  await (await token.transfer(await auction.getAddress(), saleSupply)).wait();
  await (await auction.start()).wait();

  return { token, auction, start: BigInt(await auction.startTime()) };
}

async function main() {
  const { ethers, networkHelpers } = await network.create();
  const [issuer, alice, bob, carol, refundRecipient] = await ethers.getSigners();
  const at = (timestamp: bigint) => networkHelpers.time.setNextBlockTimestamp(Number(timestamp));
  const fmt = (wei: bigint) => ethers.formatEther(wei);
  const gvra = (units: bigint) => ethers.formatUnits(units, 18);

  console.log("DutchPoint deterministic local demo");
  console.log("Falling prices. One clearing price.");
  console.log("-----------------------------------");

  console.log("\n1. Sale clears early; the crossing bid's surplus is refunded automatically");
  {
    const { auction, token, start } = await deployStartedAuction(ethers, issuer);
    await (await auction.connect(alice).contribute({ value: ethers.parseEther("6") })).wait();
    await (await auction.connect(bob).contribute({ value: ethers.parseEther("4") })).wait();
    await at(start + 700n);
    const receipt = await (await auction.connect(carol).contribute({ value: ethers.parseEther("2") })).wait();
    const refund = receipt.logs
      .map((log: any) => auction.interface.parseLog(log))
      .find((event: any) => event?.name === "SurplusRefunded");
    console.log(`Carol sent 2 ETH; ${fmt(refund.args.amount)} ETH surplus returned in the same transaction`);
    console.log(`Clearing price locked at t=700s: ${fmt(await auction.clearingPrice())} ETH/GVRA`);

    await at(start + DURATION);
    await (await auction.finalize()).wait();
    for (const [name, signer] of [["Alice", alice], ["Bob", bob], ["Carol", carol]] as const) {
      await (await auction.connect(signer).claimTokens()).wait();
      console.log(
        `${name}: committed ${fmt(await auction.commitments(signer.address))} ETH -> ${gvra(await token.balanceOf(signer.address))} GVRA`
      );
    }
    await (await auction.connect(issuer).withdrawIssuerProceeds(issuer.address)).wait();
    await (await auction.burnRemainderAfterAllClaimed()).wait();
    console.log(`Issuer proceeds withdrawn: ${fmt(await auction.issuerProceedsWithdrawn())} ETH`);
    console.log(`Rounding dust burned: ${await auction.burnedUnsold()} token units`);
  }

  console.log("\n2. Undersubscribed sale settles at reserve and burns unsold GVRA");
  {
    const { auction, token, start } = await deployStartedAuction(ethers, issuer);
    await (await auction.connect(alice).contribute({ value: ethers.parseEther("1") })).wait();
    await at(start + DURATION);
    await (await auction.finalize()).wait();
    await (await auction.connect(alice).claimTokens()).wait();

    console.log(`Final reserve price: ${fmt(await auction.finalPrice())} ETH/GVRA`);
    console.log(`Tokens claimed: ${gvra(await token.balanceOf(alice.address))} GVRA`);
    console.log(`Tokens burned: ${gvra(await auction.burnedUnsold())} GVRA`);
    console.log(`GVRA total supply now: ${gvra(await token.totalSupply())}`);
  }

  console.log("\n3. Bidder contract that rejects ETH keeps its surplus as a withdrawable credit");
  {
    const { auction, start } = await deployStartedAuction(ethers, issuer);
    const receiver = await (await ethers.getContractFactory("RejectingReceiver")).deploy(
      await auction.getAddress()
    );
    await receiver.waitForDeployment();
    const receiverAddress = await receiver.getAddress();

    await at(start + 700n);
    await (await receiver.contribute({ value: ethers.parseEther("12") })).wait();
    console.log(`Credited instead of pushed: ${fmt(await auction.refundCredits(receiverAddress))} ETH`);
    try {
      await (await receiver.withdrawToSelf()).wait();
    } catch {
      console.log("Withdrawal to the rejecting contract reverted; credit preserved");
    }
    await (await receiver.withdrawTo(refundRecipient.address)).wait();
    console.log(`Credit after withdrawing to another address: ${await auction.refundCredits(receiverAddress)} wei`);
  }

  console.log("\n4. Refund reentrancy attempt is blocked");
  {
    const { auction, start } = await deployStartedAuction(ethers, issuer);
    const selector = auction.interface.getFunction("withdrawRefundTo")!.selector;
    const attacker = await (await ethers.getContractFactory("ReentrancyAttacker")).deploy(
      await auction.getAddress(),
      selector,
      true
    );
    await attacker.waitForDeployment();

    await (await auction.connect(alice).contribute({ value: ethers.parseEther("6") })).wait();
    await (await auction.connect(bob).contribute({ value: ethers.parseEther("4") })).wait();
    await at(start + 700n);
    await (await attacker.contribute({ value: ethers.parseEther("2") })).wait();
    await (await attacker.attack()).wait();

    console.log(`Re-entry attempts: ${await attacker.reentryAttempts()}, successful: ${await attacker.reentrySuccesses()}`);
    console.log(`Attacker received only its own refund: ${fmt(await ethers.provider.getBalance(await attacker.getAddress()))} ETH`);
    console.log(`Auction still holds every bidder's ETH: ${fmt(await ethers.provider.getBalance(await auction.getAddress()))} ETH`);
  }

  console.log("\nDemo complete. All scenarios used local Hardhat accounts and test ETH.");
}

await main();
