import { expect } from "chai";
import { network } from "hardhat";

describe("GavoraToken", function () {
  async function deploy() {
    const { ethers } = await network.create();
    const [issuer, alice] = await ethers.getSigners();
    const supply = ethers.parseUnits("1000", 18);
    const Token = await ethers.getContractFactory("GavoraToken");
    const token = (await Token.deploy(supply, issuer.address)) as any;
    return { ethers, issuer, alice, supply, Token, token };
  }

  it("is the Gavora (GVRA) ERC20 with 18 decimals and a fixed supply", async function () {
    const { issuer, supply, token } = await deploy();

    expect(await token.name()).to.equal("Gavora");
    expect(await token.symbol()).to.equal("GVRA");
    expect(await token.decimals()).to.equal(18n);
    expect(await token.totalSupply()).to.equal(supply);
    expect(await token.balanceOf(issuer.address)).to.equal(supply);
  });

  it("exposes no mint function and no owner", async function () {
    const { token } = await deploy();

    expect(token.interface.getFunction("mint")).to.equal(null);
    expect(token.interface.getFunction("owner")).to.equal(null);
  });

  it("rejects a zero initial supply", async function () {
    const { issuer, Token, token } = await deploy();

    await expect(Token.deploy(0n, issuer.address)).to.be.revertedWithCustomError(
      token,
      "InvalidInitialSupply"
    );
  });

  it("lets holders burn their own tokens, reducing total supply", async function () {
    const { ethers, issuer, supply, token } = await deploy();
    const amount = ethers.parseUnits("100", 18);

    await token.connect(issuer).burn(amount);

    expect(await token.totalSupply()).to.equal(supply - amount);
    expect(await token.balanceOf(issuer.address)).to.equal(supply - amount);
  });

  it("does not let anyone burn another holder's tokens without an allowance", async function () {
    const { ethers, issuer, alice, token } = await deploy();

    await expect(
      token.connect(alice).burnFrom(issuer.address, ethers.parseUnits("1", 18))
    ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
  });
});
