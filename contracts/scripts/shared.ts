import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const deploymentsDir = path.resolve(__dirname, "../deployments");
export const latestDeploymentPath = path.join(deploymentsDir, "latest.json");

export async function saveDeployment(manifest: DeploymentManifest): Promise<void> {
  await mkdir(deploymentsDir, { recursive: true });
  await writeFile(latestDeploymentPath, JSON.stringify(manifest, null, 2));
}

export async function loadDeployment(): Promise<DeploymentManifest> {
  const raw = await readFile(latestDeploymentPath, "utf8");
  return JSON.parse(raw) as DeploymentManifest;
}

export async function saveJsonFile(filePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}
