import { expect } from "chai";
import { network } from "hardhat";

const TOKEN_SCALE = 10n ** 18n;
const DURATION = 1200n;

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

function cost(tokens: bigint, price: bigint): bigint {
  if (tokens === 0n) {
    return 0n;
  }
  return ceilDiv(tokens * price, TOKEN_SCALE);
}

async function deployAuction(options?: {
  saleSupply?: bigint;
  startPrice?: bigint;
  reservePrice?: bigint;
}) {
  const connection = await network.create();
  const { ethers, networkHelpers } = connection;
  const [issuer, alice, bob, carol, other, recipient] = await ethers.getSigners();

  const saleSupply = options?.saleSupply ?? ethers.parseUnits("1000", 18);
  const startPrice = options?.startPrice ?? ethers.parseEther("0.02");
  const reservePrice = options?.reservePrice ?? ethers.parseEther("0.005");

  const Token = await ethers.getContractFactory("LaunchToken");
  const token = (await Token.deploy("FairLaunch Token", "FAIR", saleSupply, issuer.address)) as any;
  await token.waitForDeployment();

  const Auction = await ethers.getContractFactory("DutchAuction");
  const auction = (await Auction.deploy(
    await token.getAddress(),
    saleSupply,
    startPrice,
    reservePrice,
    issuer.address
  )) as any;
  await auction.waitForDeployment();

  await token.connect(issuer).transfer(await auction.getAddress(), saleSupply);

  return {
    ethers,
    networkHelpers,
    issuer,
    alice,
    bob,
    carol,
    other,
    recipient,
    token,
    auction,
    saleSupply,
    startPrice,
    reservePrice
  };
}

async function startAuction(fixture: Awaited<ReturnType<typeof deployAuction>>) {
  const tx = await fixture.auction.connect(fixture.issuer).start();
  await tx.wait();
  return BigInt(await fixture.auction.startTime());
}

async function setNextTimestamp(
  fixture: Awaited<ReturnType<typeof deployAuction>>,
  timestamp: bigint
) {
  await fixture.networkHelpers.time.setNextBlockTimestamp(Number(timestamp));
}

