# Hisab on Monad: submission write-up

**Live console:** https://hisab-monad.vercel.app · **Repo:** https://github.com/vj-io/hisab-monad
**Track:** Onchain Finance & Trading · **Bounty:** Agora Best Cross-Border Payments App

## Problem

An MSME exporter ships goods today and is paid 60 to 90 days later, so working capital is locked in every open invoice. Banks finance against collateral rather than the invoice, and small tickets cost more to underwrite than they earn. Lenders stay away for two reasons: there is no shared record of whether an exporter's past invoices were paid, and the same invoice can be pledged twice. The global trade finance gap is roughly USD 2.5 trillion (ADB estimate, approximate; verify before it goes in the deck).

## Target users

- **Exporter:** Indian MSMEs with invoices of USD 10,000 to 100,000 and no bank credit line sized to their order book.
- **Lender:** onchain lenders who want dollar yield from real trade flows with duration under 90 days.

## Flow

A lender deposits AUSD into a pool. An exporter registers a shipping bill, which mints a receivable token. The buyer acknowledges the invoice with an EIP-712 signature. The exporter accepts an offer priced by credit tier, and the pool sends the AUSD advance in the same transaction that locks the receivable. The buyer pays from a pay link in AUSD. One transaction repays the pool with interest, takes a 30 bps fee, and sends the balance to the exporter. The exporter's credit record updates, and the next offer reflects the new tier. A second financing of the same bill reverts with `ALREADY_LOCKED`.

The demo runs one invoice, SB 6674321 for USD 48,750, from registration to a tier upgrade (tier 1 to tier 2) in under three minutes.

## Why Monad

- 400 ms blocks and about 800 ms finality make per-invoice settlement feel immediate.
- Low fees keep a USD 10,000 invoice economical to finance and settle one at a time.
- AUSD is the largest stablecoin on Monad, so the pool and the buyer use one asset.

## Architecture

- **Contracts (Solidity 0.8.24, Hardhat):** `FinancingPool` (ERC-4626 over AUSD) funds advances and receives repayments. `ExporterCredit` holds per-exporter records and tier terms. `RealisationEngine` runs the settlement waterfall in one transaction. `ReceivableToken` locks the receivable to the pool and stores the buyer acknowledgement. Shipping-bill registry and roles are reused.
- **Web:** Vite and React console with lender pool, exporter offer and credit card, buyer pay page, and explorer. Vercel serverless functions handle seeding and the testnet faucet.
- **Read model:** the SQLite read model is designed to rebuild from chain events. Raw documents stay offchain; only hashes go onchain.
- **Legacy:** the SWIFT MT103 matcher and the eBRC path remain for the legacy preset.

## What is mocked

- AUSD on Monad testnet is a 6-decimal `MockAUSD` with an open mint.
- The INR off-ramp (UPI), ICEGATE and DGFT are mocked.
- Shipping bills are registered by a demo attester; the deployer holds the CUSTOMS role.
- Demo mode seeds credit history and backdates financing by 75 days. It is on for testnet only.

## Regulatory note

The AUSD leg is offshore: the buyer pays AUSD to the pool. INR reaches the exporter through a licensed partner off-ramp, which is not part of this build. This is a position for the pitch, not legal advice; the legality of stablecoin export proceeds in India needs review before any launch.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Fake shipping bills | Attester role on registration; buyer acknowledgement before financing |
| Buyer does not pay | Tier caps limit exposure; default drops the exporter to tier 0; write-down is explicit in share price |
| Judges question legality of stablecoin export proceeds | Offshore AUSD leg stated; INR via licensed partner |
| Double financing | Receivable locks to the pool; second finance reverts with `ALREADY_LOCKED` |
| Reused code judged as old work | README lists the Monad commits by hash and date, separate from the base repo |

## Open questions

- Exact submission cut-off and time zone on hackathon.monad.xyz.
- Whether the Agora bounty requires real AUSD on mainnet (the build uses testnet with a mock).
- Whether the track is fixed at application or can change at submission.
- Who attests shipping bills after the hackathon: a customs data provider or the exporter's bank.
- Which licensed off-ramp partner covers USD stablecoin to INR for exporters.
