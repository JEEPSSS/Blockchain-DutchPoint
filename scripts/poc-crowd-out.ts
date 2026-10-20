import { network } from "hardhat";

// Proof of concept for audit finding F1: a late, oversized crossing bid.
// Alice and Bob commit early; a whale commits 100 ETH once the price reaches 0.01125 ETH.
// Prints what each participant ends up paying and receiving.

const DURATION = 1200n;

async function main() {
  const { ethers, networkHelpers } = await network.create();
  const [issuer, alice, bob, whale] = await ethers.getSigners();

  const saleSupply = ethers.parseUnits("1000", 18);
  const token = (await (await ethers.getContractFactory("LaunchToken")).deploy(
    "FairLaunch Token",
    "FAIR",
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
  await (await token.transfer(await auction.getAddress(), saleSupply)).wait();
  await (await auction.start()).wait();
  const start = BigInt(await auction.startTime());

  const participants = [
    { name: "Alice", signer: alice, bid: ethers.parseEther("6"), at: start + 10n },
    { name: "Bob", signer: bob, bid: ethers.parseEther("4"), at: start + 20n },
    { name: "Whale", signer: whale, bid: ethers.parseEther("100"), at: start + 700n }
  ];

  const gasSpent = new Map<string, bigint>();
  const balanceBefore = new Map<string, bigint>();
  const track = async (name: string, txPromise: Promise<any>) => {
    const receipt = await (await txPromise).wait();
    const gas = BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice);
    gasSpent.set(name, (gasSpent.get(name) ?? 0n) + gas);
  };

  for (const p of participants) {
    balanceBefore.set(p.name, await ethers.provider.getBalance(p.signer.address));
    await networkHelpers.time.setNextBlockTimestamp(Number(p.at));
    await track(p.name, auction.connect(p.signer).contribute({ value: p.bid }));
  }

  await networkHelpers.time.setNextBlockTimestamp(Number(start + DURATION));
  await (await auction.finalize()).wait();

  for (const p of participants) {
    await track(p.name, auction.connect(p.signer).claimTokens());
    if ((await auction.refundCredits(p.signer.address)) > 0n) {
      await track(p.name, auction.connect(p.signer).withdrawRefundTo(p.signer.address));
    }
  }

  console.log(`Final price: ${ethers.formatEther(await auction.finalPrice())} ETH per FAIR`);
  console.log("Participant | Committed ETH | Net ETH paid | FAIR received | Share of supply");
  for (const p of participants) {
    const after = await ethers.provider.getBalance(p.signer.address);
    const paid = balanceBefore.get(p.name)! - after - gasSpent.get(p.name)!;
    const tokens = await token.balanceOf(p.signer.address);
    const shareBps = (tokens * 10_000n) / saleSupply;
    console.log(
      `${p.name.padEnd(11)} | ${ethers.formatEther(p.bid).padStart(13)} | ${Number(
        ethers.formatEther(paid)
      )
        .toFixed(4)
        .padStart(12)} | ${Number(ethers.formatUnits(tokens, 18)).toFixed(2).padStart(13)} | ${(
        Number(shareBps) / 100
      ).toFixed(2)}%`
    );
  }
}

await main();
