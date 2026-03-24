import type { WalletClient } from "viem";
import { toFunctionSelector, zeroAddress } from "viem";
import { SOMNIA_REACTIVITY_PRECOMPILE, somniaReactivityPrecompileAbi } from "./somniaPrecompile.js";

const ON_EVENT_SELECTOR = toFunctionSelector(
  "function onEvent(address,bytes32[],bytes)",
);

function toUint64(n: bigint, label: string): bigint {
  const max = (1n << 64n) - 1n;
  if (n < 0n || n > max) {
    throw new Error(`${label} must fit uint64 (got ${n})`);
  }
  return n;
}

export type SubscribePrecompileArgs = {
  eventTopics: readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`];
  emitter: `0x${string}`;
  handlerContractAddress: `0x${string}`;
  priorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  isGuaranteed: boolean;
  isCoalesced: boolean;
  handlerFunctionSelector?: `0x${string}`;
};

/**
 * Calls precompile `subscribe` directly. Needed because `@somnia-chain/reactivity` v0.1.10 rejects
 * `emitter === 0x…0100` in `createSoliditySubscription`, which breaks `createOnchainBlockTickSubscription`
 * and `scheduleOnchainCronJob` (they set the precompile as emitter for system events).
 */
export async function subscribeViaPrecompile(
  walletClient: WalletClient,
  args: SubscribePrecompileArgs,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) {
    throw new Error("WalletClient has no account");
  }
  const chain = walletClient.chain;
  if (!chain) {
    throw new Error("WalletClient has no chain");
  }

  const subscriptionData = {
    eventTopics: [...args.eventTopics] as [
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
    ],
    origin: zeroAddress,
    caller: zeroAddress,
    emitter: args.emitter,
    handlerContractAddress: args.handlerContractAddress,
    handlerFunctionSelector: (args.handlerFunctionSelector ??
      ON_EVENT_SELECTOR) as `0x${string}`,
    priorityFeePerGas: toUint64(args.priorityFeePerGas, "priorityFeePerGas"),
    maxFeePerGas: toUint64(args.maxFeePerGas, "maxFeePerGas"),
    gasLimit: toUint64(args.gasLimit, "gasLimit"),
    isGuaranteed: args.isGuaranteed,
    isCoalesced: args.isCoalesced,
  };

  return walletClient.writeContract({
    address: SOMNIA_REACTIVITY_PRECOMPILE,
    abi: somniaReactivityPrecompileAbi,
    functionName: "subscribe",
    args: [subscriptionData],
    chain,
    account,
  });
}
