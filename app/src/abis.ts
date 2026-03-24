export const automationRegistryAbi = [
  'function getJobs() view returns ((uint256 id,address creator,string name,uint8 triggerType,address emitter,bytes32 topic0,uint256 triggerValue,uint256 workflowId,uint64 cooldownSeconds,bool active,uint64 createdAt,uint64 lastExecutedAt,uint64 successCount,uint64 failureCount)[])',
  'function getAlertRules() view returns ((uint256 id,address creator,string name,address emitter,bytes32 topic0,uint256 minValue,uint256 workflowId,uint64 cooldownSeconds,bool active,uint64 createdAt,uint64 lastAlertAt,uint64 triggerCount)[])',
  'function createJob((string name,uint8 triggerType,address emitter,bytes32 topic0,uint256 triggerValue,uint256 workflowId,uint64 cooldownSeconds,bool active) input) returns (uint256)',
  'function updateJob(uint256 jobId, (string name,uint8 triggerType,address emitter,bytes32 topic0,uint256 triggerValue,uint256 workflowId,uint64 cooldownSeconds,bool active) input)',
  'function setJobActive(uint256 jobId, bool active)',
  'function createAlertRule((string name,address emitter,bytes32 topic0,uint256 minValue,uint256 workflowId,uint64 cooldownSeconds,bool active) input) returns (uint256)',
  'function updateAlertRule(uint256 alertId, (string name,address emitter,bytes32 topic0,uint256 minValue,uint256 workflowId,uint64 cooldownSeconds,bool active) input)',
  'function setAlertRuleActive(uint256 alertId, bool active)',
  'function nextJobId() view returns (uint256)',
  'function nextAlertRuleId() view returns (uint256)',
] as const

export const workflowOrchestratorAbi = [
  'function getWorkflows() view returns ((uint256 id,address creator,string name,bool active,uint64 createdAt,uint64 runCount,uint64 successCount,uint64 failureCount,uint256 stepCount)[])',
  'function getRuns() view returns ((uint256 id,uint256 workflowId,address executor,bytes32 contextHash,bool success,uint256 failedStepIndex,uint64 executedAt)[])',
  'function getWorkflowSteps(uint256 workflowId) view returns ((address target,uint256 value,bytes data,bool allowFailure,string label)[])',
  'function createWorkflow(string name,(address target,uint256 value,bytes data,bool allowFailure,string label)[] steps) returns (uint256)',
  'function setWorkflowActive(uint256 workflowId, bool active)',
  'function nextWorkflowId() view returns (uint256)',
] as const

export const reactiveHandlerAbi = [
  'function processedEvents() view returns (uint256)',
  'function runJobManually(uint256 jobId, bytes32 contextHash)',
] as const

export const mockSignalEmitterAbi = [
  'function emitHealthSignal(address vault, uint256 healthFactor, uint256 debtValue)',
  'function emitMetricSignal(uint256 metricId, uint256 value)',
] as const

export const mockProtocolControllerAbi = [
  'function activateProtectionMode()',
  'function rebalance(uint256 amount)',
  'function repayDebt(uint256 amount)',
] as const
