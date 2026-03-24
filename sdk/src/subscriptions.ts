import type { SDK } from "@somnia-chain/reactivity";
import { numberToHex } from "viem";
import type { WalletClient } from "viem";
import type { DeploymentManifest, ReactivityGasConfig, StandardSubscriptionSummary } from "./types.js";
import { baseSoliditySubscription } from "./client.js";
import { subscribeViaPrecompile } from "./subscribePrecompile.js";
import { SOMNIA_REACTIVITY_PRECOMPILE } from "./somniaPrecompile.js";
import {
  blockTickTopic0,
  epochTickTopic0,
  scheduleTopic0,
  zeroTopic32,
} from "./systemEventTopics.js";

function throwIfError<T>(result: T | Error, message: string): T {
  if (result instanceof Error) {
    throw new Error(`${message}: ${result.message}`);
  }
  return result;
}

export type CreateStandardSubscriptionsParams = {
  sdk: SDK;
  /** Required for BlockTick / EpochTick / Schedule subs: `@somnia-chain/reactivity` v0.1.10 rejects precompile emitters. */
  walletClient: WalletClient;
  deployment: DeploymentManifest;
  gas: ReactivityGasConfig;
  /** Milliseconds from now for one-off Schedule callback */
  scheduleDelayMs?: number;
};

/**
 * Creates the default hackathon subscriptions: all events from the mock emitter (wildcard topics),
 * BlockTick, and one Schedule.
 *
 * Omitting `eventTopics` lets `@somnia-chain/reactivity` pad `eventTopics` to four `bytes32(0)`
 * entries, which match any log topics from that emitter. Separate per-signature subscriptions are
 * not required for HealthSignal vs MetricSignal, and jobs/alerts still filter by `topic0` in the
 * handler. Do **not** confuse that with passing `[zeroHash]` as the only topic — that would only
 * match logs whose first topic is literally zero (no standard Solidity events do that).
 *
 * **Block tick, epoch tick, schedule:** `@somnia-chain/reactivity` 0.1.10’s `createSoliditySubscription`
 * returns `"Emitter cannot be set to the precompile"` when `emitter` is `0x…0100`, which breaks
 * `createOnchainBlockTickSubscription` and `scheduleOnchainCronJob`. Those are sent here via
 * `subscribeViaPrecompile` using the same `SubscriptionData` shape as the official Solidity examples.
 */
export async function createStandardAutopilotSubscriptions(
  params: CreateStandardSubscriptionsParams,
): Promise<StandardSubscriptionSummary> {
  const { sdk, walletClient, deployment, gas } = params;
  const scheduleDelayMs = params.scheduleDelayMs ?? 90_000;
  const handlerContractAddress = deployment.contracts.reactiveAutopilotHandler;
  const common = baseSoliditySubscription(handlerContractAddress, gas);

  const mockEmitterSubscriptionTx = throwIfError(
    await sdk.createSoliditySubscription({
      ...common,
      emitter: deployment.contracts.mockSignalEmitter,
    }),
    "Failed to create mock signal emitter (all events) subscription",
  );

  const blockTickSubscriptionTx = await subscribeViaPrecompile(walletClient, {
    eventTopics: [
      blockTickTopic0,
      zeroTopic32,
      zeroTopic32,
      zeroTopic32,
    ],
    emitter: SOMNIA_REACTIVITY_PRECOMPILE,
    handlerContractAddress: common.handlerContractAddress,
    priorityFeePerGas: common.priorityFeePerGas,
    maxFeePerGas: common.maxFeePerGas,
    gasLimit: common.gasLimit,
    isGuaranteed: common.isGuaranteed,
    isCoalesced: common.isCoalesced,
  });

  const epochTickSubscriptionTx = await subscribeViaPrecompile(walletClient, {
    eventTopics: [
      epochTickTopic0,
      zeroTopic32,
      zeroTopic32,
      zeroTopic32,
    ],
    emitter: SOMNIA_REACTIVITY_PRECOMPILE,
    handlerContractAddress: common.handlerContractAddress,
    priorityFeePerGas: common.priorityFeePerGas,
    maxFeePerGas: common.maxFeePerGas,
    gasLimit: common.gasLimit,
    isGuaranteed: common.isGuaranteed,
    isCoalesced: common.isCoalesced,
  });

  const scheduleTimestamp = Date.now() + scheduleDelayMs;
  const scheduleSubscriptionTx = await subscribeViaPrecompile(walletClient, {
    eventTopics: [
      scheduleTopic0,
      numberToHex(BigInt(scheduleTimestamp), { size: 32 }),
      zeroTopic32,
      zeroTopic32,
    ],
    emitter: SOMNIA_REACTIVITY_PRECOMPILE,
    handlerContractAddress: common.handlerContractAddress,
    priorityFeePerGas: common.priorityFeePerGas,
    maxFeePerGas: common.maxFeePerGas,
    gasLimit: common.gasLimit,
    isGuaranteed: common.isGuaranteed,
    isCoalesced: common.isCoalesced,
  });

  return {
    createdAt: new Date().toISOString(),
    handlerContractAddress,
    subscriptions: {
      mockSignalEmitterTx: mockEmitterSubscriptionTx,
      blockTickTx: blockTickSubscriptionTx,
      epochTickTx: epochTickSubscriptionTx,
      scheduleTx: scheduleSubscriptionTx,
      scheduleTimestamp,
    },
  };
}
