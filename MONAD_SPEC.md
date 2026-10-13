# Hisab on Monad — build spec (shared contract between workstreams)

Source of truth for product intent: `PRD.md`. This file pins the exact interfaces so the
contracts and web workstreams can build in parallel. Change it only together with both sides.

## Network

- Monad testnet, chainId `10143`, RPC `https://testnet-rpc.monad.xyz`, native gas token MON.
- Explorer tx link: `https://testnet.monadexplorer.com/tx/<hash>`, address link `.../address/<addr>`.
- No AUSD on testnet: deploy `MockAUSD` (ERC-20, name "Agora USD (Mock)", symbol "AUSD", 6 decimals,
  `mint(address to, uint256 amount)` open to anyone — testnet faucet).

## Units

- Money: AUSD base units, 6 decimals. Registry `fobMinor` stays USD cents (2 dp);
  invoice amount in AUSD = `fobMinor * 1e4`.
- Rates: basis points; interest day count `days = (now - financedAt) / 1 days`, ACT/365.

## Contracts (Hardhat, Solidity 0.8.24, `contracts/contracts/`)

Legacy contracts and functions stay working (existing tests stay green): `RealisationEngine.realise`,
`ReceivableToken.lock/release`, `RemittanceRegistry`, `EBRCIssuer`, `PayoutLedger`.

### MockAUSD (new)
ERC20 6 decimals, `mint(address,uint256)` public.

### FinancingPool (new) — ERC-4626 over AUSD, name "Hisab Pool Share", symbol "hPOOL"
```solidity
function fund(bytes32 sbHash, address exporter, uint256 advance, uint16 aprBps) external; // ENGINE only
function repay(bytes32 sbHash, uint256 principal, uint256 interest) external;            // ENGINE only; AUSD already transferred in by engine; closes position
function writeDown(bytes32 sbHash) external;                                             // ENGINE only; closes position, principal leaves totalAssets
function totalAssets() public view returns (uint256);   // AUSD.balanceOf(pool) + outstandingPrincipal
function outstandingPrincipal() external view returns (uint256);
function idle() external view returns (uint256);        // AUSD.balanceOf(pool)
function positions(bytes32) external view returns (address exporter, uint256 principal, uint16 aprBps, bool open);
// maxWithdraw / maxRedeem capped at idle liquidity; withdraw above idle reverts.
event Funded(bytes32 indexed sbHash, address indexed exporter, uint256 advance, uint16 aprBps);
event Repaid(bytes32 indexed sbHash, uint256 principal, uint256 interest);
event WrittenDown(bytes32 indexed sbHash, uint256 principal);
```
`engine` address set once by admin (`setEngine`). Only engine moves pool funds.

