import { readFile } from "node:fs/promises";
import type { DeploymentManifest } from "./types.js";

export async function readDeploymentFile(absolutePath: string): Promise<DeploymentManifest> {
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw) as DeploymentManifest;
}
