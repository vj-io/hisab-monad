import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { deployStack } from "./monadStack";

const DAY = 86400;
const usd = (n: number | bigint) => ethers.parseUnits(String(n), 6);
const fmt = (n: bigint) => ethers.formatUnits(n, 6);
const TIERS = ["0 (70% @14%)", "1 (80% @12.5%)", "2 (88% @11.5%)", "3 (92% @10%)"];

async function load() {
  const file = path.join(__dirname, "..", "deployments", network.name === "monadTestnet" ? "monad-testnet.json" : `${network.name}-monad.json`);
  if (network.name === "hardhat" || !fs.existsSync(file)) {
    console.log("deploying fresh stack on", network.name);
    return { ...(await deployStack(true)), chainId: Number((await ethers.provider.getNetwork()).chainId) };
  }
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const at = (n: string, a: string) => ethers.getContractAt(n, a);
  const [deployer] = await ethers.getSigners();
  const c = d.contracts;
  return {
    deployer,
    chainId: d.chainId as number,
    registry: await at("ShippingBillRegistry", c.registry),
    token: await at("ReceivableToken", c.token),
    engine: await at("RealisationEngine", c.engine),
    pool: await at("FinancingPool", c.pool),
    credit: await at("ExporterCredit", c.credit),
    ausd: await at("MockAUSD", c.ausd),
  };
}

async function main() {
  const s = await load();
  const link = (h: string) => (s.chainId === 10143 ? `https://testnet.monadexplorer.com/tx/${h}` : h);
  const step = async (label: string, p: Promise<any>) => {
    const tx = await p;
    const rc = await tx.wait();
    console.log(`  ${label}: ${link(rc.hash)}`);
    return rc;
  };

  // three fresh wallets, funded with a little gas
  const [lender, exporter, buyer] = [0, 1, 2].map(() => ethers.Wallet.createRandom().connect(ethers.provider));
  for (const w of [lender, exporter, buyer]) {
    await (await s.deployer.sendTransaction({ to: w.address, value: ethers.parseEther("0.2") })).wait();
  }
  console.log("lender  ", lender.address, "\nexporter", exporter.address, "\nbuyer   ", buyer.address);

  const sbHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string", "address"], ["SB 6674321", exporter.address]));
  const invoice = usd(48_750);
  const poolAddr = await s.pool.getAddress();
  const price = () => s.pool.convertToAssets(usd(1));

  console.log("1. lender deposits 100,000 AUSD");
  await step("mint", s.ausd.mint(lender.address, usd(100_000)));
  await step("approve", s.ausd.connect(lender).getFunction("approve")(poolAddr, usd(100_000)));
  await step("deposit", s.pool.connect(lender).getFunction("deposit")(usd(100_000), lender.address));
  console.log("  shares:", fmt(await s.pool.balanceOf(lender.address)));

  console.log("2. seed exporter history (2/2 on time), register SB 6674321, backdate 75 days");
  await step("seed", s.credit.seed(exporter.address, 2, 2, usd(2 * 48_750)));
  const latest = await ethers.provider.getBlock("latest");
  await step(
    "register",
    s.registry.registerShippingBill(sbHash, ethers.keccak256(ethers.toUtf8Bytes("iec")), exporter.address, 4_875_000, ethers.hexlify(ethers.toUtf8Bytes("USD")), latest!.timestamp, 4_875_000 * 83)
  );
  await step("backdate", s.engine.setDemoBackdate(sbHash, 75 * DAY));
  const tierBefore = await s.credit.tierOf(exporter.address);
  const termsBefore = await s.credit.terms(exporter.address);
  console.log(`  tier before: ${TIERS[Number(tierBefore)]}  advanceBps=${termsBefore[0]} aprBps=${termsBefore[1]}`);

  console.log("3. buyer signs EIP-712 acknowledgement");
  const dueDate = (await ethers.provider.getBlock("latest"))!.timestamp + 30 * DAY;
  const sig = await buyer.signTypedData(
    { name: "Hisab", version: "1", chainId: s.chainId, verifyingContract: await s.token.getAddress() },
    { Acknowledgement: [{ name: "sbHash", type: "bytes32" }, { name: "buyer", type: "address" }, { name: "amount", type: "uint256" }, { name: "dueDate", type: "uint64" }] },
    { sbHash, buyer: buyer.address, amount: invoice, dueDate }
  );
  await step("acknowledge", s.token.acknowledge(sbHash, buyer.address, invoice, dueDate, sig));

  console.log("4. exporter finances");
  const priceBefore = await price();
  await step("finance", s.engine.connect(exporter).getFunction("finance")(sbHash));
  console.log("  exporter AUSD:", fmt(await s.ausd.balanceOf(exporter.address)));
  try {
    await s.engine.connect(exporter).getFunction("finance").staticCall(sbHash);
    console.log("  UNEXPECTED: second finance did not revert");
  } catch (e: any) {
    console.log("  second finance reverted:", e.revert?.name ?? e.shortMessage ?? e.message);
  }

  console.log("5. buyer approves and pays 48,750 AUSD");
  await step("mint", s.ausd.mint(buyer.address, invoice));
  await step("approve", s.ausd.connect(buyer).getFunction("approve")(await s.engine.getAddress(), invoice));
  const feeWallet = await s.engine.feeWallet();
  const bal = async () => [await s.ausd.balanceOf(poolAddr), await s.ausd.balanceOf(feeWallet), await s.ausd.balanceOf(exporter.address)];
  const [p0, f0, e0] = await bal();
  await step("pay", s.engine.connect(buyer).getFunction("pay")(sbHash, invoice));
  const [p1, f1, e1] = await bal();
  console.log(`  legs: toPool=${fmt(p1 - p0)} fee=${fmt(f1 - f0)} toExporter=${fmt(e1 - e0)} (sum ${fmt(p1 - p0 + f1 - f0 + e1 - e0)})`);

  const tierAfter = await s.credit.tierOf(exporter.address);
  const termsAfter = await s.credit.terms(exporter.address);
  console.log(`  tier after: ${TIERS[Number(tierAfter)]}  advanceBps=${termsAfter[0]} aprBps=${termsAfter[1]}`);
  console.log(`  pool share price (AUSD per 1 share): ${fmt(priceBefore)} -> ${fmt(await price())}`);
  console.log("  position status:", (await s.engine.positions(sbHash)).status.toString(), "(2 = REALISED)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
