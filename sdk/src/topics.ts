import { keccak256, toBytes } from "viem";

export const healthSignalTopic = keccak256(toBytes("HealthSignal(address,uint256,uint256)"));
export const metricSignalTopic = keccak256(toBytes("MetricSignal(uint256,uint256,uint256)"));
