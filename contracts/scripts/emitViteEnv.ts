import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeployment } from "./shared.js";

const deployment = await loadDeployment();
const c = deployment.contracts;

const lines = [
  `# Generated from contracts/deployments/latest.json (${deployment.deployedAt})`,
  `# Merge into app/.env or app/.env.local`,
  `VITE_CHAIN_ID=${deployment.chainId}`,
  `VITE_AUTOMATION_REGISTRY_ADDRESS=${c.automationRegistry}`,
  `VITE_WORKFLOW_ORCHESTRATOR_ADDRESS=${c.workflowOrchestrator}`,
  `VITE_REACTIVE_HANDLER_ADDRESS=${c.reactiveAutopilotHandler}`,
  `VITE_MOCK_SIGNAL_EMITTER_ADDRESS=${c.mockSignalEmitter}`,
  `VITE_MOCK_PROTOCOL_CONTROLLER_ADDRESS=${c.mockProtocolController}`,
  ``,
  `# Set manually:`,
  `# VITE_RPC_URL=...`,
  `# VITE_NETWORK_NAME=Somnia Testnet`,
  `# VITE_EXPLORER_BASE_URL=https://shannon-explorer.somnia.network`,
  ``,
];

const text = lines.join("\n");
console.log(text);

const shouldWrite = process.argv.includes("--write");
if (shouldWrite) {
  const appEnvPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../app/.env.contracts",
  );
  await writeFile(appEnvPath, text, "utf8");
  console.log(`Wrote ${appEnvPath}`);
}