describe("FairLaunch DutchAuction", function () {
  it("uses the required 1,200 second duration and deterministic price decay", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    expect(await f.auction.AUCTION_DURATION()).to.equal(DURATION);
    expect(await f.auction.priceAt(start)).to.equal(f.startPrice);
    expect(await f.auction.priceAt(start + 400n)).to.equal(f.ethers.parseEther("0.015"));
    expect(await f.auction.priceAt(start + 800n)).to.equal(f.ethers.parseEther("0.01"));
    expect(await f.auction.priceAt(start + DURATION)).to.equal(f.reservePrice);
    expect(await f.auction.priceAt(start + DURATION + 100n)).to.equal(f.reservePrice);
  });

  it("is monotonic and never falls below reserve", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);
    let previous = await f.auction.priceAt(start);

    for (const elapsed of [1n, 60n, 240n, 600n, 900n, 1199n, 1200n, 1500n]) {
      const price = await f.auction.priceAt(start + elapsed);
      expect(price).to.be.lessThanOrEqual(previous);
      expect(price).to.be.greaterThanOrEqual(f.reservePrice);
      previous = price;
    }
  });

  it("rejects contributions before opening and after closing", async function () {
    const f = await deployAuction();

    await expect(
      f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(f.auction, "AuctionNotStarted");

    const start = await startAuction(f);
    await setNextTimestamp(f, start + DURATION);

    await expect(
      f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(f.auction, "AuctionClosed");
  });

  it("handles no contributors by burning the full sale inventory", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);
    await setNextTimestamp(f, start + DURATION);

    await f.auction.finalize();

    expect(await f.auction.finalized()).to.equal(true);
    expect(await f.auction.cleared()).to.equal(false);
    expect(await f.auction.burnedUnsold()).to.equal(f.saleSupply);
    expect(await f.token.balanceOf(await f.auction.getAddress())).to.equal(0n);
    expect(await f.token.totalSupply()).to.equal(0n);
  });

  it("settles an undersubscribed sale at reserve and burns unsold tokens", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("1") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    const sold = f.ethers.parseUnits("200", 18);
    expect(await f.auction.cleared()).to.equal(false);
    expect(await f.auction.finalPrice()).to.equal(f.reservePrice);
    expect(await f.auction.totalTokensSold()).to.equal(sold);
    expect(await f.auction.burnedUnsold()).to.equal(f.saleSupply - sold);

    await f.auction.connect(f.alice).claimTokens();
    expect(await f.token.balanceOf(f.alice.address)).to.equal(sold);
    expect(await f.auction.acceptedEthByAccount(f.alice.address)).to.equal(f.ethers.parseEther("1"));
  });

  it("locks clearing before the deadline but permits settlement only after 1,200 seconds", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
    await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("4") });
    await setNextTimestamp(f, start + 700n);
    await f.auction.connect(f.carol).contribute({ value: f.ethers.parseEther("2") });

    const clearingPrice = f.ethers.parseEther("0.01125");
    expect(await f.auction.clearingTime()).to.equal(start + 700n);
    expect(await f.auction.clearingPrice()).to.equal(clearingPrice);

    await expect(f.auction.finalize()).to.be.revertedWithCustomError(
      f.auction,
      "AuctionNotFinalizable"
    );

    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    expect(await f.auction.cleared()).to.equal(true);
    expect(await f.auction.finalPrice()).to.equal(clearingPrice);
  });

  it("detects clearing caused by time passing without a new contribution", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("10") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    expect(await f.auction.cleared()).to.equal(true);
    expect(await f.auction.clearingTime()).to.equal(start + 800n);
    expect(await f.auction.finalPrice()).to.equal(f.ethers.parseEther("0.01"));
  });

  it("credits surplus refunds when a contribution crosses the clearing threshold", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
    await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("4") });
    await setNextTimestamp(f, start + 700n);
    await f.auction.connect(f.carol).contribute({ value: f.ethers.parseEther("2") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    const [, aliceTokens, aliceAccepted, aliceRefund] = await f.auction.settlementOf(
      f.alice.address
    );
    const [, bobTokens, , bobRefund] = await f.auction.settlementOf(f.bob.address);
    const [, carolTokens, , carolRefund] = await f.auction.settlementOf(f.carol.address);

    expect(aliceTokens).to.equal(f.ethers.parseUnits("500", 18));
    expect(bobTokens).to.equal((f.saleSupply * 4n) / 12n);
    expect(carolTokens).to.equal((f.saleSupply * 2n) / 12n);
    expect(aliceAccepted).to.equal(cost(aliceTokens, await f.auction.finalPrice()));
    expect(aliceRefund).to.equal(f.ethers.parseEther("6") - aliceAccepted);
    expect(aliceRefund + bobRefund + carolRefund).to.be.greaterThan(0n);
  });

  it("aggregates multiple contributions by one wallet", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("2") });
    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("3") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    expect(await f.auction.participantCount()).to.equal(1n);
    expect(await f.auction.commitments(f.alice.address)).to.equal(f.ethers.parseEther("5"));
    expect(await f.auction.finalPrice()).to.equal(f.ethers.parseEther("0.005"));
  });

  it("handles tiny commitments, rounding, and residual dust burning", async function () {
    const f = await deployAuction({
      saleSupply: 10n * TOKEN_SCALE,
      startPrice: 6n,
      reservePrice: 3n
    });
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: 1n });
    await f.auction.connect(f.bob).contribute({ value: 1n });
    await f.auction.connect(f.carol).contribute({ value: 1n });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    expect(await f.auction.totalTokensSold()).to.equal(TOKEN_SCALE);
    expect(await f.auction.burnedUnsold()).to.equal(9n * TOKEN_SCALE);

    await f.auction.connect(f.alice).claimTokens();
    await f.auction.connect(f.bob).claimTokens();
    await f.auction.connect(f.carol).claimTokens();

    expect(await f.token.balanceOf(await f.auction.getAddress())).to.equal(1n);
    await f.auction.burnRemainderAfterAllSettled();
    expect(await f.auction.burnedUnsold()).to.equal(9n * TOKEN_SCALE + 1n);
    expect(await f.token.balanceOf(await f.auction.getAddress())).to.equal(0n);
  });

  it("applies one uniform final price to all settled participants", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
    await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("4") });
    await setNextTimestamp(f, start + 700n);
    await f.auction.connect(f.carol).contribute({ value: f.ethers.parseEther("2") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    const finalPrice = await f.auction.finalPrice();
    for (const signer of [f.alice, f.bob, f.carol]) {
      const [, tokens, acceptedEth] = await f.auction.settlementOf(signer.address);
      expect(acceptedEth).to.equal(cost(tokens, finalPrice));
    }
  });

  it("keeps settlement independent of claim order", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
    await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("4") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    const [, aliceTokens, aliceAccepted, aliceRefund] = await f.auction.settlementOf(
      f.alice.address
    );
    const [, bobTokens, bobAccepted, bobRefund] = await f.auction.settlementOf(f.bob.address);

    await f.auction.connect(f.bob).claimTokens();
    await f.auction.connect(f.alice).claimTokens();

    expect(await f.auction.tokensClaimedByAccount(f.alice.address)).to.equal(aliceTokens);
    expect(await f.auction.acceptedEthByAccount(f.alice.address)).to.equal(aliceAccepted);
    expect(await f.auction.refundCredits(f.alice.address)).to.equal(aliceRefund);
    expect(await f.auction.tokensClaimedByAccount(f.bob.address)).to.equal(bobTokens);
    expect(await f.auction.acceptedEthByAccount(f.bob.address)).to.equal(bobAccepted);
    expect(await f.auction.refundCredits(f.bob.address)).to.equal(bobRefund);
  });

  it("prevents duplicate claims and duplicate refund withdrawals", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("8") });
    await setNextTimestamp(f, start + 700n);
    await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("5") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    await f.auction.connect(f.alice).claimTokens();
    await expect(f.auction.connect(f.alice).claimTokens()).to.be.revertedWithCustomError(
      f.auction,
      "AlreadySettled"
    );

    await f.auction.connect(f.alice).withdrawRefundTo(f.alice.address);
    await expect(
      f.auction.connect(f.alice).withdrawRefundTo(f.alice.address)
    ).to.be.revertedWithCustomError(f.auction, "NoRefundAvailable");
  });

  it("rejects early and repeated finalization", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await expect(f.auction.finalize()).to.be.revertedWithCustomError(
      f.auction,
      "AuctionNotFinalizable"
    );

    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    await expect(f.auction.finalize()).to.be.revertedWithCustomError(
      f.auction,
      "AuctionAlreadyFinalized"
    );
  });

  it("enforces owner-only start and proceeds withdrawal", async function () {
    const f = await deployAuction();

    await expect(f.auction.connect(f.alice).start())
      .to.be.revertedWithCustomError(f.auction, "OwnableUnauthorizedAccount")
      .withArgs(f.alice.address);
    const start = await startAuction(f);
    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("1") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();
    await f.auction.connect(f.alice).claimTokens();

    await expect(f.auction.connect(f.alice).withdrawIssuerProceeds(f.alice.address))
      .to.be.revertedWithCustomError(f.auction, "OwnableUnauthorizedAccount")
      .withArgs(f.alice.address);

    await f.auction.connect(f.issuer).withdrawIssuerProceeds(f.issuer.address);
    expect(await f.auction.issuerProceedsWithdrawn()).to.equal(f.ethers.parseEther("1"));
  });

  it("preserves refund credit when a receiver rejects ETH and allows alternate recipient withdrawal", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);
    const RejectingReceiver = await f.ethers.getContractFactory("RejectingReceiver");
    const receiver = (await RejectingReceiver.deploy(await f.auction.getAddress())) as any;
    await receiver.waitForDeployment();

    await setNextTimestamp(f, start + 700n);
    await receiver.contribute({ value: f.ethers.parseEther("12") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();
    await receiver.claimTokens();

    const creditBefore = await f.auction.refundCredits(await receiver.getAddress());
    await expect(receiver.withdrawToSelf()).to.be.revertedWithCustomError(
      f.auction,
      "RefundTransferFailed"
    );
    expect(await f.auction.refundCredits(await receiver.getAddress())).to.equal(creditBefore);

    await receiver.withdrawTo(f.recipient.address);
    expect(await f.auction.refundCredits(await receiver.getAddress())).to.equal(0n);
  });

  it("blocks a malicious receiver attempting refund reentrancy", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);
    const Attacker = await f.ethers.getContractFactory("ReentrantRefundAttacker");
    const attacker = (await Attacker.deploy(await f.auction.getAddress())) as any;
    await attacker.waitForDeployment();

    await setNextTimestamp(f, start + 700n);
    await attacker.contribute({ value: f.ethers.parseEther("12") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    await attacker.attackWithdraw();

    expect(await attacker.reentrySucceeded()).to.equal(false);
    expect(await f.auction.refundCredits(await attacker.getAddress())).to.equal(0n);
  });

  it("conserves tracked ETH and token accounting across settlement", async function () {
    const f = await deployAuction();
    const start = await startAuction(f);

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
    await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("4") });
    await setNextTimestamp(f, start + 700n);
    await f.auction.connect(f.carol).contribute({ value: f.ethers.parseEther("2") });
    await setNextTimestamp(f, start + DURATION);
    await f.auction.finalize();

    for (const signer of [f.alice, f.bob, f.carol]) {
      await f.auction.connect(signer).claimTokens();
      await f.auction.connect(signer).withdrawRefundTo(signer.address);
    }

    await f.auction.burnRemainderAfterAllSettled();

    const claimed =
      (await f.auction.tokensClaimedByAccount(f.alice.address)) +
      (await f.auction.tokensClaimedByAccount(f.bob.address)) +
      (await f.auction.tokensClaimedByAccount(f.carol.address));
    const burned = await f.auction.burnedUnsold();

    expect(claimed + burned).to.equal(f.saleSupply);
    expect(await f.auction.refundLiability()).to.equal(0n);
    expect(await f.auction.issuerProceedsAvailable()).to.equal(
      (await f.auction.acceptedEthByAccount(f.alice.address)) +
        (await f.auction.acceptedEthByAccount(f.bob.address)) +
        (await f.auction.acceptedEthByAccount(f.carol.address))
    );
  });
});
