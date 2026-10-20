import { expect } from "chai";
import { network } from "hardhat";

// Bonus requirement: demonstrate reentrancy attack resistance.
// The same attacker contract is pointed at a deliberately vulnerable auction and at
// DutchAuction. Against the first it drains other bidders' ETH; against the second it only
// ever receives its own refund.

describe("Reentrancy demonstration", function () {
  it("drains a naive auction whose refund sends ETH before clearing the credit", async function () {
    const { ethers } = await network.create();
    const [, alice, bob] = await ethers.getSigners();

    const vulnerable = (await (await ethers.getContractFactory("VulnerableAuction")).deploy(
      ethers.parseEther("10")
    )) as any;
    const vulnerableAddress = await vulnerable.getAddress();
    const selector = vulnerable.interface.getFunction("withdrawRefund")!.selector;
    const attacker = (await (await ethers.getContractFactory("ReentrancyAttacker")).deploy(
      vulnerableAddress,
      selector,
      false
    )) as any;

    // Honest bidders fill the 10 ETH sale.
    await vulnerable.connect(alice).contribute({ value: ethers.parseEther("6") });
    await vulnerable.connect(bob).contribute({ value: ethers.parseEther("4") });
    // The attacker's 1 ETH arrives after the sale is full, so it is credited as a refund.
    await attacker.contribute({ value: ethers.parseEther("1") });
    expect(await vulnerable.refundCredits(await attacker.getAddress())).to.equal(
      ethers.parseEther("1")
    );

    await attacker.attack();

    // The attacker re-entered ten times and took all 11 ETH, including Alice's and Bob's.
    expect(await attacker.reentrySuccesses()).to.equal(10n);
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(
      ethers.parseEther("11")
    );
    expect(await ethers.provider.getBalance(vulnerableAddress)).to.equal(0n);
    // The contract still believes it holds the honest bidders' 10 ETH.
    expect(await vulnerable.totalCommitted()).to.equal(ethers.parseEther("10"));
  });

  it("pays the same attacker only its own refund from DutchAuction", async function () {
    const { ethers, networkHelpers } = await network.create();
    const [issuer, alice, bob] = await ethers.getSigners();

    const saleSupply = ethers.parseUnits("1000", 18);
    const token = (await (await ethers.getContractFactory("LaunchToken")).deploy(
      "Gavora",
      "GVRA",
      saleSupply,
      issuer.address
    )) as any;
    const auction = (await (await ethers.getContractFactory("DutchAuction")).deploy(
      await token.getAddress(),
      saleSupply,
      ethers.parseEther("0.02"),
      ethers.parseEther("0.005"),
      issuer.address
    )) as any;
    const auctionAddress = await auction.getAddress();
    await token.transfer(auctionAddress, saleSupply);
    await auction.start();
    const start = BigInt(await auction.startTime());

    const selector = auction.interface.getFunction("withdrawRefundTo")!.selector;
    const attacker = (await (await ethers.getContractFactory("ReentrancyAttacker")).deploy(
      auctionAddress,
      selector,
      true
    )) as any;

    await auction.connect(alice).contribute({ value: ethers.parseEther("6") });
    await auction.connect(bob).contribute({ value: ethers.parseEther("4") });
    await networkHelpers.time.setNextBlockTimestamp(Number(start + 700n));
    // Crossing bid: 1.25 ETH accepted, 0.75 ETH surplus credited because the attacker rejects pushes.
    await attacker.contribute({ value: ethers.parseEther("2") });

    await attacker.attack();

    expect(await attacker.reentryAttempts()).to.equal(1n);
    expect(await attacker.reentrySuccesses()).to.equal(0n);
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(
      ethers.parseEther("0.75")
    );
    // Every accepted wei is still held for the issuer.
    expect(await ethers.provider.getBalance(auctionAddress)).to.equal(ethers.parseEther("11.25"));
    expect(await auction.totalCommitted()).to.equal(ethers.parseEther("11.25"));
  });
});
