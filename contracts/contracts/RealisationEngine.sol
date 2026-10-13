// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RoleAware} from "./RoleAware.sol";

interface IShippingBillRegistryEngine {
    function bills(bytes32 sbHash)
        external
        view
        returns (
            bytes32 iecHash,
            address exporter,
            uint64 fobMinor,
            bytes3 ccy,
            uint64 leoTs,
            uint8 state,
            uint64 realisedInr,
            uint64 fobInrMinor
        );
    function setState(bytes32 sbHash, uint8 newState) external;
    function addRealised(bytes32 sbHash, uint64 amount) external returns (uint64);

    function OPEN() external view returns (uint8);
    function FINANCED() external view returns (uint8);
    function PARTIAL() external view returns (uint8);
    function REALISED() external view returns (uint8);
    function DISPUTED() external view returns (uint8);
    function NONE() external view returns (uint8);
}

interface IRemittanceRegistryEngine {
    function allocate(bytes32 irmHash, uint64 allocInr) external;
}

interface IReceivableTokenEngine {
    struct Lock {
        address financier;
        uint64 lockedUnits;
        uint64 advanceInrMinor;
        uint16 rateBps;
        uint64 lockTs;
        bool active;
    }

    function primaryLock(bytes32 sbHash) external view returns (Lock memory);
    function acks(bytes32 sbHash) external view returns (address buyer, uint256 amount, uint64 dueDate, uint64 ackBlock);
    function lockFor(uint256 id, address exporter, address pool, uint256 advance, uint16 aprBps) external;
}

interface IFinancingPoolEngine {
    function fund(bytes32 sbHash, address exporter, uint256 advance, uint16 aprBps) external;
    function repay(bytes32 sbHash, uint256 principal, uint256 interest) external;
    function writeDown(bytes32 sbHash) external;
}

interface IExporterCreditEngine {
    function records(address exporter) external view returns (uint32, uint32, uint32, uint32, uint256, uint256);
    function terms(address exporter) external view returns (uint16 advanceBps, uint16 aprBps, uint256 cap);
    function onFinanced(address exporter, uint256 advance) external;
    function onRealised(address exporter, uint256 amount, uint256 principal, bool onTime, bool shortPaid) external;
    function onDefault(address exporter, uint256 principal) external;
}

