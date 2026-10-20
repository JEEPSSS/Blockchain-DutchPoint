import { expect } from "chai";
import { network } from "hardhat";

const TOKEN_SCALE = 10n ** 18n;
const DURATION = 1200n;

const Status = {
  Pending: 0n,
  Active: 1n,
  Cleared: 2n,
  AwaitingFinalization: 3n,
  Finalized: 4n
};

function tokensFor(commitment: bigint, price: bigint): bigint {
  return (commitment * TOKEN_SCALE) / price;
}

async function deployAuction(options?: {
  saleSupply?: bigint;
  startPrice?: bigint;
  reservePrice?: bigint;
  fund?: boolean;
}) {
  const connection = await network.create();
  const { ethers, networkHelpers } = connection;
  const [issuer, alice, bob, carol, other, recipient] = await ethers.getSigners();

  const saleSupply = options?.saleSupply ?? ethers.parseUnits("1000", 18);
  const startPrice = options?.startPrice ?? ethers.parseEther("0.02");
  const reservePrice = options?.reservePrice ?? ethers.parseEther("0.005");

  const Token = await ethers.getContractFactory("GavoraToken");
  const token = (await Token.deploy(saleSupply, issuer.address)) as any;
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

  if (options?.fund ?? true) {
    await token.connect(issuer).transfer(await auction.getAddress(), saleSupply);
  }

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
    Auction,
    saleSupply,
    startPrice,
    reservePrice
  };
}

type Fixture = Awaited<ReturnType<typeof deployAuction>>;

async function startAuction(f: Fixture) {
  await (await f.auction.connect(f.issuer).start()).wait();
  return BigInt(await f.auction.startTime());
}

async function at(f: Fixture, timestamp: bigint) {
  await f.networkHelpers.time.setNextBlockTimestamp(Number(timestamp));
}

/** Alice 6 ETH and Bob 4 ETH early; Carol's 2 ETH at t=700 crosses the 11.25 ETH threshold. */
async function clearWithCrossingBid(f: Fixture, start: bigint) {
  await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
  await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("4") });
  await at(f, start + 700n);
  return f.auction.connect(f.carol).contribute({ value: f.ethers.parseEther("2") });
}

