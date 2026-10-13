# Hisab on Monad

Hisab on Monad gives an MSME exporter dollars on the day goods ship: a lender pool advances AUSD against a tokenised shipping bill, and the buyer's AUSD payment repays the pool and pays the exporter in one transaction.

- **Live console:** https://hisab-monad.vercel.app
- **Repo:** https://github.com/vj-io/hisab-monad
- **Track:** Onchain Finance & Trading. **Bounty:** Agora Best Cross-Border Payments App.

Hisab began as an export receivable ledger that recorded entitlements off-chain. The Monad version moves the money: AUSD flows from the pool to the exporter at financing, and from the buyer to the pool, fee wallet and exporter at settlement.

## How it works

1. Exporter registers a shipping bill. Its hash goes onchain and a receivable token is minted.
2. Buyer acknowledges the invoice with an EIP-712 signature (amount, due date).
3. Exporter sees an offer priced by their credit tier and accepts it.
4. The receivable locks to the pool, and the pool sends the AUSD advance to the exporter in the same transaction.
5. On or before the due date, the buyer pays the invoice in AUSD from the pay page.
6. One transaction repays the pool (principal and interest), takes the platform fee, and sends the balance to the exporter.
7. The exporter's credit record updates, and the next offer reflects the new tier.

### Settlement waterfall (demo numbers)

Invoice SB 6674321, USD 48,750.00, financed at tier 1 (80% advance = 39,000.00, 12.5% APR), backdated 75 days. The buyer's single payment of 48,750.00 splits as:

| Leg | AUSD (base-unit exact) |
|---|---|
| Pool: principal | 39,000.000000 |
| Pool: interest (12.5%, 75 days) | 1,001.712328 |
| Platform fee (30 bps of remainder) | 26.244863 |
| Exporter balance | 8,722.042809 |
| **Total** | **48,750.000000** |

Interest is `principal * aprBps * days / (365 * 10,000)` in integer math, so the pool's total is 40,001.71 to cents. The fee and exporter legs are floored integer division, so the PRD's 8,722.05 becomes 8,722.04 on chain. Rounded to cents the three displayed legs add to 48,749.99; the base-unit legs sum exactly to 48,750.00, and those are the reference.

## Demo script

1. **Exporter:** click "Load demo invoice" to open SB 6674321.
2. **Lender:** click "Mint test AUSD", then "Deposit". Shares appear.
3. **Buyer:** click "Acknowledge" on the pay page.
4. **Exporter:** click "Accept offer". The advance lands in the exporter wallet. Open the Monad transaction link.
5. **Exporter:** click "Finance again". It reverts with `ALREADY_LOCKED`.
6. **Buyer:** click "Pay invoice". One transaction splits the payment as in the table above.
7. **Exporter:** the tier card shows tier 2 (88% advance, 11.5% APR). The next invoice is offered at those terms.
8. **Lender:** share price moves from 1.0 to 1.010017.
9. **Explorer:** every invoice state links to its transaction on the Monad testnet explorer.
10. **Exporter:** click "Register next invoice". SB 6674322 is offered at the new tier (42,900.00 AUSD, 88% at 11.5%).

"Start fresh demo" creates new burner wallets for a clean re-run.

## Wallets and login

Each role (lender, exporter, buyer) runs on a browser burner wallet by default, topped up with test MON by the faucet function. Any role can switch to:

- **Email (Privy):** "Use email wallet" logs in with an email code and binds the Privy embedded wallet on Monad testnet to that role. One email gives one embedded wallet, so one role holds it at a time. Wallet confirmation pop-ups are off for a click-only demo.
- **Browser wallet:** "Connect browser wallet" uses an injected wallet and switches it to chain 10143.

Privy loads only when `VITE_PRIVY_APP_ID` is set; without it the console runs on burners alone.

## Design

The console uses the Doodle look: grid paper, ink outlines that draw themselves and boil slightly, one lime highlighter, stamped invoice states and a hand-drawn waterfall. Motion is off under `prefers-reduced-motion`; `<html data-boil="off">` turns off the boil alone.

## Deployed contracts (Monad testnet, chainId 10143)

RPC `https://testnet-rpc.monad.xyz`. Explorer `https://testnet.monadexplorer.com`.