### ExporterCredit (new)
```solidity
struct Record { uint32 realised; uint32 onTime; uint32 shortPaid; uint32 defaults; uint256 volume; uint256 openExposure; }
function records(address) external view returns (uint32,uint32,uint32,uint32,uint256,uint256);
function tierOf(address exporter) external view returns (uint8);
function terms(address exporter) external view returns (uint16 advanceBps, uint16 aprBps, uint256 cap); // cap in AUSD base units
function onFinanced(address exporter, uint256 advance) external;                               // ENGINE only
function onRealised(address exporter, uint256 amount, uint256 principal, bool onTime, bool shortPaid) external; // ENGINE only; openExposure -= principal
function onDefault(address exporter, uint256 principal) external;                              // ENGINE only
function seed(address exporter, uint32 realised, uint32 onTime, uint256 volume) external;      // ADMIN only, demoMode only
event TierChanged(address indexed exporter, uint8 oldTier, uint8 newTier);
```
Tiers (advanceBps, aprBps, cap USD): 0 = 7000, 1400, 10,000 · 1 = 8000, 1250, 50,000 ·
2 = 8800, 1150, 150,000 · 3 = 9200, 1000, 500,000.
Rules: defaults > 0 → tier 0 and financing blocked; realised ≥ 10 && onTime == realised → 3;
realised ≥ 3 && onTime*10 ≥ realised*9 → 2; onTime ≥ 1 → 1; else 0.
(Note PRD's interface omits `principal` on onRealised/onDefault; it is added so openExposure can be released.)

### ReceivableToken (changed)
Adds buyer acknowledgement (EIP-712, domain name "Hisab", version "1", chainId, verifyingContract = ReceivableToken):
```solidity
// typehash: Acknowledgement(bytes32 sbHash,address buyer,uint256 amount,uint64 dueDate)
function acknowledge(bytes32 sbHash, address buyer, uint256 amount, uint64 dueDate, bytes calldata sig) external; // anyone submits; sig must recover to buyer; once only
function acks(bytes32) external view returns (address buyer, uint256 amount, uint64 dueDate, uint64 ackBlock);
function mintedBlock(uint256 id) external view returns (uint64);   // block of registration mint
function lockFor(uint256 id, address exporter, address pool, uint256 advance, uint16 aprBps) external; // ENGINE (INTERNAL_ROLE) only; moves full supply into escrow; reverts AlreadyLocked if locked
event Acknowledged(bytes32 indexed sbHash, address indexed buyer, uint256 amount, uint64 dueDate);
```
Locked units cannot transfer (existing `_update` guard).

### RealisationEngine (changed) — new token-moving path alongside legacy `realise`
```solidity
enum Status { NONE, FINANCED, REALISED, PARTIAL, DEFAULTED }   // uint8 0..4
function finance(bytes32 sbHash) external;             // msg.sender must be bill exporter; requires ack; reads ExporterCredit.terms
function pay(bytes32 sbHash, uint256 amount) external; // anyone (buyer via pay link); pulls AUSD via allowance; requires FINANCED; amount <= invoice amount
function markDefault(bytes32 sbHash) external;         // anyone; requires FINANCED and block.timestamp > dueDate + GRACE (15 days)
function quote(bytes32 sbHash) external view returns (uint256 toPool, uint256 interest, uint256 fee, uint256 toExporter); // for full invoice amount, at now
function positions(bytes32) external view returns (
  address exporter, address buyer, uint256 amount, uint256 principal, uint16 aprBps,
  uint64 financedAt, uint64 dueDate, uint8 status, uint256 shortfall,
  uint64 financedBlock, uint64 settledBlock);
function setDemoBackdate(bytes32 sbHash, uint64 secs) external; // ADMIN only, demoMode only; finance sets financedAt = now - secs
uint16 public feeBps = 30; address public feeWallet;
error ALREADY_LOCKED(); error NO_ACK(); error NOT_EXPORTER(); error CAP_EXCEEDED(); error DEFAULT_OUTSTANDING();
error NOT_FINANCED(); error OVERPAY(); error NOT_DUE();
event Financed(bytes32 indexed sbHash, address indexed exporter, uint256 advance, uint16 aprBps);
event Paid(bytes32 indexed sbHash, address indexed payer, uint256 amount, uint256 toPool, uint256 fee, uint256 toExporter);
event Defaulted(bytes32 indexed sbHash, address indexed exporter, uint256 shortfall);
```
finance: reverts `ALREADY_LOCKED` if position exists (status != NONE) — checked first.
advance = amount * advanceBps / 10_000; `openExposure + advance <= cap` else CAP_EXCEEDED.
Calls `token.lockFor`, `pool.fund` (pool transfers advance to exporter), `credit.onFinanced`,
registry state → FINANCED.
pay waterfall: interest = principal*aprBps*days/(365*10_000); toPool = min(amount, principal+interest);
fee = (amount - toPool) * feeBps / 10_000; toExporter = rest. One tx; legs sum to amount.
onTime = block.timestamp <= dueDate. shortPaid = amount < invoice amount → status PARTIAL,
shortfall = invoice amount - amount; else REALISED. Registry state set to REALISED / PARTIAL.
Then credit.onRealised. Interest for repay = toPool - min(toPool, principal).

Demo check (backdated 75 days, tier 1, amount 48,750 AUSD): advance 39,000; interest 1,001.712328;
fee 26.244863 (floor); exporter 8,722.042... (exact per integer math; test asserts legs sum to amount).

## Deployment artefact

`contracts/deployments/monad-testnet.json`:
`{ chainId, rpcUrl, explorer, deployBlock, contracts: { roles, registry, token, engine, pool, credit, ausd, ... } }`
plus ABIs exported to `apps/web/src/monad/abi/*.json` (script `pnpm -F @hisab/contracts export:web`).
Deployer EOA holds DEFAULT_ADMIN, CUSTOMS roles; engine has INTERNAL_ROLE; demoMode = true on testnet.
Key read from `contracts/.env` `DEPLOYER_PRIVATE_KEY` (never commit).

## Demo identity

`sbHash = keccak256(abi.encode("SB 6674321", exporter))` so each demo exporter gets a fresh bill.
Seed (server, deployer key): register SB (fobMinor 4_875_000 = USD 48,750.00, ccy "USD"),
`credit.seed(exporter, 2, 2, 2 invoices volume)`, `engine.setDemoBackdate(sbHash, 75 days)`.
Buyer ack dueDate = now + 30 days (after backdate the invoice is 75 days financed, still on time).
