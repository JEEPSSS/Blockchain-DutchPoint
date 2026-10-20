import { expect } from "chai";
import { network } from "hardhat";

// Regression tests for defects found while reviewing the AI-generated auction.
// Each test encodes the intended behaviour; see docs/ai-audit-report.md for the findings.

const TOKEN_SCALE = 10n ** 18n;
const DURATION = 1200n;

const Status = {
  Pending: 0n,
  Active: 1n,
  Cleared: 2n,
  AwaitingFinalization: 3n,
  Finalized: 4n
};

async function deployStarted() {
  const { ethers, networkHelpers } = await network.create();
  const [issuer, alice, bob, whale] = await ethers.getSigners();

  const saleSupply = ethers.parseUnits("1000", 18);
  const startPrice = ethers.parseEther("0.02");
  const reservePrice = ethers.parseEther("0.005");

  const token = (await (await ethers.getContractFactory("LaunchToken")).deploy(
    "Gavora",
    "GVRA",
    saleSupply,
    issuer.address
  )) as any;
  const auction = (await (await ethers.getContractFactory("DutchAuction")).deploy(
    await token.getAddress(),
    saleSupply,
    startPrice,
    reservePrice,
    issuer.address
  )) as any;

  await token.connect(issuer).transfer(await auction.getAddress(), saleSupply);
  await auction.connect(issuer).start();
  const start = BigInt(await auction.startTime());

  return { ethers, networkHelpers, issuer, alice, bob, whale, token, auction, saleSupply, start };
}

describe("Audit regressions", function () {
  it("F1: a late oversized bid cannot crowd out earlier bidders", async function () {
    const f = await deployStarted();

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
    await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("4") });

    // At t = 700s the price is 0.01125 ETH, so 11.25 ETH buys the whole supply.
    // Only 1.25 ETH of the whale's 100 ETH is needed to clear the auction.
    await f.networkHelpers.time.setNextBlockTimestamp(Number(f.start + 700n));
    const whaleBefore = await f.ethers.provider.getBalance(f.whale.address);
    const tx = await f.auction.connect(f.whale).contribute({ value: f.ethers.parseEther("100") });
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const whaleSpentInBidTx = whaleBefore - (await f.ethers.provider.getBalance(f.whale.address)) - gas;

    await f.networkHelpers.time.setNextBlockTimestamp(Number(f.start + DURATION));
    await f.auction.finalize();

    const price = f.ethers.parseEther("0.01125");
    for (const signer of [f.alice, f.bob, f.whale]) {
      await f.auction.connect(signer).claimTokens();
    }

    // Earlier bidders are filled in full at the clearing price.
    expect(await f.token.balanceOf(f.alice.address)).to.equal(
      (f.ethers.parseEther("6") * TOKEN_SCALE) / price
    );
    expect(await f.token.balanceOf(f.bob.address)).to.equal(
      (f.ethers.parseEther("4") * TOKEN_SCALE) / price
    );
    // The crossing bidder only receives what was left...
    expect(await f.token.balanceOf(f.whale.address)).to.equal(
      (f.ethers.parseEther("1.25") * TOKEN_SCALE) / price
    );
    // ...and the surplus is returned in the same transaction.
    expect(whaleSpentInBidTx).to.equal(f.ethers.parseEther("1.25"));
  });

  it("F2: status and price reflect clearing caused by time passing", async function () {
    const f = await deployStarted();

    // 10 ETH buys the 1,000 token supply once the price reaches 0.01 ETH (t = 800s).
    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("10") });
    await f.networkHelpers.time.increaseTo(Number(f.start + 900n));

    expect(await f.auction.status()).to.equal(Status.Cleared);
    expect(await f.auction.currentPrice()).to.equal(f.ethers.parseEther("0.01"));
  });

  it("F3: a cleared auction reports AwaitingFinalization once the window ends", async function () {
    const f = await deployStarted();

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("6") });
    await f.networkHelpers.time.setNextBlockTimestamp(Number(f.start + 700n));
    await f.auction.connect(f.bob).contribute({ value: f.ethers.parseEther("6") });
    await f.networkHelpers.time.increaseTo(Number(f.start + DURATION));

    // The frontend enables "Finalize" only for this status.
    expect(await f.auction.status()).to.equal(Status.AwaitingFinalization);
  });

  it("F4: issuer proceeds are withdrawable at finalization without waiting for bidders", async function () {
    const f = await deployStarted();

    await f.auction.connect(f.alice).contribute({ value: f.ethers.parseEther("2") });
    await f.networkHelpers.time.setNextBlockTimestamp(Number(f.start + DURATION));
    await f.auction.finalize();

    // Alice never claims (e.g. lost keys); the issuer's sale revenue must not be held hostage.
    await f.auction.connect(f.issuer).withdrawIssuerProceeds(f.issuer.address);
    expect(await f.auction.issuerProceedsWithdrawn()).to.equal(f.ethers.parseEther("2"));
  });
});
