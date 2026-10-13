import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployAll, CCY_USD, iecHashOf } from "./fixture";

export const AUSD = (n: number | string) => ethers.parseUnits(String(n), 6);
export const DAY = 86400;

/// Legacy stack plus MockAUSD, FinancingPool, ExporterCredit, wired to the engine.
export async function deployMonad() {
  const ctx = await deployAll();
  const { roles, engine, admin } = ctx;
  const rolesAddr = await roles.getAddress();

  const ausd = await (await ethers.getContractFactory("MockAUSD")).deploy();
  const pool = await (await ethers.getContractFactory("FinancingPool")).deploy(await ausd.getAddress(), rolesAddr);
  const credit = await (await ethers.getContractFactory("ExporterCredit")).deploy(rolesAddr);
  const [, , , , , , , , , , lender, buyer, feeWallet, stranger] = await ethers.getSigners();

  await pool.setEngine(await engine.getAddress());
  await credit.setEngine(await engine.getAddress());
  await credit.setDemoMode(true);
  await engine.setPool(await pool.getAddress());
  await engine.setCredit(await credit.getAddress());
  await engine.setAusd(await ausd.getAddress());
  await engine.setFeeWallet(feeWallet.address);
  await engine.setDemoMode(true);

  return { ...ctx, ausd, pool, credit, lender, buyer, feeWallet, stranger, admin };
}
type M = Awaited<ReturnType<typeof deployMonad>>;

export async function deposit(m: M, amount: bigint) {
  await m.ausd.mint(m.lender.address, amount);
  await m.ausd.connect(m.lender).approve(await m.pool.getAddress(), amount);
  await m.pool.connect(m.lender).deposit(amount, m.lender.address);
}

/// Registers a bill of `usd` dollars for exporter1 and returns its hash.
export async function register(m: M, seed: string, usd = 48_750, exporter = m.exporter1.address) {
  const sbHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string", "address"], [seed, exporter]));
  await m.registry
    .connect(m.customs)
    .registerShippingBill(sbHash, iecHashOf(seed), exporter, usd * 100, CCY_USD, await time.latest(), usd * 100 * 83);
  return sbHash;
}

export async function ack(m: M, sbHash: string, usd = 48_750, dueIn = 30 * DAY) {
  const dueDate = (await time.latest()) + dueIn;
  const amount = AUSD(usd);
  const net = await ethers.provider.getNetwork();
  const sig = await m.buyer.signTypedData(
    { name: "Hisab", version: "1", chainId: net.chainId, verifyingContract: await m.token.getAddress() },
    {
      Acknowledgement: [
        { name: "sbHash", type: "bytes32" },
        { name: "buyer", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "dueDate", type: "uint64" },
      ],
    },
    { sbHash, buyer: m.buyer.address, amount, dueDate }
  );
  await m.token.acknowledge(sbHash, m.buyer.address, amount, dueDate, sig);
  return { amount, dueDate };
}

export async function payer(m: M, amount: bigint) {
  await m.ausd.mint(m.buyer.address, amount);
  await m.ausd.connect(m.buyer).approve(await m.engine.getAddress(), amount);
}
