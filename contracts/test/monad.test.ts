import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { AUSD, DAY, ack, deployMonad, deposit, payer, register } from "./monadFixture";

const FINANCED = 1, REALISED = 2, PARTIAL = 3, DEFAULTED = 4;

describe("Hisab on Monad", () => {
  async function financed(opts: { seedHistory?: boolean; usd?: number; backdateDays?: number; lp?: bigint } = {}) {
    const m = await deployMonad();
    const usd = opts.usd ?? 48_750;
    await deposit(m, opts.lp ?? AUSD(100_000));
    if (opts.seedHistory ?? true) await m.credit.seed(m.exporter1.address, 2, 2, AUSD(60_000));
    const sbHash = await register(m, "SB 6674321", usd);
    if (opts.backdateDays) await m.engine.setDemoBackdate(sbHash, opts.backdateDays * DAY);
    const a = await ack(m, sbHash, usd);
    await m.engine.connect(m.exporter1).finance(sbHash);
    return { m, sbHash, ...a };
  }

  it("F2: finance without ack reverts NO_ACK", async () => {
    const m = await deployMonad();
    await deposit(m, AUSD(100_000));
    await m.credit.seed(m.exporter1.address, 2, 2, 0);
    const sb = await register(m, "noack");
    await expect(m.engine.connect(m.exporter1).finance(sb)).to.be.revertedWithCustomError(m.engine, "NO_ACK");
  });

  it("acknowledge: bad signer reverts, replay reverts, state recorded", async () => {
    const m = await deployMonad();
    const sb = await register(m, "ack");
    const due = (await time.latest()) + 30 * DAY;
    await expect(m.token.acknowledge(sb, m.buyer.address, AUSD(1), due, "0x" + "11".repeat(65))).to.be.reverted;
    const { amount, dueDate } = await ack(m, sb);
    const a = await m.token.acks(sb);
    expect([a.buyer, a.amount, a.dueDate]).to.deep.equal([m.buyer.address, amount, BigInt(dueDate)]);
    await expect(m.token.acknowledge(sb, m.buyer.address, amount, dueDate, "0x")).to.be.revertedWithCustomError(
      m.token,
      "AlreadyAcknowledged"
    );
    expect(await m.token.mintedBlock(BigInt(sb))).to.be.gt(0);
  });

  it("F3: terms per tier", async () => {
    const m = await deployMonad();
    const e = m.exporter2.address;
    const cases: [number, number, number, number, bigint][] = [
      [0, 0, 7000, 1400, AUSD(10_000)],
      [1, 1, 8000, 1250, AUSD(50_000)],
      [3, 3, 8800, 1150, AUSD(150_000)],
      [10, 10, 9200, 1000, AUSD(500_000)],
    ];
    for (const [realised, onTime, adv, apr, cap] of cases) {
      await m.credit.seed(e, realised, onTime, 0);
      const t = await m.credit.terms(e);
      expect([t[0], t[1], t[2]]).to.deep.equal([BigInt(adv), BigInt(apr), cap]);
    }
    await m.credit.seed(e, 5, 3, 0); // 60% on time, still has an on-time record
    expect(await m.credit.tierOf(e)).to.equal(1);
    await m.credit.seed(e, 3, 0, 0);
    expect(await m.credit.tierOf(e)).to.equal(0);
  });

  it("seed reverts when demoMode is off; setDemoBackdate too; non-admin cannot", async () => {
    const m = await deployMonad();
    await expect(m.credit.connect(m.stranger).seed(m.exporter1.address, 1, 1, 0)).to.be.revertedWithCustomError(m.credit, "Unauthorized");
    await m.credit.setDemoMode(false);
    await m.engine.setDemoMode(false);
    await expect(m.credit.seed(m.exporter1.address, 1, 1, 0)).to.be.revertedWithCustomError(m.credit, "DemoModeOff");
    await expect(m.engine.setDemoBackdate(ethers.ZeroHash, 1)).to.be.revertedWithCustomError(m.engine, "DemoModeOff");
  });

  it("F4: finance pays the advance to the exporter and escrows the token", async () => {
    const m = await deployMonad();
    await deposit(m, AUSD(100_000));
    await m.credit.seed(m.exporter1.address, 2, 2, 0);
    const sb = await register(m, "f4");
    await ack(m, sb);
    const before = await m.ausd.balanceOf(m.exporter1.address);
    await expect(m.engine.connect(m.exporter1).finance(sb)).to.emit(m.engine, "Financed").withArgs(sb, m.exporter1.address, AUSD(39_000), 1250);
    expect((await m.ausd.balanceOf(m.exporter1.address)) - before).to.equal(AUSD(39_000));
    const id = BigInt(sb);
    expect(await m.token.balanceOf(await m.token.getAddress(), id)).to.equal(4_875_000);
    expect(await m.token.balanceOf(m.exporter1.address, id)).to.equal(0);
    expect(await m.registry.state(sb)).to.equal(2);
    expect(await m.pool.outstandingPrincipal()).to.equal(AUSD(39_000));
    expect((await m.engine.positions(sb)).status).to.equal(FINANCED);
  });

  it("F5: second finance reverts ALREADY_LOCKED; locked receivable cannot transfer", async () => {
    const { m, sbHash } = await financed();
    await expect(m.engine.connect(m.exporter1).finance(sbHash)).to.be.revertedWithCustomError(m.engine, "ALREADY_LOCKED");
    await expect(
      m.token.connect(m.exporter1).safeTransferFrom(m.exporter1.address, m.stranger.address, BigInt(sbHash), 1, "0x")
    ).to.be.reverted;
  });

  it("finance by non-exporter reverts NOT_EXPORTER; defaulted exporter blocked; CAP_EXCEEDED", async () => {
    const m = await deployMonad();
    await deposit(m, AUSD(100_000));
    const sb = await register(m, "cap");
    await ack(m, sb);
    await expect(m.engine.connect(m.stranger).finance(sb)).to.be.revertedWithCustomError(m.engine, "NOT_EXPORTER");
    // tier 0 cap is 10k, advance would be 34,125
    await expect(m.engine.connect(m.exporter1).finance(sb)).to.be.revertedWithCustomError(m.engine, "CAP_EXCEEDED");
  });

  it("F6: deposit/withdraw shares; withdraw above idle reverts", async () => {
    const { m } = await financed();
    expect(await m.pool.balanceOf(m.lender.address)).to.equal(AUSD(100_000));
    expect(await m.pool.idle()).to.equal(AUSD(61_000));
    expect(await m.pool.totalAssets()).to.equal(AUSD(100_000));
    expect(await m.pool.maxWithdraw(m.lender.address)).to.equal(AUSD(61_000));
    await expect(m.pool.connect(m.lender).withdraw(AUSD(61_001), m.lender.address, m.lender.address)).to.be.revertedWithCustomError(
      m.pool,
      "ERC4626ExceededMaxWithdraw"
    );
    await expect(m.pool.connect(m.lender).redeem(AUSD(70_000), m.lender.address, m.lender.address)).to.be.revertedWithCustomError(
      m.pool,
      "ERC4626ExceededMaxRedeem"
    );
    await m.pool.connect(m.lender).withdraw(AUSD(61_000), m.lender.address, m.lender.address);
    expect(await m.ausd.balanceOf(m.lender.address)).to.equal(AUSD(61_000));
  });

  it("F7 + demo worked example: legs sum, tier 1 -> 2, share price rises", async () => {
    const { m, sbHash } = await financed({ backdateDays: 75 });
    expect(await m.credit.tierOf(m.exporter1.address)).to.equal(1);
    expect((await m.engine.positions(sbHash)).principal).to.equal(AUSD(39_000));

    const priceBefore = await m.pool.convertToAssets(AUSD(1));
    const [qPool, qInt, qFee, qExp] = await m.engine.quote(sbHash);
    expect(qInt).to.equal(1_001_712_328n);
    expect(qFee).to.equal(26_244_863n);

    const amount = AUSD(48_750);
    await payer(m, amount);
    const bal = async () => [
      await m.ausd.balanceOf(await m.pool.getAddress()),
      await m.ausd.balanceOf(m.feeWallet.address),
      await m.ausd.balanceOf(m.exporter1.address),
    ];
    const [p0, f0, e0] = await bal();
    await expect(m.engine.connect(m.buyer).pay(sbHash, amount)).to.emit(m.engine, "Paid");
    const [p1, f1, e1] = await bal();
    expect([p1 - p0, f1 - f0, e1 - e0]).to.deep.equal([qPool, qFee, qExp]);
    expect(qPool + qFee + qExp).to.equal(amount);
    expect(await m.ausd.balanceOf(m.buyer.address)).to.equal(0);

    expect((await m.engine.positions(sbHash)).status).to.equal(REALISED);
    expect(await m.registry.state(sbHash)).to.equal(4);
    expect(await m.credit.tierOf(m.exporter1.address)).to.equal(2);
    const t = await m.credit.terms(m.exporter1.address);
    expect([t[0], t[1]]).to.deep.equal([8800n, 1150n]);
    expect((await m.credit.records(m.exporter1.address))[5]).to.equal(0); // exposure released
    expect(await m.pool.outstandingPrincipal()).to.equal(0);
    expect(await m.pool.convertToAssets(AUSD(1))).to.be.gt(priceBefore);
    expect(await m.pool.totalAssets()).to.equal(AUSD(100_000) + qInt);
  });

  it("F8: short pay -> PARTIAL, shortfall, pool repaid first", async () => {
    const { m, sbHash } = await financed({ backdateDays: 75 });
    const amount = AUSD(30_000); // below principal + interest (40,001.71)
    await payer(m, amount);
    await m.engine.connect(m.buyer).pay(sbHash, amount);
    const pos = await m.engine.positions(sbHash);
    expect(pos.status).to.equal(PARTIAL);
    expect(pos.shortfall).to.equal(AUSD(18_750));
    expect(await m.ausd.balanceOf(m.feeWallet.address)).to.equal(0);
    expect(await m.registry.state(sbHash)).to.equal(3);
    expect((await m.credit.records(m.exporter1.address))[2]).to.equal(1); // shortPaid
    expect(await m.pool.outstandingPrincipal()).to.equal(0);
    expect(await m.pool.totalAssets()).to.equal(AUSD(100_000) - AUSD(39_000) + amount);
    await expect(m.engine.connect(m.buyer).pay(sbHash, 1)).to.be.revertedWithCustomError(m.engine, "NOT_FINANCED");
  });

  it("pay: OVERPAY above invoice, pay before finance reverts NOT_FINANCED", async () => {
    const { m, sbHash } = await financed();
    await expect(m.engine.pay(sbHash, AUSD(48_751))).to.be.revertedWithCustomError(m.engine, "OVERPAY");
    await expect(m.engine.pay(ethers.ZeroHash, 1)).to.be.revertedWithCustomError(m.engine, "NOT_FINANCED");
  });

  it("F9: markDefault only after due + 15d; writes down; pay then reverts", async () => {
    const { m, sbHash, dueDate } = await financed();
    await expect(m.engine.markDefault(sbHash)).to.be.revertedWithCustomError(m.engine, "NOT_DUE");
    await time.increaseTo(dueDate + 15 * DAY - 1); // next tx lands exactly at the boundary
    await expect(m.engine.markDefault(sbHash)).to.be.revertedWithCustomError(m.engine, "NOT_DUE");
    await time.increase(1);
    const before = await m.pool.totalAssets();
    await expect(m.engine.markDefault(sbHash)).to.emit(m.engine, "Defaulted").withArgs(sbHash, m.exporter1.address, AUSD(48_750));
    expect((await m.engine.positions(sbHash)).status).to.equal(DEFAULTED);
    expect(await m.credit.tierOf(m.exporter1.address)).to.equal(0);
    expect(before - (await m.pool.totalAssets())).to.equal(AUSD(39_000));
    expect(await m.pool.outstandingPrincipal()).to.equal(0);
    await expect(m.engine.pay(sbHash, 1)).to.be.revertedWithCustomError(m.engine, "NOT_FINANCED");
    await expect(m.engine.markDefault(sbHash)).to.be.revertedWithCustomError(m.engine, "NOT_FINANCED");
    // defaulted exporter is blocked from new financing
    const sb2 = await register(m, "second");
    await ack(m, sb2);
    await expect(m.engine.connect(m.exporter1).finance(sb2)).to.be.revertedWithCustomError(m.engine, "DEFAULT_OUTSTANDING");
  });

  it("pay on REALISED reverts", async () => {
    const { m, sbHash } = await financed();
    await payer(m, AUSD(48_750));
    await m.engine.connect(m.buyer).pay(sbHash, AUSD(48_750));
    await expect(m.engine.pay(sbHash, 1)).to.be.revertedWithCustomError(m.engine, "NOT_FINANCED");
  });

  it("only the engine can move pool funds or write credit records; wiring is admin-only", async () => {
    const m = await deployMonad();
    const h = ethers.ZeroHash;
    const s = m.stranger;
    await expect(m.pool.connect(s).fund(h, s.address, 1, 1)).to.be.revertedWithCustomError(m.pool, "NotEngine");
    await expect(m.pool.connect(s).repay(h, 1, 1)).to.be.revertedWithCustomError(m.pool, "NotEngine");
    await expect(m.pool.connect(s).writeDown(h)).to.be.revertedWithCustomError(m.pool, "NotEngine");
    await expect(m.credit.connect(s).onFinanced(s.address, 1)).to.be.revertedWithCustomError(m.credit, "NotEngine");
    await expect(m.credit.connect(s).onRealised(s.address, 1, 1, true, false)).to.be.revertedWithCustomError(m.credit, "NotEngine");
    await expect(m.credit.connect(s).onDefault(s.address, 1)).to.be.revertedWithCustomError(m.credit, "NotEngine");
    await expect(m.pool.setEngine(s.address)).to.be.revertedWithCustomError(m.pool, "EngineAlreadySet");
    for (const f of ["setPool", "setCredit", "setAusd", "setFeeWallet"] as const)
      await expect(m.engine.connect(s)[f](s.address)).to.be.revertedWithCustomError(m.engine, "Unauthorized");
    await expect(m.token.connect(s).lockFor(1, s.address, s.address, 1, 1)).to.be.revertedWithCustomError(m.token, "Unauthorized");
  });

  it("fuzz: waterfall conserves tokens and totalAssets == idle + outstanding", async () => {
    const m = await deployMonad();
    await deposit(m, AUSD(1_000_000));
    await m.credit.seed(m.exporter1.address, 12, 12, 0); // tier 3
    const pool = await m.pool.getAddress();
    let seedRand = 12345;
    const rnd = (n: number) => ((seedRand = (seedRand * 1103515245 + 12345) & 0x7fffffff) % n);

    for (let i = 0; i < 100; i++) {
      const usd = 1_000 + rnd(150_000);
      await deposit(m, AUSD(140_000)); // short pays lose pool money; keep liquidity topped up
      const sb = await register(m, `fuzz${i}`, usd);
      await m.engine.setDemoBackdate(sb, rnd(200) * DAY);
      const { amount: inv } = await ack(m, sb, usd);
      await m.engine.connect(m.exporter1).finance(sb);
      expect(await m.pool.totalAssets()).to.equal((await m.ausd.balanceOf(pool)) + (await m.pool.outstandingPrincipal()));

      await time.increase((1 + rnd(60)) * DAY);
      // mix: full pay, short pay, tiny pay
      const mode = rnd(3);
      const amount = mode === 0 ? inv : mode === 1 ? (inv * BigInt(1 + rnd(99))) / 100n : BigInt(1 + rnd(1_000_000));
      await payer(m, amount);
      const watch = [pool, m.feeWallet.address, m.exporter1.address, m.buyer.address];
      const sum = async () => {
        let t = 0n;
        for (const a of watch) t += await m.ausd.balanceOf(a);
        return t;
      };
      const [tBefore, bBefore, pBefore, fBefore, eBefore] = [
        await sum(),
        await m.ausd.balanceOf(m.buyer.address),
        await m.ausd.balanceOf(pool),
        await m.ausd.balanceOf(m.feeWallet.address),
        await m.ausd.balanceOf(m.exporter1.address),
      ];
      await m.engine.connect(m.buyer).pay(sb, amount);
      expect(await sum()).to.equal(tBefore); // nothing created or lost
      const dP = (await m.ausd.balanceOf(pool)) - pBefore;
      const dF = (await m.ausd.balanceOf(m.feeWallet.address)) - fBefore;
      const dE = (await m.ausd.balanceOf(m.exporter1.address)) - eBefore;
      expect(dP + dF + dE).to.equal(amount);
      expect(bBefore - (await m.ausd.balanceOf(m.buyer.address))).to.equal(amount);
      expect(await m.pool.outstandingPrincipal()).to.equal(0);
      expect(await m.pool.totalAssets()).to.equal(await m.ausd.balanceOf(pool));
      // keep exposure/tier healthy for later iterations
      await m.credit.seed(m.exporter1.address, 12, 12, 0);
    }
  });
});