/// @notice Computes and records the realisation waterfall for a shipping bill.
contract RealisationEngine is RoleAware {
    using SafeERC20 for IERC20;

    uint16 public constant PLATFORM_FEE_BPS = 35;
    uint16 public constant TOLERANCE_BPS = 200;

    struct Waterfall {
        uint64 realisedInr;
        uint64 financierDue;
        uint64 platformFee;
        uint64 exporterBalance;
        uint64 shortfall;
    }

    IShippingBillRegistryEngine public registry;
    IRemittanceRegistryEngine public remittance;
    IReceivableTokenEngine public token;
    IFinancingPoolEngine public pool;
    IExporterCreditEngine public credit;
    IERC20 public ausd;

    // --- AUSD financing path ---
    enum Status { NONE, FINANCED, REALISED, PARTIAL, DEFAULTED }

    struct Position {
        address exporter;
        address buyer;
        uint256 amount;
        uint256 principal;
        uint16 aprBps;
        uint64 financedAt;
        uint64 dueDate;
        Status status;
        uint256 shortfall;
        uint64 financedBlock;
        uint64 settledBlock;
    }

    uint64 public constant GRACE = 15 days;

    uint16 public feeBps = 30;
    address public feeWallet;
    bool public demoMode;

    mapping(bytes32 => Position) public positions;
    mapping(bytes32 => uint64) public demoBackdate;

    event Realised(bytes32 indexed sbHash, bytes32 indexed irmHash, uint64 allocInr, address indexed by, uint16 confidencePct);
    event WaterfallComputed(
        bytes32 indexed sbHash,
        uint64 realisedInr,
        uint64 financierDue,
        uint64 platformFee,
        uint64 exporterBalance,
        uint64 shortfall
    );

    event Financed(bytes32 indexed sbHash, address indexed exporter, uint256 advance, uint16 aprBps);
    event Paid(bytes32 indexed sbHash, address indexed payer, uint256 amount, uint256 toPool, uint256 fee, uint256 toExporter);
    event Defaulted(bytes32 indexed sbHash, address indexed exporter, uint256 shortfall);

    error ALREADY_LOCKED();
    error NO_ACK();
    error NOT_EXPORTER();
    error CAP_EXCEEDED();
    error DEFAULT_OUTSTANDING();
    error NOT_FINANCED();
    error OVERPAY();
    error NOT_DUE();
    error DemoModeOff();
    error IRMOverAllocated();
    error ConfidenceTooLow();
    error InvalidState();
    error DependenciesNotSet();

    constructor(address rolesAddr) RoleAware(rolesAddr) {}

    function setRegistry(address registryAddr) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        registry = IShippingBillRegistryEngine(registryAddr);
    }

    function setRemittance(address remittanceAddr) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        remittance = IRemittanceRegistryEngine(remittanceAddr);
    }

    function setToken(address tokenAddr) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        token = IReceivableTokenEngine(tokenAddr);
    }

    function setPool(address poolAddr) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        pool = IFinancingPoolEngine(poolAddr);
    }

    function setCredit(address creditAddr) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        credit = IExporterCreditEngine(creditAddr);
    }

    function setAusd(address ausdAddr) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        ausd = IERC20(ausdAddr);
    }

    function setFeeWallet(address wallet) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        feeWallet = wallet;
    }

    function setDemoMode(bool on) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        demoMode = on;
    }

    /// @notice Demo only: make the next finance() of this bill look `secs` old so interest accrues.
    function setDemoBackdate(bytes32 sbHash, uint64 secs) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        if (!demoMode) revert DemoModeOff();
        demoBackdate[sbHash] = secs;
    }

    // ---------------------------------------------------------------- AUSD financing

    /// @notice Exporter takes the advance on an acknowledged invoice. Advance AUSD lands in their wallet.
    function finance(bytes32 sbHash) external {
        Position storage p = positions[sbHash];
        if (p.status != Status.NONE) revert ALREADY_LOCKED();

        (, address exporter, , , , uint8 st, , ) = registry.bills(sbHash);
        if (msg.sender != exporter) revert NOT_EXPORTER();
        if (st == registry.FINANCED()) revert ALREADY_LOCKED();
        if (st != registry.OPEN()) revert InvalidState();

        (address buyer, uint256 ackAmount, uint64 dueDate, ) = token.acks(sbHash);
        if (buyer == address(0)) revert NO_ACK();

        (, , , uint32 defaults, , uint256 openExposure) = credit.records(exporter);
        if (defaults > 0) revert DEFAULT_OUTSTANDING();
        (uint16 advanceBps, uint16 aprBps, uint256 cap) = credit.terms(exporter);
        uint256 advance = ackAmount * advanceBps / 10_000;
        if (openExposure + advance > cap) revert CAP_EXCEEDED();

        p.exporter = exporter;
        p.buyer = buyer;
        p.amount = ackAmount;
        p.principal = advance;
        p.aprBps = aprBps;
        p.financedAt = uint64(block.timestamp) - demoBackdate[sbHash];
        p.dueDate = dueDate;
        p.status = Status.FINANCED;
        p.financedBlock = uint64(block.number);

        token.lockFor(uint256(sbHash), exporter, address(pool), advance, aprBps);
        pool.fund(sbHash, exporter, advance, aprBps);
        credit.onFinanced(exporter, advance);

        emit Financed(sbHash, exporter, advance, aprBps);
    }

    /// @notice Anyone (the buyer, via the pay link) pays AUSD toward the invoice. One-shot settlement.
    function pay(bytes32 sbHash, uint256 amount) external {
        Position storage p = positions[sbHash];
        if (p.status != Status.FINANCED) revert NOT_FINANCED();
        // zero is refused so a dust/zero payment cannot close the invoice as PARTIAL
        if (amount == 0 || amount > p.amount) revert OVERPAY();

        (uint256 toPool, uint256 interest, uint256 fee, uint256 toExporter) = _split(p, amount);
        bool onTime = block.timestamp <= p.dueDate;
        bool shortPaid = amount < p.amount;

        p.status = shortPaid ? Status.PARTIAL : Status.REALISED;
        p.shortfall = p.amount - amount;
        p.settledBlock = uint64(block.number);
        registry.setState(sbHash, shortPaid ? registry.PARTIAL() : registry.REALISED());

        ausd.safeTransferFrom(msg.sender, address(pool), toPool);
        if (fee > 0) ausd.safeTransferFrom(msg.sender, feeWallet, fee);
        if (toExporter > 0) ausd.safeTransferFrom(msg.sender, p.exporter, toExporter);

        pool.repay(sbHash, toPool - interest, interest);
        credit.onRealised(p.exporter, amount, p.principal, onTime, shortPaid);

        emit Paid(sbHash, msg.sender, amount, toPool, fee, toExporter);
    }

    /// @notice Anyone may write off an invoice that is still unpaid after due date + grace.
    function markDefault(bytes32 sbHash) external {
        Position storage p = positions[sbHash];
        if (p.status != Status.FINANCED) revert NOT_FINANCED();
        if (block.timestamp <= p.dueDate + GRACE) revert NOT_DUE();

        p.status = Status.DEFAULTED;
        p.shortfall = p.amount;
        p.settledBlock = uint64(block.number);

        pool.writeDown(sbHash);
        credit.onDefault(p.exporter, p.principal);

        emit Defaulted(sbHash, p.exporter, p.shortfall);
    }

    /// @notice Waterfall for paying the full invoice amount right now.
    function quote(bytes32 sbHash) external view returns (uint256 toPool, uint256 interest, uint256 fee, uint256 toExporter) {
        Position storage p = positions[sbHash];
        if (p.status != Status.FINANCED) return (0, 0, 0, 0);
        return _split(p, p.amount);
    }

    /// @dev interest accrues ACT/365 on whole days; `interest` is the part of toPool above principal.
    function _split(Position storage p, uint256 amount)
        internal
        view
        returns (uint256 toPool, uint256 interest, uint256 fee, uint256 toExporter)
    {
        uint256 days_ = (block.timestamp - p.financedAt) / 1 days;
        uint256 owed = p.principal + p.principal * p.aprBps * days_ / (365 * 10_000);
        toPool = amount < owed ? amount : owed;
        interest = toPool > p.principal ? toPool - p.principal : 0;
        fee = (amount - toPool) * feeBps / 10_000;
        toExporter = amount - toPool - fee;
    }

    function realise(bytes32 sbHash, bytes32 irmHash, uint64 allocInr, uint16 confidencePct) external {
        bool isAdBank = roles.hasRole(roles.AD_BANK_ROLE(), msg.sender);
        bool isOps = roles.hasRole(roles.OPS_ROLE(), msg.sender);
        if (!isAdBank && !isOps) revert Unauthorized(roles.AD_BANK_ROLE(), msg.sender);
        if (address(registry) == address(0) || address(remittance) == address(0) || address(token) == address(0)) {
            revert DependenciesNotSet();
        }

        (, , , , , uint8 st, , uint64 fobInrMinor) = registry.bills(sbHash);
        uint8 NONE_ = registry.NONE();
        uint8 DISPUTED_ = registry.DISPUTED();
        uint8 REALISED_ = registry.REALISED();
        if (st == NONE_ || st == DISPUTED_ || st == REALISED_) revert InvalidState();

        if (confidencePct < 92 && !isOps) revert ConfidenceTooLow();

        // Reverts IRMOverAllocated inside RemittanceRegistry if over-consumed.
        remittance.allocate(irmHash, allocInr);

        uint64 cumulativeRealised = registry.addRealised(sbHash, allocInr);

        uint64 threshold = uint64((uint256(fobInrMinor) * (10_000 - TOLERANCE_BPS)) / 10_000);
        uint8 newState = cumulativeRealised >= threshold ? REALISED_ : registry.PARTIAL();
        registry.setState(sbHash, newState);

        emit Realised(sbHash, irmHash, allocInr, msg.sender, confidencePct);

        if (newState == REALISED_) {
            Waterfall memory wf = computeWaterfall(sbHash, cumulativeRealised);
            emit WaterfallComputed(sbHash, wf.realisedInr, wf.financierDue, wf.platformFee, wf.exporterBalance, wf.shortfall);
        }
    }

    function computeWaterfall(bytes32 sbHash, uint64 realisedInr) public view returns (Waterfall memory wf) {
        IReceivableTokenEngine.Lock memory L = token.primaryLock(sbHash);

        wf.realisedInr = realisedInr;

        if (L.financier == address(0)) {
            // Never financed: nothing is owed to a financier or the platform.
            wf.financierDue = 0;
            wf.platformFee = 0;
            wf.exporterBalance = realisedInr;
            wf.shortfall = 0;
            return wf;
        }

        uint64 daysElapsed = (uint64(block.timestamp) - L.lockTs) / 1 days;
        uint64 interest = uint64((uint256(L.advanceInrMinor) * L.rateBps * daysElapsed) / (10_000 * 365));
        wf.financierDue = L.advanceInrMinor + interest;
        wf.platformFee = uint64((uint256(L.advanceInrMinor) * PLATFORM_FEE_BPS) / 10_000);

        if (realisedInr >= wf.financierDue + wf.platformFee) {
            wf.exporterBalance = realisedInr - wf.financierDue - wf.platformFee;
        } else if (realisedInr >= wf.financierDue) {
            wf.platformFee = realisedInr - wf.financierDue; // fee absorbs first
            wf.exporterBalance = 0;
        } else {
            wf.shortfall = wf.financierDue - realisedInr;
            wf.platformFee = 0;
            wf.exporterBalance = 0;
        }
    }
}
