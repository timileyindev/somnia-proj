import type { SDK } from "@somnia-chain/reactivity";
import type { DeploymentManifest, ReactivityGasConfig, StandardSubscriptionSummary } from "./types.js";
import { baseSoliditySubscription } from "./client.js";
import { healthSignalTopic, metricSignalTopic } from "./topics.js";

function throwIfError<T>(result: T | Error, message: string): T {
  if (result instanceof Error) {
    throw new Error(`${message}: ${result.message}`);
  }
  return result;
}

export type CreateStandardSubscriptionsParams = {
  sdk: SDK;
  deployment: DeploymentManifest;
  gas: ReactivityGasConfig;
  /** Milliseconds from now for one-off Schedule callback */
  scheduleDelayMs?: number;
};

/**
 * Creates the default hackathon subscriptions: HealthSignal, MetricSignal, BlockTick, and one Schedule.
 */
export async function createStandardAutopilotSubscriptions(
  params: CreateStandardSubscriptionsParams,
): Promise<StandardSubscriptionSummary> {
  const { sdk, deployment, gas } = params;
  const scheduleDelayMs = params.scheduleDelayMs ?? 90_000;
  const handlerContractAddress = deployment.contracts.reactiveAutopilotHandler;
  const common = baseSoliditySubscription(handlerContractAddress, gas);

  const healthSubscriptionTx = throwIfError(
    await sdk.createSoliditySubscription({
      ...common,
      emitter: deployment.contracts.mockSignalEmitter,
      eventTopics: [healthSignalTopic],
    }),
    "Failed to create health signal subscription",
  );

  const metricSubscriptionTx = throwIfError(
    await sdk.createSoliditySubscription({
      ...common,
      emitter: deployment.contracts.mockSignalEmitter,
      eventTopics: [metricSignalTopic],
    }),
    "Failed to create metric signal subscription",
  );

  const blockTickSubscriptionTx = throwIfError(
    await sdk.createOnchainBlockTickSubscription(common),
    "Failed to create block tick subscription",
  );

  const scheduleTimestamp = Date.now() + scheduleDelayMs;
  const scheduleSubscriptionTx = throwIfError(
    await sdk.scheduleOnchainCronJob({
      ...common,
      timestampMs: scheduleTimestamp,
    }),
    "Failed to create scheduled callback",
  );

  return {
    createdAt: new Date().toISOString(),
    handlerContractAddress,
    subscriptions: {
      healthSignalTx: healthSubscriptionTx,
      metricSignalTx: metricSubscriptionTx,
      blockTickTx: blockTickSubscriptionTx,
      scheduleTx: scheduleSubscriptionTx,
      scheduleTimestamp,
    },
  };
}
