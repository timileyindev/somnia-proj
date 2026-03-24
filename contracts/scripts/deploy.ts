import { network } from "hardhat";
import { saveDeployment } from "./shared.js";

const connection = await network.connect();
const { viem } = connection;
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

if (!deployer) {
  throw new Error("No wallet client available. Set SOMNIA_PRIVATE_KEY for deployment.");
}

console.log("Deploying contracts with account:", deployer.account.address);

const automationRegistry = await viem.deployContract("AutomationRegistry", [
  deployer.account.address,
]);
const workflowOrchestrator = await viem.deployContract("WorkflowOrchestrator", [
  deployer.account.address,
]);
const reactiveAutopilotHandler = await viem.deployContract(
  "ReactiveAutopilotHandler",
  [
    automationRegistry.address,
    workflowOrchestrator.address,
    deployer.account.address,
  ],
);
const mockProtocolController = await viem.deployContract("MockProtocolController");
const mockSignalEmitter = await viem.deployContract("MockSignalEmitter");

console.log("Configuring permissions...");
await automationRegistry.write.setOperator([reactiveAutopilotHandler.address, true]);
await workflowOrchestrator.write.setExecutor([reactiveAutopilotHandler.address, true]);

const chainId = await publicClient.getChainId();
const manifest = {
  chainId,
  networkName: connection.networkName,
  deployer: deployer.account.address,
  deployedAt: new Date().toISOString(),
  contracts: {
    automationRegistry: automationRegistry.address,
    workflowOrchestrator: workflowOrchestrator.address,
    reactiveAutopilotHandler: reactiveAutopilotHandler.address,
    mockProtocolController: mockProtocolController.address,
    mockSignalEmitter: mockSignalEmitter.address,
  },
};

await saveDeployment(manifest);

console.log("Deployment complete.");
console.log(JSON.stringify(manifest, null, 2));
