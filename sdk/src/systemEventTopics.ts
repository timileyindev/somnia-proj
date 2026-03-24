import { keccak256, numberToHex, toBytes } from "viem";

/** Must match `ReactiveAutopilotHandler` / Somnia system events. */
export const blockTickTopic0 = keccak256(toBytes("BlockTick(uint64)"));
export const epochTickTopic0 = keccak256(toBytes("EpochTick(uint64,uint64)"));
export const scheduleTopic0 = keccak256(toBytes("Schedule(uint256)"));

export const zeroTopic32 = numberToHex(0n, { size: 32 });
