import { expect } from "chai";
import { network } from "hardhat";

// Gas scaling: no auction call may cost more as the number of bidders grows (no loops over
// bidders, so nobody can make bidding or settlement too expensive for others).
//
// For each crowd size the same five calls are measured at the same point in the auction's
// life, so their storage writes match (e.g. the measured claim is always the first claim).
// A loop touching each bidder would cost at least 2,100 gas (a cold storage read) per extra
// bidder, i.e. more than 200,000 gas between 1 and 100 bidders, so a 1% tolerance cannot hide one.
// Run with GAS_REPORT=1 to print the measured table.

const DURATION = 1200n;
const CROWD_SIZES = [1, 10, 50, 100];
const TOLERANCE_BPS = 100n; // 1%

type Operation = "Bid (new bidder)" | "Crossing bid + surplus refund" | "Finalize" | "Claim tokens" | "Withdraw proceeds";

async function measure(priorBidders: number): Promise<Record<Operation, bigint>> {
  const { ethers, networkHelpers } = await network.create();
  const [issuer, newcomer, crosser] = await ethers.getSigners();

  const saleSupply = ethers.parseUnits("1000", 18);
  const token = (await (await ethers.getContractFactory("GavoraToken")).deploy(saleSupply, issuer.address)) as any;
  const auction = (await (await ethers.getContractFactory("DutchAuction")).deploy(
    await token.getAddress(),
    saleSupply,
    ethers.parseEther("0.02"),
    ethers.parseEther("0.005"),
    issuer.address
  )) as any;
  await token.connect(issuer).transfer(await auction.getAddress(), saleSupply);
  await auction.connect(issuer).start();
  const start = BigInt(await auction.startTime());

  // The crowd: deterministic accounts, funded and impersonated, each bidding 0.01 ETH.
  const crowd = [];
  for (let i = 0; i < priorBidders; i++) {
    const address = new ethers.Wallet(ethers.id(`gas-crowd-${i}`)).address;
    await networkHelpers.setBalance(address, ethers.parseEther("1"));
    await networkHelpers.impersonateAccount(address);
    const bidder = await ethers.getSigner(address);
    await auction.connect(bidder).contribute({ value: ethers.parseEther("0.01") });
    crowd.push(bidder);
  }

  const gasOf = async (txPromise: Promise<any>) => BigInt((await (await txPromise).wait()).gasUsed);

  const bid = await gasOf(auction.connect(newcomer).contribute({ value: ethers.parseEther("0.01") }));

  // Overshoot the remaining capacity by 1 ETH: the bid clears the auction and is refunded the excess.
  const capacity = BigInt(await auction.remainingCapacity());
  const crossing = await gasOf(auction.connect(crosser).contribute({ value: capacity + ethers.parseEther("1") }));
  expect(await auction.clearingTime()).to.not.equal(0n);

  await networkHelpers.time.setNextBlockTimestamp(Number(start + DURATION));
  const finalize = await gasOf(auction.finalize());
  const claim = await gasOf(auction.connect(crowd[0]).claimTokens());
  const withdraw = await gasOf(auction.connect(issuer).withdrawIssuerProceeds(issuer.address));

  return {
    "Bid (new bidder)": bid,
    "Crossing bid + surplus refund": crossing,
    "Finalize": finalize,
    "Claim tokens": claim,
    "Withdraw proceeds": withdraw
  };
}

describe("Gas scaling", function () {
  it("keeps the cost of bidding and settlement independent of the number of bidders", async function () {
    const results = new Map<number, Record<Operation, bigint>>();
    for (const size of CROWD_SIZES) {
      results.set(size, await measure(size));
    }

    const operations = Object.keys(results.get(CROWD_SIZES[0])!) as Operation[];
    const rows = operations.map((operation) => {
      const values = CROWD_SIZES.map((size) => results.get(size)![operation]);
      const min = values.reduce((a, b) => (b < a ? b : a));
      const max = values.reduce((a, b) => (b > a ? b : a));
      return { operation, values, spread: max - min, limit: (min * TOLERANCE_BPS) / 10_000n };
    });

    if (process.env.GAS_REPORT) {
      const header = ["Operation".padEnd(30), ...CROWD_SIZES.map((n) => `${n} prior`.padStart(11)), "spread".padStart(8)];
      console.log(`\n      Gas used per call, by number of earlier bidders\n      ${header.join(" ")}`);
      for (const row of rows) {
        const cells = row.values.map((v) => v.toLocaleString("en-US").padStart(11));
        console.log(`      ${row.operation.padEnd(30)} ${cells.join(" ")} ${row.spread.toLocaleString("en-US").padStart(8)}`);
      }
    }

    for (const row of rows) {
      expect(row.spread, `${row.operation}: ${row.values.join(", ")}`).to.be.at.most(row.limit);
    }
  });
});
