const env = import.meta.env

export const appConfig = {
  appName: 'Somnia Autopilot',
  networkName: env.VITE_NETWORK_NAME ?? 'Somnia Testnet',
  chainId: Number(env.VITE_CHAIN_ID ?? 50312),
  rpcUrl: env.VITE_RPC_URL as string | undefined,
  explorerBaseUrl: env.VITE_EXPLORER_BASE_URL as string | undefined,
  contracts: {
    automationRegistry: env.VITE_AUTOMATION_REGISTRY_ADDRESS as string | undefined,
    workflowOrchestrator: env.VITE_WORKFLOW_ORCHESTRATOR_ADDRESS as string | undefined,
    reactiveAutopilotHandler: env.VITE_REACTIVE_HANDLER_ADDRESS as string | undefined,
    mockSignalEmitter: env.VITE_MOCK_SIGNAL_EMITTER_ADDRESS as string | undefined,
    mockProtocolController: env.VITE_MOCK_PROTOCOL_CONTROLLER_ADDRESS as string | undefined,
  },
}

export function hasCoreAddresses(): boolean {
  return Boolean(
    appConfig.contracts.automationRegistry &&
      appConfig.contracts.workflowOrchestrator &&
      appConfig.contracts.reactiveAutopilotHandler &&
      appConfig.contracts.mockSignalEmitter,
  )
}
