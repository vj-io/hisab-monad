// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {RoleAware} from "./RoleAware.sol";

/// @notice Onchain repayment record per exporter. Tier (and therefore advance terms) is derived
/// from the record; only the engine writes it.
contract ExporterCredit is RoleAware {
    struct Record {
        uint32 realised;
        uint32 onTime;
        uint32 shortPaid;
        uint32 defaults;
        uint256 volume;
        uint256 openExposure;
    }

    mapping(address => Record) public records;
    address public engine;
    bool public demoMode;

    event TierChanged(address indexed exporter, uint8 oldTier, uint8 newTier);

    error NotEngine();
    error EngineAlreadySet();
    error DemoModeOff();

    constructor(address rolesAddr) RoleAware(rolesAddr) {}

    modifier onlyEngine() {
        if (msg.sender != engine) revert NotEngine();
        _;
    }

    /// @notice One-shot wiring of the engine.
    function setEngine(address engineAddr) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        if (engine != address(0)) revert EngineAlreadySet();
        engine = engineAddr;
    }

    function setDemoMode(bool on) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        demoMode = on;
    }

    function tierOf(address exporter) public view returns (uint8) {
        Record storage r = records[exporter];
        if (r.defaults > 0) return 0;
        if (r.realised >= 10 && r.onTime == r.realised) return 3;
        if (r.realised >= 3 && uint256(r.onTime) * 10 >= uint256(r.realised) * 9) return 2;
        if (r.onTime >= 1) return 1;
        return 0;
    }

    /// @return advanceBps share of the invoice advanced, aprBps annual rate, cap max open exposure (AUSD units)
    function terms(address exporter) external view returns (uint16 advanceBps, uint16 aprBps, uint256 cap) {
        uint8 t = tierOf(exporter);
        if (t == 3) return (9200, 1000, 500_000e6);
        if (t == 2) return (8800, 1150, 150_000e6);
        if (t == 1) return (8000, 1250, 50_000e6);
        return (7000, 1400, 10_000e6);
    }

    function onFinanced(address exporter, uint256 advance) external onlyEngine {
        records[exporter].openExposure += advance;
    }

    function onRealised(address exporter, uint256 amount, uint256 principal, bool onTime, bool shortPaid)
        external
        onlyEngine
    {
        uint8 old = tierOf(exporter);
        Record storage r = records[exporter];
        r.realised++;
        if (onTime) r.onTime++;
        if (shortPaid) r.shortPaid++;
        r.volume += amount;
        r.openExposure -= principal;
        _emitTier(exporter, old);
    }

    function onDefault(address exporter, uint256 principal) external onlyEngine {
        uint8 old = tierOf(exporter);
        Record storage r = records[exporter];
        r.defaults++;
        r.openExposure -= principal;
        _emitTier(exporter, old);
    }

    /// @notice Demo only: plant a repayment history so the walkthrough starts at tier 1.
    function seed(address exporter, uint32 realised, uint32 onTime, uint256 volume)
        external
        onlyRole(roles.DEFAULT_ADMIN_ROLE())
    {
        if (!demoMode) revert DemoModeOff();
        uint8 old = tierOf(exporter);
        Record storage r = records[exporter];
        r.realised = realised;
        r.onTime = onTime;
        r.volume = volume;
        _emitTier(exporter, old);
    }

    function _emitTier(address exporter, uint8 old) internal {
        uint8 t = tierOf(exporter);
        if (t != old) emit TierChanged(exporter, old, t);
    }
}
