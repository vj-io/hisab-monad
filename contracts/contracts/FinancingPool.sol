// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {RoleAware} from "./RoleAware.sol";

/// @notice ERC-4626 AUSD vault. Only the engine moves funds out (advances) or books repayments.
/// totalAssets = idle AUSD + principal currently advanced; withdrawals are limited to idle AUSD.
contract FinancingPool is ERC4626, RoleAware {
    using SafeERC20 for IERC20;

    struct Position {
        address exporter;
        uint256 principal;
        uint16 aprBps;
        bool open;
    }

    mapping(bytes32 => Position) public positions;
    uint256 public outstandingPrincipal;
    address public engine;

    event Funded(bytes32 indexed sbHash, address indexed exporter, uint256 advance, uint16 aprBps);
    event Repaid(bytes32 indexed sbHash, uint256 principal, uint256 interest);
    event WrittenDown(bytes32 indexed sbHash, uint256 principal);

    error NotEngine();
    error EngineAlreadySet();
    error PositionOpen();
    error PositionNotOpen();

    constructor(address ausd, address rolesAddr)
        ERC4626(IERC20(ausd))
        ERC20("Hisab Pool Share", "hPOOL")
        RoleAware(rolesAddr)
    {}

    modifier onlyEngine() {
        if (msg.sender != engine) revert NotEngine();
        _;
    }

    /// @notice One-shot wiring of the engine.
    function setEngine(address engineAddr) external onlyRole(roles.DEFAULT_ADMIN_ROLE()) {
        if (engine != address(0)) revert EngineAlreadySet();
        engine = engineAddr;
    }

    function fund(bytes32 sbHash, address exporter, uint256 advance, uint16 aprBps) external onlyEngine {
        if (positions[sbHash].open) revert PositionOpen();
        positions[sbHash] = Position(exporter, advance, aprBps, true);
        outstandingPrincipal += advance;
        IERC20(asset()).safeTransfer(exporter, advance);
        emit Funded(sbHash, exporter, advance, aprBps);
    }

    /// @notice The engine has already transferred principal + interest in; this only closes the position.
    function repay(bytes32 sbHash, uint256 principal, uint256 interest) external onlyEngine {
        _close(sbHash);
        emit Repaid(sbHash, principal, interest);
    }

    /// @notice Principal leaves outstandingPrincipal with no cash coming in, so totalAssets drops.
    function writeDown(bytes32 sbHash) external onlyEngine {
        emit WrittenDown(sbHash, _close(sbHash));
    }

    function idle() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function totalAssets() public view override returns (uint256) {
        return idle() + outstandingPrincipal;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), idle());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner), convertToShares(idle()));
    }

    function _close(bytes32 sbHash) internal returns (uint256 principal) {
        Position storage p = positions[sbHash];
        if (!p.open) revert PositionNotOpen();
        p.open = false;
        principal = p.principal;
        outstandingPrincipal -= principal;
    }
}
