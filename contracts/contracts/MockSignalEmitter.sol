// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract MockSignalEmitter {
    uint256 public latestHealthFactor;
    uint256 public latestDebtValue;

    event HealthSignal(address indexed vault, uint256 healthFactor, uint256 debtValue);
    event MetricSignal(uint256 indexed metricId, uint256 value, uint256 timestamp);

    function emitHealthSignal(address vault, uint256 healthFactor, uint256 debtValue) external {
        latestHealthFactor = healthFactor;
        latestDebtValue = debtValue;
        emit HealthSignal(vault, healthFactor, debtValue);
    }

    function emitMetricSignal(uint256 metricId, uint256 value) external {
        emit MetricSignal(metricId, value, block.timestamp);
    }
}
