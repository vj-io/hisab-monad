import { ethers } from "hardhat";

/// Deploys and wires the full stack (legacy + Monad contracts) from the first configured signer.
/// Shared by deploy-monad.ts and demo-monad.ts.
export async function deployStack(demoMode = true) {
  const [deployer] = await ethers.getSigners();
  const put = async <T extends { waitForDeployment(): Promise<unknown> }>(name: string, c: Promise<T>) => {
    const x = await c;
    await x.waitForDeployment();
    console.log(`  ${name} deployed`);
    return x;
  };
  const send = async (p: Promise<{ wait(): Promise<unknown> }>) => (await p).wait();
  const f = (n: string) => ethers.getContractFactory(n);

  const roles = await put("roles", (await f("HisabRoles")).deploy(deployer.address));
  const r = await roles.getAddress();
  const registry = await put("registry", (await f("ShippingBillRegistry")).deploy(r));
  const token = await put("token", (await f("ReceivableToken")).deploy(r, "https://hisab.local/token/{id}.json"));
  const remittance = await put("remittance", (await f("RemittanceRegistry")).deploy(r));
  const ebrc = await put("ebrc", (await f("EBRCIssuer")).deploy(r));
  const payoutLedger = await put("payoutLedger", (await f("PayoutLedger")).deploy(r));
  const engine = await put("engine", (await f("RealisationEngine")).deploy(r));
  const ausd = await put("ausd", (await f("MockAUSD")).deploy());
  const pool = await put("pool", (await f("FinancingPool")).deploy(await ausd.getAddress(), r));
  const credit = await put("credit", (await f("ExporterCredit")).deploy(r));

  await send(registry.setToken(await token.getAddress()));
  await send(token.setRegistry(await registry.getAddress()));
  await send(token.setPayoutLedger(await payoutLedger.getAddress()));
  await send(ebrc.setRegistry(await registry.getAddress()));
  await send(engine.setRegistry(await registry.getAddress()));
  await send(engine.setRemittance(await remittance.getAddress()));
  await send(engine.setToken(await token.getAddress()));
  await send(engine.setPool(await pool.getAddress()));
  await send(engine.setCredit(await credit.getAddress()));
  await send(engine.setAusd(await ausd.getAddress()));
  await send(engine.setFeeWallet(deployer.address));
  await send(pool.setEngine(await engine.getAddress()));
  await send(credit.setEngine(await engine.getAddress()));
  if (demoMode) {
    await send(engine.setDemoMode(true));
    await send(credit.setDemoMode(true));
  }

  await send(roles.grantRole(await roles.INTERNAL_ROLE(), await token.getAddress()));
  await send(roles.grantRole(await roles.INTERNAL_ROLE(), await engine.getAddress()));
  await send(roles.grantRole(await roles.CUSTOMS_ROLE(), deployer.address));
  await send(roles.grantRole(await roles.OPS_ROLE(), deployer.address));

  return { deployer, roles, registry, token, remittance, ebrc, payoutLedger, engine, ausd, pool, credit };
}
