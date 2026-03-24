import { healthSignalTopic, metricSignalTopic } from "@somnia-autopilot/sdk";
import { network } from "hardhat";
import { encodeFunctionData } from "viem";
import { loadDeployment, saveJsonFile } from "./shared.js";

const deployment = await loadDeployment();
const { viem } = await network.connect();
const [deployer] = await viem.getWalletClients();

if (!deployer) {
  throw new Error("No wallet client available for seeding data.");
}

const orchestrator = await viem.getContractAt(
  "WorkflowOrchestrator",
  deployment.contracts.workflowOrchestrator,
);
const registry = await viem.getContractAt(
  "AutomationRegistry",
  deployment.contracts.automationRegistry,
);
const mockProtocolController = await viem.getContractAt(
  "MockProtocolController",
  deployment.contracts.mockProtocolController,
);

const workflowId = (await orchestrator.read.nextWorkflowId()) as bigint;
const jobId = (await registry.read.nextJobId()) as bigint;
const alertId = (await registry.read.nextAlertRuleId()) as bigint;

const steps = [
  {
    target: mockProtocolController.address,
    value: 0n,
    data: encodeFunctionData({
      abi: mockProtocolController.abi,
      functionName: "activateProtectionMode",
    }),
    allowFailure: false,
    label: "Enable protection mode",
  },
  {
    target: mockProtocolController.address,
    value: 0n,
    data: encodeFunctionData({
      abi: mockProtocolController.abi,
      functionName: "rebalance",
      args: [250n],
    }),
    allowFailure: false,
    label: "Rebalance collateral",
  },
  {
    target: mockProtocolController.address,
    value: 0n,
    data: encodeFunctionData({
      abi: mockProtocolController.abi,
      functionName: "repayDebt",
      args: [120n],
    }),
    allowFailure: true,
    label: "Repay debt",
  },
] as const;

console.log("Creating demo workflow...");
await orchestrator.write.createWorkflow(["Risk Mitigation Flow", steps], {
  account: deployer.account,
});

console.log("Creating demo job...");
await registry.write.createJob(
  [
    {
      name: "Health signal trigger",
      triggerType: 3,
      emitter: deployment.contracts.mockSignalEmitter,
      topic0: healthSignalTopic,
      triggerValue: 0n,
      workflowId,
      cooldownSeconds: 30,
      active: true,
    },
  ],
  { account: deployer.account },
);

console.log("Creating demo alert rule...");
await registry.write.createAlertRule(
  [
    {
      name: "Metric threshold alert",
      emitter: deployment.contracts.mockSignalEmitter,
      topic0: metricSignalTopic,
      minValue: 800n,
      workflowId,
      cooldownSeconds: 30,
      active: true,
    },
  ],
  { account: deployer.account },
);

const seedManifest = {
  seededAt: new Date().toISOString(),
  workflowId: workflowId.toString(),
  jobId: jobId.toString(),
  alertId: alertId.toString(),
  topics: {
    healthSignalTopic,
    metricSignalTopic,
  },
};

await saveJsonFile(new URL("../deployments/seed.latest.json", import.meta.url).pathname, seedManifest);
console.log("Seed data created.");
console.log(JSON.stringify(seedManifest, null, 2));
