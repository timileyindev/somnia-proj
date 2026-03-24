export type DeploymentManifest = {
  chainId: number;
  networkName: string;
  deployer: `0x${string}`;
  deployedAt: string;
  contracts: {
    automationRegistry: `0x${string}`;
    workflowOrchestrator: `0x${string}`;
    reactiveAutopilotHandler: `0x${string}`;
    mockProtocolController: `0x${string}`;
    mockSignalEmitter: `0x${string}`;
  };
};

export type ReactivityGasConfig = {
  priorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
};

export type StandardSubscriptionSummary = {
  createdAt: string;
  handlerContractAddress: `0x${string}`;
  subscriptions: {
    healthSignalTx: `0x${string}`;
    metricSignalTx: `0x${string}`;
    blockTickTx: `0x${string}`;
    epochTickTx: `0x${string}`;
    scheduleTx: `0x${string}`;
    scheduleTimestamp: number;
  };
};
