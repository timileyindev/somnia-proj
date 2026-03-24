import { network } from "hardhat";
import { keccak256, toBytes } from "viem";
import { loadDeployment } from "./shared.js";

const deployment = await loadDeployment();
const { viem } = await network.connect();
const [deployer] = await viem.getWalletClients();

if (!deployer) {
  throw new Error("No wallet client available for demo trigger.");
}

const mockSignalEmitter = await viem.getContractAt(
  "MockSignalEmitter",
  deployment.contracts.mockSignalEmitter,
);
const handler = await viem.getContractAt(
  "ReactiveAutopilotHandler",
  deployment.contracts.reactiveAutopilotHandler,
);

console.log("Emitting external health and metric signals...");
await mockSignalEmitter.write.emitHealthSignal(
  [deployer.account.address, 870n, 1_250n],
  { account: deployer.account },
);
await mockSignalEmitter.write.emitMetricSignal([1n, 900n], {
  account: deployer.account,
});

const manualContext = keccak256(toBytes(`manual-run-${Date.now()}`));
console.log("Executing manual fallback trigger for Job #1...");
await handler.write.runJobManually([1n, manualContext], { account: deployer.account });

console.log("Demo trigger complete.");
