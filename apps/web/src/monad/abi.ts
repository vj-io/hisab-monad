import { parseAbi } from 'viem';

// Human-readable ABIs written from MONAD_SPEC.md.
export const errorsAbi = parseAbi([
  'error ALREADY_LOCKED()',
  'error NO_ACK()',
  'error NOT_EXPORTER()',
  'error CAP_EXCEEDED()',
  'error DEFAULT_OUTSTANDING()',
  'error NOT_FINANCED()',
  'error OVERPAY()',
  'error NOT_DUE()',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
  'error ERC4626ExceededMaxWithdraw(address owner, uint256 assets, uint256 max)',
  'error ERC4626ExceededMaxDeposit(address receiver, uint256 assets, uint256 max)',
]);

export const ausdAbi = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);

export const poolAbi = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function outstandingPrincipal() view returns (uint256)',
  'function idle() view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function maxWithdraw(address owner) view returns (uint256)',
  'function positions(bytes32) view returns (address exporter, uint256 principal, uint16 aprBps, bool open)',
]);

export const creditAbi = parseAbi([
  'function records(address) view returns (uint32 realised, uint32 onTime, uint32 shortPaid, uint32 defaults, uint256 volume, uint256 openExposure)',
  'function tierOf(address exporter) view returns (uint8)',
  'function terms(address exporter) view returns (uint16 advanceBps, uint16 aprBps, uint256 cap)',
  'function seed(address exporter, uint32 realised, uint32 onTime, uint256 volume)',
]);

export const registryAbi = parseAbi([
  'function registerShippingBill(bytes32 sbHash, bytes32 iecHash, address exporter, uint64 fobMinor, bytes3 ccy, uint64 leoTs, uint64 fobInrMinor)',
  'function bills(bytes32) view returns (bytes32 iecHash, address exporter, uint64 fobMinor, bytes3 ccy, uint64 leoTs, uint8 state, uint64 realisedInr, uint64 fobInrMinor)',
]);

export const tokenAbi = parseAbi([
  'function acknowledge(bytes32 sbHash, address buyer, uint256 amount, uint64 dueDate, bytes sig)',
  'function acks(bytes32) view returns (address buyer, uint256 amount, uint64 dueDate, uint64 ackBlock)',
  'function mintedBlock(uint256 id) view returns (uint64)',
]);

export const engineAbi = parseAbi([
  'function finance(bytes32 sbHash)',
  'function pay(bytes32 sbHash, uint256 amount)',
  'function markDefault(bytes32 sbHash)',
  'function setDemoBackdate(bytes32 sbHash, uint64 secs)',
  'function quote(bytes32 sbHash) view returns (uint256 toPool, uint256 interest, uint256 fee, uint256 toExporter)',
  'function positions(bytes32) view returns (address exporter, address buyer, uint256 amount, uint256 principal, uint16 aprBps, uint64 financedAt, uint64 dueDate, uint8 status, uint256 shortfall, uint64 financedBlock, uint64 settledBlock)',
  'event Financed(bytes32 indexed sbHash, address indexed exporter, uint256 advance, uint16 aprBps)',
  'event Paid(bytes32 indexed sbHash, address indexed payer, uint256 amount, uint256 toPool, uint256 fee, uint256 toExporter)',
  'event Defaulted(bytes32 indexed sbHash, address indexed exporter, uint256 shortfall)',
]);