describe("DutchPoint DutchAuction", function () {
  describe("configuration", function () {
    it("rejects invalid constructor parameters", async function () {
      const f = await deployAuction();
      const tokenAddress = await f.token.getAddress();
      const one = f.ethers.parseEther("1");

      await expect(
        f.Auction.deploy(f.ethers.ZeroAddress, f.saleSupply, one, 1n, f.issuer.address)
      ).to.be.revertedWithCustomError(f.auction, "InvalidAddress");
      await expect(
        f.Auction.deploy(tokenAddress, f.saleSupply, one, one, f.issuer.address)
      ).to.be.revertedWithCustomError(f.auction, "InvalidPrices");
      await expect(
        f.Auction.deploy(tokenAddress, f.saleSupply, one, 0n, f.issuer.address)
      ).to.be.revertedWithCustomError(f.auction, "InvalidPrices");
      await expect(
        f.Auction.deploy(tokenAddress, 0n, one, 1n, f.issuer.address)
      ).to.be.revertedWithCustomError(f.auction, "InvalidSaleSupply");
      // 1 token unit at 1 wei per whole token is worth less than 1 wei.
      await expect(
        f.Auction.deploy(tokenAddress, 1n, one, 1n, f.issuer.address)
      ).to.be.revertedWithCustomError(f.auction, "InvalidSaleSupply");
    });

    it("only starts once, only by the owner, and only when funded", async function () {
      const f = await deployAuction({ fund: false });

      await expect(f.auction.connect(f.alice).start())
        .to.be.revertedWithCustomError(f.auction, "OwnableUnauthorizedAccount")
        .withArgs(f.alice.address);
      await expect(f.auction.connect(f.issuer).start())
        .to.be.revertedWithCustomError(f.auction, "AuctionNotFunded")
        .withArgs(f.saleSupply, 0n);

      await f.token.connect(f.issuer).transfer(await f.auction.getAddress(), f.saleSupply);
      await startAuction(f);
      await expect(f.auction.connect(f.issuer).start()).to.be.revertedWithCustomError(
        f.auction,
        "AuctionAlreadyStarted"
      );
    });
  });

  describe("price", function () {
    it("decays linearly over exactly 1,200 seconds", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);

      expect(await f.auction.AUCTION_DURATION()).to.equal(DURATION);
      expect(await f.auction.endTime()).to.equal(start + DURATION);
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
  });

  describe("bidding", function () {
    it("rejects contributions before opening, of zero value, and after closing", async function () {
      const f = await deployAuction();

      await expect(
        f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(f.auction, "AuctionNotStarted");

      const start = await startAuction(f);
      await expect(
        f.auction.connect(f.alice).contribute({ value: 0n })
      ).to.be.revertedWithCustomError(f.auction, "ZeroContribution");

      await at(f, start + DURATION);
      await expect(
        f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(f.auction, "AuctionClosed");
    });

    it("accepts plain ETH transfers as contributions", async function () {
      const f = await deployAuction();
      await startAuction(f);

      await f.alice.sendTransaction({
        to: await f.auction.getAddress(),
        value: f.ethers.parseEther("1")
      });

      expect(await f.auction.commitments(f.alice.address)).to.equal(f.ethers.parseEther("1"));
      expect(await f.auction.participantCount()).to.equal(1n);
    });

    it("aggregates multiple contributions by one wallet", async function () {
      const f = await deployAuction();
      await startAuction(f);

      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("2") });
      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("3") });

      expect(await f.auction.participantCount()).to.equal(1n);
      expect(await f.auction.commitments(f.alice.address)).to.equal(f.ethers.parseEther("5"));
    });

    it("accepts a crossing bid only up to capacity and refunds the surplus in the same transaction", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      const price = f.ethers.parseEther("0.01125");

      const tx = await clearWithCrossingBid(f, start);

      await expect(tx)
        .to.emit(f.auction, "ContributionReceived")
        .withArgs(
          f.carol.address,
          f.ethers.parseEther("2"),
          f.ethers.parseEther("1.25"),
          price,
          f.ethers.parseEther("11.25")
        );
      await expect(tx)
        .to.emit(f.auction, "SurplusRefunded")
        .withArgs(f.carol.address, f.ethers.parseEther("0.75"));
      await expect(tx).to.changeEtherBalances(
        f.ethers,
        [f.carol, f.auction],
        [-f.ethers.parseEther("1.25"), f.ethers.parseEther("1.25")]
      );

      expect(await f.auction.clearingTime()).to.equal(start + 700n);
      expect(await f.auction.clearingPrice()).to.equal(price);
      expect(await f.auction.commitments(f.carol.address)).to.equal(f.ethers.parseEther("1.25"));
      expect(await f.auction.totalCommitted()).to.equal(await f.auction.maxCommitmentAt(price));
      expect(await f.auction.refundCredits(f.carol.address)).to.equal(0n);
    });

    it("rejects bids once the auction has cleared by a crossing bid", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      await clearWithCrossingBid(f, start);

      await expect(
        f.auction.connect(f.other).contribute({ value: f.ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(f.auction, "AuctionAlreadyCleared");
    });

    it("rejects bids once falling prices alone have cleared the auction", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);

      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("10") });
      await at(f, start + 801n);

      await expect(
        f.auction.connect(f.other).contribute({ value: f.ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(f.auction, "AuctionAlreadyCleared");
    });

    it("reports remaining capacity while active and zero once cleared", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);

      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
      await f.networkHelpers.time.increaseTo(Number(start + 400n));
      // 1,000 tokens at 0.015 ETH need 15 ETH; 6 ETH is committed.
      expect(await f.auction.remainingCapacity()).to.equal(f.ethers.parseEther("9"));

      await at(f, start + 401n);
      await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("20") });
      expect(await f.auction.remainingCapacity()).to.equal(0n);
    });
  });

  describe("status and views", function () {
    it("moves through Pending, Active, Cleared, AwaitingFinalization and Finalized", async function () {
      const f = await deployAuction();
      expect(await f.auction.status()).to.equal(Status.Pending);

      const start = await startAuction(f);
      expect(await f.auction.status()).to.equal(Status.Active);

      await clearWithCrossingBid(f, start);
      expect(await f.auction.status()).to.equal(Status.Cleared);
      expect(await f.auction.currentPrice()).to.equal(f.ethers.parseEther("0.01125"));

      await f.networkHelpers.time.increaseTo(Number(start + DURATION));
      expect(await f.auction.status()).to.equal(Status.AwaitingFinalization);

      await f.auction.finalize();
      expect(await f.auction.status()).to.equal(Status.Finalized);
    });

    it("quotes a lower-bound allocation before finalization and the exact one after", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);

      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("3") });
      await f.networkHelpers.time.increaseTo(Number(start + 400n));
      const [early, earlyFinal] = await f.auction.tokensOwed(f.alice.address);
      expect(earlyFinal).to.equal(false);
      expect(early).to.equal(tokensFor(f.ethers.parseEther("3"), f.ethers.parseEther("0.015")));

      await at(f, start + DURATION);
      await f.auction.finalize();
      const [final, isFinal] = await f.auction.tokensOwed(f.alice.address);
      expect(isFinal).to.equal(true);
      expect(final).to.equal(tokensFor(f.ethers.parseEther("3"), f.reservePrice));
      expect(final).to.be.greaterThan(early);
    });
  });

  describe("edge cases", function () {
    it("returns neutral values from every view before the auction starts", async function () {
      const f = await deployAuction();

      expect(await f.auction.endTime()).to.equal(0n);
      expect(await f.auction.clearingState()).to.deep.equal([false, 0n, 0n]);
      expect(await f.auction.currentPrice()).to.equal(f.startPrice);
      expect(await f.auction.remainingCapacity()).to.equal(0n);
      expect(await f.auction.tokensOwed(f.alice.address)).to.deep.equal([0n, false]);
    });

    it("quotes the live price while active and the final price after finalization", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);

      await f.networkHelpers.time.increaseTo(Number(start + 400n));
      expect(await f.auction.currentPrice()).to.equal(f.ethers.parseEther("0.015"));

      await f.networkHelpers.time.increaseTo(Number(start + DURATION));
      await f.auction.finalize();
      expect(await f.auction.currentPrice()).to.equal(f.reservePrice);
    });

    it("rejects the zero address as a refund or proceeds recipient", async function () {
      const f = await deployAuction();
      await startAuction(f);

      await expect(
        f.auction.connect(f.alice).withdrawRefundTo(f.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(f.auction, "InvalidAddress");
      await expect(
        f.auction.connect(f.issuer).withdrawIssuerProceeds(f.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(f.auction, "InvalidAddress");
    });

    it("keeps proceeds available when the issuer's recipient rejects ETH", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      const RejectingReceiver = await f.ethers.getContractFactory("RejectingReceiver");
      const rejecting = (await RejectingReceiver.deploy(await f.auction.getAddress())) as any;

      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("1") });
      await at(f, start + DURATION);
      await f.auction.finalize();

      await expect(
        f.auction.connect(f.issuer).withdrawIssuerProceeds(await rejecting.getAddress())
      ).to.be.revertedWithCustomError(f.auction, "ProceedsTransferFailed");
      expect(await f.auction.issuerProceedsWithdrawn()).to.equal(0n);
    });

    it("refuses to burn remaining tokens before finalization", async function () {
      const f = await deployAuction();
      await startAuction(f);

      await expect(f.auction.burnRemainderAfterAllClaimed()).to.be.revertedWithCustomError(
        f.auction,
        "AuctionNotFinalized"
      );
    });

    it("never dates a time-based clearing before the commitment that funded it", async function () {
      // Wei-scale prices change only every 400 seconds, so the price at which 59 wei buys the
      // 10-token supply (ceil(5.9) = 6 wei) was already reached at the start of the auction.
      const f = await deployAuction({
        saleSupply: 10n * TOKEN_SCALE,
        startPrice: 6n,
        reservePrice: 3n
      });
      const start = await startAuction(f);

      await at(f, start + 100n);
      await f.auction.connect(f.alice).contribute({ value: 59n });

      expect(await f.auction.clearingState()).to.deep.equal([true, 6n, start + 100n]);
      await at(f, start + 101n);
      await expect(
        f.auction.connect(f.bob).contribute({ value: 1n })
      ).to.be.revertedWithCustomError(f.auction, "AuctionAlreadyCleared");

      await at(f, start + DURATION);
      await f.auction.finalize();
      expect(await f.auction.clearingTime()).to.equal(start + 100n);
      expect(await f.auction.totalTokensSold()).to.be.lessThanOrEqual(f.saleSupply);
    });
  });

  describe("finalization", function () {
    it("rejects early and repeated finalization", async function () {
      const f = await deployAuction();
      await expect(f.auction.finalize()).to.be.revertedWithCustomError(f.auction, "AuctionNotStarted");

      const start = await startAuction(f);
      await expect(f.auction.finalize())
        .to.be.revertedWithCustomError(f.auction, "AuctionNotFinalizable")
        .withArgs(start + DURATION);

      await at(f, start + DURATION);
      await f.auction.finalize();
      await expect(f.auction.finalize()).to.be.revertedWithCustomError(
        f.auction,
        "AuctionAlreadyFinalized"
      );
    });

    it("burns the full inventory when nobody bids", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      await at(f, start + DURATION);

      await f.auction.finalize();

      expect(await f.auction.cleared()).to.equal(false);
      expect(await f.auction.burnedUnsold()).to.equal(f.saleSupply);
      expect(await f.token.balanceOf(await f.auction.getAddress())).to.equal(0n);
      expect(await f.token.totalSupply()).to.equal(0n);
    });

    it("settles an undersubscribed sale at reserve and burns unsold tokens", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);

      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("1") });
      await at(f, start + DURATION);
      await f.auction.finalize();

      const sold = f.ethers.parseUnits("200", 18);
      expect(await f.auction.cleared()).to.equal(false);
      expect(await f.auction.finalPrice()).to.equal(f.reservePrice);
      expect(await f.auction.totalTokensSold()).to.equal(sold);
      expect(await f.auction.burnedUnsold()).to.equal(f.saleSupply - sold);
      expect(await f.token.totalSupply()).to.equal(sold);

      await f.auction.connect(f.alice).claimTokens();
      expect(await f.token.balanceOf(f.alice.address)).to.equal(sold);
    });

    it("locks a crossing-bid clearing before the deadline but settles only after 1,200 seconds", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      await clearWithCrossingBid(f, start);

      await expect(f.auction.finalize()).to.be.revertedWithCustomError(
        f.auction,
        "AuctionNotFinalizable"
      );

      await at(f, start + DURATION);
      await f.auction.finalize();

      expect(await f.auction.cleared()).to.equal(true);
      expect(await f.auction.finalPrice()).to.equal(f.ethers.parseEther("0.01125"));
    });

    it("finds the exact clearing point when falling prices alone clear the auction", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);

      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("10") });
      await at(f, start + DURATION);
      await expect(f.auction.finalize())
        .to.emit(f.auction, "AuctionCleared")
        .withArgs(start + 800n, f.ethers.parseEther("0.01"), f.ethers.parseEther("10"));

      expect(await f.auction.cleared()).to.equal(true);
      expect(await f.auction.finalPrice()).to.equal(f.ethers.parseEther("0.01"));
      expect(await f.auction.totalTokensSold()).to.equal(f.saleSupply);
      expect(await f.auction.burnedUnsold()).to.equal(0n);
    });

    it("rounds a time-based clearing price up so claims never exceed supply", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);

      // 7 ETH + 1 wei for 1,000 tokens: the exact clearing price is fractional.
      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("7") + 1n });
      await at(f, start + DURATION);
      await f.auction.finalize();

      const finalPrice = await f.auction.finalPrice();
      expect(finalPrice).to.equal(f.ethers.parseEther("0.007") + 1n);
      expect(await f.auction.totalTokensSold()).to.be.lessThanOrEqual(f.saleSupply);
    });
  });

  describe("claims", function () {
    it("fills earlier bidders in full and charges everyone the same final price", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      await clearWithCrossingBid(f, start);
      await at(f, start + DURATION);
      await f.auction.finalize();

      const finalPrice = await f.auction.finalPrice();
      for (const signer of [f.alice, f.bob, f.carol]) {
        await f.auction.connect(signer).claimTokens();
        const commitment = await f.auction.commitments(signer.address);
        expect(await f.token.balanceOf(signer.address)).to.equal(tokensFor(commitment, finalPrice));
      }
      expect(await f.token.balanceOf(f.alice.address)).to.equal(
        tokensFor(f.ethers.parseEther("6"), finalPrice)
      );
    });

    it("keeps claims independent of claim order", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
      await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("4") });
      await at(f, start + DURATION);
      await f.auction.finalize();

      const [aliceOwed] = await f.auction.tokensOwed(f.alice.address);
      const [bobOwed] = await f.auction.tokensOwed(f.bob.address);

      await f.auction.connect(f.bob).claimTokens();
      await f.auction.connect(f.alice).claimTokens();

      expect(await f.auction.tokensClaimed(f.alice.address)).to.equal(aliceOwed);
      expect(await f.auction.tokensClaimed(f.bob.address)).to.equal(bobOwed);
    });

    it("rejects claims before finalization, without a commitment, and twice", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("1") });

      await expect(f.auction.connect(f.alice).claimTokens()).to.be.revertedWithCustomError(
        f.auction,
        "AuctionNotFinalized"
      );

      await at(f, start + DURATION);
      await f.auction.finalize();

      await expect(f.auction.connect(f.bob).claimTokens()).to.be.revertedWithCustomError(
        f.auction,
        "NoCommitment"
      );
      await f.auction.connect(f.alice).claimTokens();
      await expect(f.auction.connect(f.alice).claimTokens()).to.be.revertedWithCustomError(
        f.auction,
        "AlreadyClaimed"
      );
    });

    it("burns rounding dust only after every participant has claimed", async function () {
      const f = await deployAuction({
        saleSupply: 10n * TOKEN_SCALE,
        startPrice: 6n,
        reservePrice: 3n
      });
      const start = await startAuction(f);

      await f.auction.connect(f.alice).contribute({ value: 1n });
      await f.auction.connect(f.bob).contribute({ value: 1n });
      await f.auction.connect(f.carol).contribute({ value: 1n });
      await at(f, start + DURATION);
      await f.auction.finalize();

      expect(await f.auction.totalTokensSold()).to.equal(TOKEN_SCALE);
      expect(await f.auction.burnedUnsold()).to.equal(9n * TOKEN_SCALE);

      await f.auction.connect(f.alice).claimTokens();
      await f.auction.connect(f.bob).claimTokens();
      await expect(f.auction.burnRemainderAfterAllClaimed())
        .to.be.revertedWithCustomError(f.auction, "OutstandingClaims")
        .withArgs(2n, 3n);

      await f.auction.connect(f.carol).claimTokens();
      expect(await f.token.balanceOf(await f.auction.getAddress())).to.equal(1n);
      await f.auction.burnRemainderAfterAllClaimed();
      expect(await f.auction.burnedUnsold()).to.equal(9n * TOKEN_SCALE + 1n);
      expect(await f.token.balanceOf(await f.auction.getAddress())).to.equal(0n);
      await expect(f.auction.burnRemainderAfterAllClaimed()).to.be.revertedWithCustomError(
        f.auction,
        "NoTokensToBurn"
      );
    });
  });

  describe("refunds", function () {
    it("credits the surplus when a bidder rejects ETH, and allows withdrawal to another address once", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      const RejectingReceiver = await f.ethers.getContractFactory("RejectingReceiver");
      const receiver = (await RejectingReceiver.deploy(await f.auction.getAddress())) as any;
      const receiverAddress = await receiver.getAddress();

      await at(f, start + 700n);
      await expect(receiver.contribute({ value: f.ethers.parseEther("12") }))
        .to.emit(f.auction, "RefundCredited")
        .withArgs(receiverAddress, f.ethers.parseEther("0.75"));
      expect(await f.auction.refundCredits(receiverAddress)).to.equal(f.ethers.parseEther("0.75"));
      expect(await f.auction.refundLiability()).to.equal(f.ethers.parseEther("0.75"));

      await expect(receiver.withdrawToSelf()).to.be.revertedWithCustomError(
        f.auction,
        "RefundTransferFailed"
      );
      expect(await f.auction.refundCredits(receiverAddress)).to.equal(f.ethers.parseEther("0.75"));

      await expect(receiver.withdrawTo(f.recipient.address)).to.changeEtherBalances(
        f.ethers,
        [f.recipient, f.auction],
        [f.ethers.parseEther("0.75"), -f.ethers.parseEther("0.75")]
      );
      expect(await f.auction.refundLiability()).to.equal(0n);
      await expect(receiver.withdrawTo(f.recipient.address)).to.be.revertedWithCustomError(
        f.auction,
        "NoRefundAvailable"
      );
    });

    it("blocks an attacker that re-enters refund withdrawal", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      const auctionAddress = await f.auction.getAddress();
      const Attacker = await f.ethers.getContractFactory("ReentrancyAttacker");
      const selector = f.auction.interface.getFunction("withdrawRefundTo")!.selector;
      const attacker = (await Attacker.deploy(auctionAddress, selector, true)) as any;
      const attackerAddress = await attacker.getAddress();

      await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
      await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("4") });
      await at(f, start + 700n);
      // The attacker rejects the automatic refund so that 0.75 ETH is credited instead.
      await attacker.contribute({ value: f.ethers.parseEther("2") });
      expect(await f.auction.refundCredits(attackerAddress)).to.equal(f.ethers.parseEther("0.75"));

      await expect(attacker.attack()).to.changeEtherBalances(
        f.ethers,
        [attacker, f.auction],
        [f.ethers.parseEther("0.75"), -f.ethers.parseEther("0.75")]
      );

      expect(await attacker.reentryAttempts()).to.be.greaterThan(0n);
      expect(await attacker.reentrySuccesses()).to.equal(0n);
      expect(await f.ethers.provider.getBalance(auctionAddress)).to.equal(
        await f.auction.totalCommitted()
      );
    });
  });

  describe("issuer proceeds", function () {
    it("lets only the owner withdraw, only after finalization, and only once", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      await clearWithCrossingBid(f, start);

      await expect(
        f.auction.connect(f.issuer).withdrawIssuerProceeds(f.issuer.address)
      ).to.be.revertedWithCustomError(f.auction, "AuctionNotFinalized");

      await at(f, start + DURATION);
      await f.auction.finalize();

      await expect(f.auction.connect(f.alice).withdrawIssuerProceeds(f.alice.address))
        .to.be.revertedWithCustomError(f.auction, "OwnableUnauthorizedAccount")
        .withArgs(f.alice.address);

      await expect(
        f.auction.connect(f.issuer).withdrawIssuerProceeds(f.recipient.address)
      ).to.changeEtherBalance(f.ethers, f.recipient, f.ethers.parseEther("11.25"));
      await expect(
        f.auction.connect(f.issuer).withdrawIssuerProceeds(f.recipient.address)
      ).to.be.revertedWithCustomError(f.auction, "NoProceedsAvailable");
    });

    it("keeps credited refunds solvent after the issuer withdraws", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      const RejectingReceiver = await f.ethers.getContractFactory("RejectingReceiver");
      const receiver = (await RejectingReceiver.deploy(await f.auction.getAddress())) as any;

      await at(f, start + 700n);
      await receiver.contribute({ value: f.ethers.parseEther("12") });
      await at(f, start + DURATION);
      await f.auction.finalize();
      await f.auction.connect(f.issuer).withdrawIssuerProceeds(f.issuer.address);

      expect(await f.ethers.provider.getBalance(await f.auction.getAddress())).to.equal(
        f.ethers.parseEther("0.75")
      );
      await receiver.withdrawTo(f.recipient.address);
      expect(await f.ethers.provider.getBalance(await f.auction.getAddress())).to.equal(0n);
    });
  });

  describe("conservation", function () {
    it("accounts for every token and every wei across a full lifecycle", async function () {
      const f = await deployAuction();
      const start = await startAuction(f);
      const auctionAddress = await f.auction.getAddress();

      const solvent = async () => {
        const balance = await f.ethers.provider.getBalance(auctionAddress);
        const expected =
          (await f.auction.totalCommitted()) -
          (await f.auction.issuerProceedsWithdrawn()) +
          (await f.auction.refundLiability());
        expect(balance).to.equal(expected);
      };

      await clearWithCrossingBid(f, start);
      await solvent();
      await at(f, start + DURATION);
      await f.auction.finalize();
      await f.auction.connect(f.issuer).withdrawIssuerProceeds(f.issuer.address);
      await solvent();

      for (const signer of [f.alice, f.bob, f.carol]) {
        await f.auction.connect(signer).claimTokens();
      }
      await f.auction.burnRemainderAfterAllClaimed();

      expect((await f.auction.totalTokensClaimed()) + (await f.auction.burnedUnsold())).to.equal(
        f.saleSupply
      );
      expect(await f.token.totalSupply()).to.equal(await f.auction.totalTokensClaimed());
      expect(await f.ethers.provider.getBalance(auctionAddress)).to.equal(0n);
    });
  });
});