Deployed at block 70657795 by `0xA27718496639C050f537b1751C405AA7341A6BF8` (also the fee wallet).

| Contract | Address |
|---|---|
| roles (HisabRoles) | [`0x798b454B2830Ccf6248eFEfef64983E80cAAcFb1`](https://testnet.monadexplorer.com/address/0x798b454B2830Ccf6248eFEfef64983E80cAAcFb1) |
| registry (ShippingBillRegistry) | [`0x70DfBF7005c6b14aea99F87Eb51bdCAa249c55Da`](https://testnet.monadexplorer.com/address/0x70DfBF7005c6b14aea99F87Eb51bdCAa249c55Da) |
| token (ReceivableToken) | [`0xb3093FE6932B502605C963E69F5B984Bb0a7B333`](https://testnet.monadexplorer.com/address/0xb3093FE6932B502605C963E69F5B984Bb0a7B333) |
| engine (RealisationEngine) | [`0x81a4b174a1F6A1bA6c390Ef0A2e819967eBd73Dd`](https://testnet.monadexplorer.com/address/0x81a4b174a1F6A1bA6c390Ef0A2e819967eBd73Dd) |
| pool (FinancingPool) | [`0xAe479624365Ff4A1157F434Bd6fc0378C06fA4C9`](https://testnet.monadexplorer.com/address/0xAe479624365Ff4A1157F434Bd6fc0378C06fA4C9) |
| credit (ExporterCredit) | [`0xD34066528fc84D974a726fd0766e9Ed584dF4c5d`](https://testnet.monadexplorer.com/address/0xD34066528fc84D974a726fd0766e9Ed584dF4c5d) |
| ausd (MockAUSD) | [`0x0C04497109189d785477D417c00E287B36529936`](https://testnet.monadexplorer.com/address/0x0C04497109189d785477D417c00E287B36529936) |
| remittance (RemittanceRegistry) | [`0xD5611eb1FE7c64564C975e5d758106D7D6F3E374`](https://testnet.monadexplorer.com/address/0xD5611eb1FE7c64564C975e5d758106D7D6F3E374) |
| ebrc (EBRCIssuer) | [`0xaEEbA4BCea70Ed4fd0ED476E60A5Fb2594CD8dFC`](https://testnet.monadexplorer.com/address/0xaEEbA4BCea70Ed4fd0ED476E60A5Fb2594CD8dFC) |
| payoutLedger (PayoutLedger) | [`0x1540A415d8FFF01C772d9701c626efEa451dB69d`](https://testnet.monadexplorer.com/address/0x1540A415d8FFF01C772d9701c626efEa451dB69d) |

## Repo layout

| Path | What |
|---|---|
| `contracts/` | Solidity 0.8.24 + Hardhat. New: `FinancingPool` (ERC-4626 over AUSD), `ExporterCredit`, `MockAUSD`. Changed: `RealisationEngine` (token-moving waterfall), `ReceivableToken` (EIP-712 acknowledgement, lock to pool). Unchanged: `ShippingBillRegistry`, `HisabRoles`, `RemittanceRegistry`, `EBRCIssuer`, `PayoutLedger`, `RoleAware`. |
| `packages/matcher/` | MT103 parser and rules/LLM hybrid matcher. Serves the legacy SWIFT preset only. |
| `apps/api/` | Legacy Fastify API: ingest, offers, idempotent UPI payout adapter, ops queue, eBRC, explorer, SSE. |
| `apps/web/` | Vite + React + Tailwind console. `src/monad/` holds the Monad views: `MonadApp`, `ExporterView`, `LenderView`, `BuyerView`, `ExplorerView`, plus `wallets`, `chain`, `invoice`, `abi`, `bits`. |
| `apps/web/api/` | Vercel serverless functions: `_lib.ts` (shared chain client), `seed.ts` (demo seeding), `faucet.ts` (testnet AUSD faucet). |

## Run locally

Requires Node 22.13+ and pnpm 10.

```bash
pnpm install

# Contracts
cd contracts && npx hardhat test
npx hardhat run scripts/demo-monad.ts --network monadTestnet

# Deploy to Monad testnet (needs contracts/.env with DEPLOYER_PRIVATE_KEY)
pnpm -F @hisab/contracts deploy:monad

# Web console with Monad API routes
vercel dev --listen 3200    # from repo root; needs DEPLOYER_PRIVATE_KEY, MONAD_RPC_URL and (optional) VITE_PRIVY_APP_ID

# Legacy stack (SWIFT path, local hardhat node)
pnpm dev
pnpm e2e
```

## What is mocked

- **AUSD:** no AUSD on Monad testnet, so `MockAUSD` (6 decimals, open `mint`) stands in. The faucet mints it to burner wallets.
- **INR off-ramp, ICEGATE, DGFT:** mocked. The UPI payout adapter is a partner off-ramp stand-in.
- **Shipping-bill attestation:** a demo attester. The deployer holds the CUSTOMS role and registers bills.
- **Demo mode:** admin can seed credit history (`ExporterCredit.seed`) and backdate financing by 75 days (`setDemoBackdate`). Demo mode is on for testnet only.
- **Wallets:** burner wallets by default, funded through the testnet faucet function; Privy email wallets are real embedded wallets on testnet.

## Built in the hackathon window

Base Hisab (28–29 Sep 2026), before the Monad build:

- `7ca34e9` 2026-09-28 chore: scaffold pnpm workspace
- `8d16d7d` 2026-09-28 feat(matcher): MT103 parser, rules+LLM hybrid matching engine with demo presets
- `9edf402` 2026-09-28 feat(contracts): ledger contracts with invariant tests
- `574e852` 2026-09-28 chore: stop tracking internal spec and planning docs
- `78d4387` 2026-09-28 feat(api): Fastify backend driving ledger, matcher, payouts and eBRC
- `2a98dc5` 2026-09-28 fix(api): make demo reset replayable
- `98cb080` 2026-09-28 feat(web): exporter, financier, ops and explorer console
- `b3e242f` 2026-09-28 docs: README with quick start, demo walkthrough and design notes; build matcher on install
- `45c2f32` 2026-09-29 feat(web): redesign console on the Neel & Haldi design system
- `11f01a4` 2026-09-29 chore: ignore generated launch video output
- `900dca6` 2026-09-29 refactor(matcher): remove Anthropic extractor, keep offline heuristic extractor
- `5318ad0` 2026-09-29 refactor(api): always use the offline heuristic extractor
- `d1da059` 2026-09-29 docs: drop Anthropic/Claude mentions and remove @anthropic-ai/sdk from the lockfile
- `4faf425` 2026-09-29 chore: trigger contributor stats reindex

Hisab on Monad (13 Oct 2026):

- `fa4d208` 2026-10-13 docs: add Hisab on Monad PRD and interface spec
- `2a06616` 2026-10-13 feat(contracts): AUSD financing pool, exporter credit tiers and token-moving waterfall
- `def0290` 2026-10-13 feat(web): Monad console with lender pool, exporter offer, buyer pay page and explorer
- `a2da795` 2026-10-13 docs: README and submission write-up for Hisab on Monad; size demo gas top-ups for Monad gas-limit billing
- `21a0681` 2026-10-13 deploy: Hisab on Monad contracts on Monad testnet (chain 10143)

- `1a05ec4` 2026-10-13 docs: list deploy commits in README
- `f078a9f` 2026-10-13 docs: tidy commit list
- `873068a` 2026-10-13 feat(web): Privy email login with embedded wallets, robust seed/faucet, Doodle design system
- `a8860bc` 2026-10-13 feat(web): Doodle restyle of exporter and buyer views, Privy controls in wallet bar
- `47e4cf6` 2026-10-13 build(web): allow Privy's ox peer range in Vercel npm install
- `a983dd3` 2026-10-13 build: deploy web from monorepo root so Vercel installs with the pnpm lockfile
- `12bc387` 2026-10-13 fix(web): explorer labels each bill by its own SB number

<!-- NEW-COMMITS -->

## Known limits

- The faucet is open. It works on testnet only.
- The explorer and the funded list cover only invoices the browser knows about. There is no indexer yet.
- Default cure is not implemented. A defaulted exporter drops to tier 0 and stays blocked until cured, but there is no cure flow yet.
- A third-party dust payment can close an invoice as PARTIAL. The pool is repaid first and the shortfall is recorded.
