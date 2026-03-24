// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract MockProtocolController {
    uint256 public rebalanceCount;
    uint256 public totalDebtRepaid;
    bool public protectionMode;
    uint256 public lastRebalanceAmount;

    event ProtectionModeUpdated(bool indexed enabled);
    event Rebalanced(uint256 indexed amount, uint256 indexed timestamp);
    event DebtRepaid(uint256 indexed amount, uint256 indexed timestamp);

    function activateProtectionMode() external {
        protectionMode = true;
        emit ProtectionModeUpdated(true);
    }

    function deactivateProtectionMode() external {
        protectionMode = false;
        emit ProtectionModeUpdated(false);
    }

    function rebalance(uint256 amount) external {
        rebalanceCount += 1;
        lastRebalanceAmount = amount;
        emit Rebalanced(amount, block.timestamp);
    }

    function repayDebt(uint256 amount) external {
        totalDebtRepaid += amount;
        emit DebtRepaid(amount, block.timestamp);
    }
}
