# Hisab on Monad — PRD

Oct 13, 2026 · @Byte

## Summary

Hisab on Monad gives an MSME exporter dollars on the day goods ship: a lender pool advances AUSD against a tokenised shipping bill, and the buyer's AUSD payment repays the pool and pays the exporter in one transaction.

- **Track:** Onchain Finance & Trading (matches the track's example of undercollateralised lending priced on onchain credit history).
- **Bounties:** Agora Best Cross-Border Payments App ($10,000); Privy ($5,000) if email login ships.
- **Base:** the existing Hisab repo (Solidity 0.8.24, Hardhat, Fastify API, React console).
- **Change in one line:** money now moves onchain in AUSD; today's contracts only record entitlements.
- **Deadline:** 13 Oct 2026. Monad publishes the date only; confirm the exact cut-off on hackathon.monad.xyz before building further.

## Problem and target user

An MSME exporter ships today and is paid 60 to 90 days later, so working capital is locked in every open invoice.

- **Target user:** Indian MSME exporters with invoices of USD 10,000 to 100,000 and no bank credit line sized to their order book.
- **Why they are underserved:** banks finance against collateral, not against the invoice; small tickets cost more to underwrite and reconcile than they earn.
- **Why lenders stay away:** no shared record of whether an exporter's past invoices were paid, and the same invoice can be pledged twice.
- **Market:** the global trade finance gap is roughly USD 2.5 trillion (ADB estimate, approximate; verify before it goes in the deck).
- **Second user:** onchain lenders who want dollar yield from real trade flows with short duration (under 90 days).

## Why Monad

- 400 ms blocks and about 800 ms finality make per-invoice settlement feel instant.
- Low fees keep a USD 10,000 invoice economical to finance and settle individually.
- AUSD is the largest stablecoin on Monad, so both pool and buyer use one asset.

## Solution and user flows

Three actors touch the product: the exporter borrows, the lender funds the pool, and the buyer pays the invoice.

### Core flow

1. Exporter registers a shipping bill; its hash goes onchain and a receivable token is minted.
2. Buyer acknowledges the invoice with a signature (amount, due date).
3. Exporter sees an offer priced by their credit tier and accepts it.
4. The receivable locks to the pool and the pool sends the AUSD advance to the exporter.
5. On or before the due date, the buyer pays the invoice in AUSD from a pay link.
6. The same transaction repays principal and interest to the pool, takes the platform fee, and sends the balance to the exporter.
7. The exporter's credit record updates, and the next offer reflects it.

### Per actor

| Actor | Does | Sees |
|---|---|---|
| Exporter | Registers shipping bill, accepts offer, receives advance and balance | Credit tier, offer terms, invoice status, payout history |
| Lender | Deposits AUSD into the pool, withdraws idle liquidity | Pool size, utilisation, share price, funded invoices |
| Buyer | Acknowledges invoice, pays from a link | Amount due, due date, payment receipt |
| Ops | Reviews low-confidence SWIFT matches (legacy path) | Existing Bank Ops queue |

### Credit tiers (proposed defaults)

| Tier | Qualifies with | Advance rate | APR | Exposure cap (USD) |
|---|---|---|---|---|
| 0 | New exporter | 70% | 14.0% | 10,000 |
| 1 | 1 invoice realised on time | 80% | 12.5% | 50,000 |
| 2 | 3 realised, 90% on time, no default | 88% | 11.5% | 150,000 |
| 3 | 10 realised, all on time | 92% | 10.0% | 500,000 |

Any default drops the exporter to tier 0 and blocks new financing until it is cured.

## Scope

The submission must show one invoice financed and settled in AUSD on Monad, with the credit tier changing as a result.

| Priority | Item |
|---|---|
| Must | Existing contracts deployed on Monad |
| Must | FinancingPool vault in AUSD that pays the advance at lock |
| Must | Settlement waterfall that transfers AUSD in one transaction |
| Must | ExporterCredit record and tier-based pricing |
| Must | Buyer pay page and lender pool view in the web console |
| Should | Buyer acknowledgement signature (EIP-712) before financing |
| Should | Default and short-pay handling visible in the UI |
| Stretch | Privy email login with embedded wallets |
| Stretch | Per-block interest display on the exporter page |
| Mocked | INR off-ramp (existing UPI mock), ICEGATE, DGFT |
| Kept as legacy | One SWIFT MT103 preset through the existing matcher |
| Cut | eBRC verifiable-credential depth, bundle-remittance demo, fraud-remittance demo |

## Functional requirements

Each requirement is done when its acceptance check passes against the Monad deployment.

| ID | Requirement | Acceptance check |
|---|---|---|
| F1 | Register a shipping bill and mint its receivable | sbHash stored; re-registering the same bill reverts |
| F2 | Buyer acknowledges the invoice | Valid EIP-712 signature stored against sbHash; financing without it reverts |
| F3 | Offer priced from credit tier | Advance rate, APR and cap match the tier table for that exporter |
| F4 | Finance an invoice | Receivable locks to the pool; exporter's AUSD balance rises by the advance in the same transaction |
| F5 | Block double financing | Second finance call on the same sbHash reverts with `ALREADY_LOCKED` |
| F6 | Lender deposits and withdraws | ERC-4626 shares minted and burned; withdrawal above idle liquidity reverts |
| F7 | Buyer pays the invoice | One transaction moves AUSD to pool, fee wallet and exporter; the three legs sum to the amount paid |
| F8 | Short payment | Pool is repaid first; shortfall recorded; invoice shows PARTIAL |
| F9 | Late payment and default | Past due plus grace marks DEFAULTED; exporter drops to tier 0 |
| F10 | Credit update | Realisation increments the exporter's record; next offer reflects the new tier |
| F11 | Explorer | Every invoice state links to its Monad transaction |
| F12 | Legacy SWIFT path | The typo MT103 preset still matches and realises through the matcher |

### Non-functional

- Money is integer AUSD base units (6 decimals); rates are basis points with a day count, as in the current contracts.
- Raw documents stay offchain; only hashes go onchain.
- The SQLite read model stays rebuildable from chain events.
- Advance reaches the exporter within 2 seconds of accepting the offer in the demo.

## Smart contract spec

Two contracts are new, two change, and the rest deploy as they are.

| Contract | Status | Change |
|---|---|---|
| FinancingPool | New | ERC-4626 vault over AUSD; funds advances, receives repayments |
| ExporterCredit | New | Per-exporter record and tier lookup |
| RealisationEngine | Changed | Waterfall transfers AUSD instead of recording entitlements |
| ReceivableToken | Changed | Lock target is the pool; stores buyer acknowledgement |
| ShippingBillRegistry, HisabRoles | Unchanged | Redeploy |
| RemittanceRegistry, EBRCIssuer, PayoutLedger | Unchanged | Used only by the legacy SWIFT path |

### FinancingPool

```solidity
function fund(bytes32 sbHash, address exporter, uint256 advance, uint16 aprBps) external; // ENGINE_ROLE
function repay(bytes32 sbHash, uint256 principal, uint256 interest) external;             // ENGINE_ROLE
function writeDown(bytes32 sbHash) external;                                              // ENGINE_ROLE
function totalAssets() public view returns (uint256); // idle AUSD + outstanding principal
```

- Interest is recognised at repayment, so share price steps up when an invoice settles.
- `maxWithdraw` is capped at idle AUSD.
- `writeDown` removes a defaulted position's principal from `totalAssets`.

### RealisationEngine

```solidity
function finance(bytes32 sbHash) external;               // exporter; reads terms from ExporterCredit
function pay(bytes32 sbHash, uint256 amount) external;   // buyer; pulls AUSD via allowance
function markDefault(bytes32 sbHash) external;           // anyone, after dueDate + grace
```

Waterfall inside `pay`, in order:

1. `interest = principal * aprBps * daysOutstanding / (365 * 10_000)`.
2. Pool receives `min(amount, principal + interest)`.
3. Fee wallet receives `feeBps` of what remains (default 30 bps).
4. Exporter receives the rest.

### ExporterCredit

```solidity
struct Record { uint32 realised; uint32 onTime; uint32 shortPaid; uint32 defaults; uint256 volume; uint256 openExposure; }
function terms(address exporter) external view returns (uint16 advanceBps, uint16 aprBps, uint256 cap);
function onFinanced(address exporter, uint256 advance) external;                              // ENGINE_ROLE
function onRealised(address exporter, uint256 amount, bool onTime, bool shortPaid) external;  // ENGINE_ROLE
function onDefault(address exporter) external;                                                // ENGINE_ROLE
```

### Invariants to test

- Waterfall conservation: pool + fee + exporter legs equal amount (extend the existing fuzz test to token balances).
- An sbHash is financed at most once.
- A locked receivable cannot transfer.
- `openExposure` never exceeds the tier cap at the time of financing.
- Pool `totalAssets` equals idle balance plus the sum of open principals.
- `pay` on a REALISED or DEFAULTED invoice reverts.
- Only `ENGINE_ROLE` can move pool funds or write credit records.

### Events

`Financed(sbHash, exporter, advance, aprBps)`, `Paid(sbHash, payer, amount, toPool, fee, toExporter)`, `Defaulted(sbHash, exporter, shortfall)`, `TierChanged(exporter, oldTier, newTier)`. The projector rebuilds the read model from these.

## Architecture and stack

The monorepo layout stays; each layer gets a small, named change.

| Layer | Path | Reused | Change |
|---|---|---|---|
| Contracts | `contracts/` | Hardhat setup, roles, registry, existing tests | Add Monad network, AUSD address, two new contracts, token-moving waterfall |
| Matcher | `packages/matcher/` | All of it | None; serves the legacy SWIFT preset only |
| API | `apps/api/` | Fastify routes, projector, SSE, mocks | Point `RPC_URL` at Monad; add pool, credit and pay endpoints; index new events |
| Web | `apps/web/` | Exporter, Financier, Explorer tabs, design system | Financier tab becomes pool view; add buyer pay page, credit tier card, wallet connect |
| Off-ramp | `apps/api/` UPI adapter | Idempotent payout mock | Label as partner off-ramp; trigger on Paid event |

### Configuration

- Monad chain IDs and RPC endpoints: take from Monad docs (mainnet 143 and testnet 10143 from memory; verify).
- AUSD contract address on Monad: take from Agora docs. On testnet, deploy a 6-decimal mock if AUSD is absent.
- Network choice: mainnet with small real AUSD amounts if the Agora bounty requires real AUSD; otherwise testnet.
- Wallets: wagmi + viem for the must-have path; Privy embedded wallets if the stretch item ships.

## Demo script and submission

The demo is one invoice, SB 6674321 for USD 48,750, taken from registration to a tier upgrade in under three minutes.

1. Lender: deposit 100,000 AUSD into the pool; shares appear.
2. Exporter: open SB 6674321. Seeded history is 2 invoices realised on time, so the card shows tier 1: 80% at 12.5%.
3. Buyer: acknowledge the invoice from the pay link.
4. Exporter: accept the offer. 39,000 AUSD lands in the exporter wallet; show the Monad transaction and its confirmation time.
5. Exporter: try to finance the same bill again. It reverts with `ALREADY_LOCKED`.
6. Buyer: pay 48,750 AUSD. One transaction splits it (figures assume the seeded invoice is backdated 75 days):

   | Leg | AUSD |
   |---|---|
   | Pool: principal | 39,000.00 |
   | Pool: interest (12.5%, 75 days) | 1,001.71 |
   | Platform fee (30 bps of remainder) | 26.24 |
   | Exporter balance | 8,722.05 |
   | **Total** | **48,750.00** |

7. Exporter: credit card flips to tier 2; the next invoice is offered at 88% and 11.5%.
8. Lender: pool share price has stepped up by the interest earned.
9. Explorer: every state links to its transaction on Monad.

### Submission checklist

- [ ] Confirm exact cut-off, track selection and bounty opt-ins on hackathon.monad.xyz
- [ ] Check the official rules on projects also entered in other hackathons
- [ ] Contracts deployed; addresses in the README
- [ ] Public repo with a section listing what was built in the hackathon window, by commit
- [ ] Hosted web console with seeded demo data
- [ ] Demo video, 3 minutes or less
- [ ] Write-up: problem, flow, why Monad, what is mocked
- [ ] Project profile published

## Build plan, risks and open questions

The work splits into three parallel workstreams that meet at an end-to-end run on Monad.

| Order | Workstream | Tasks | Done when |
|---|---|---|---|
| 1 | Contracts | Monad config; FinancingPool; ExporterCredit; token waterfall; invariant tests | Tests pass; deployed on Monad |
| 1 | API | RPC switch; index new events; pool, credit and pay endpoints; off-ramp trigger | `pnpm e2e` passes against Monad |
| 1 | Web | Wallet connect; pool view; buyer pay page; credit tier card | Demo script runs by clicking only |
| 2 | Integration | Seed data with backdated invoice; full demo run; fixes | Two clean runs back to back |
| 3 | Submission | Video, write-up, README, profile | Checklist above complete |

### Risks

| Risk | Effect | Response |
|---|---|---|
| Submission window already closed | No entry | Confirm cut-off first; if closed, carry the build to DeltaV or the next Monad hackathon |
| Judges question legality of stablecoin export proceeds in India | Weakens the pitch | State that the AUSD leg is offshore (buyer to pool) and INR reaches the exporter through a licensed partner |
| Fake shipping bills | Pool loss | Attester role on registration plus buyer acknowledgement before financing |
| Buyer does not pay | Pool loss | Tier caps limit exposure; default drops tier; write-down is explicit in share price |
| No AUSD on testnet | Bounty ineligible | Deploy to mainnet with small amounts |
| Reused code judged as old work | Disqualification | README lists new commits; confirm all Hisab commits are dated inside the 1 Sep to 13 Oct window |

### Open questions

- [ ] What is the exact submission cut-off and time zone?
- [ ] Does the Agora bounty require real AUSD on mainnet?
- [ ] Is the track fixed at application, or can it change at submission?
- [ ] Who attests shipping bills after the hackathon: a customs data provider or the exporter's bank?
- [ ] Which licensed off-ramp partner covers USD stablecoin to INR for exporters?
