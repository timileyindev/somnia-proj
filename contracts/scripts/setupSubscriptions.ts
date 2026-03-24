import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createAutopilotSdk,
  createStandardAutopilotSubscriptions,
  reactivityGasFromEnv,
} from "@somnia-autopilot/sdk";
import { loadDeployment } from "./shared.js";

const deployment = await loadDeployment();

const rpcUrl = process.env.SOMNIA_RPC_URL;
const privateKey = process.env.SOMNIA_PRIVATE_KEY as `0x${string}` | undefined;
const chainId = process.env.SOMNIA_CHAIN_ID ? Number(process.env.SOMNIA_CHAIN_ID) : undefined;

if (!rpcUrl || !privateKey || !chainId) {
  throw new Error(
    "Missing SOMNIA_RPC_URL, SOMNIA_PRIVATE_KEY or SOMNIA_CHAIN_ID in environment.",
  );
}

const { sdk } = createAutopilotSdk(rpcUrl, privateKey, chainId);
const gas = reactivityGasFromEnv();
const scheduleDelayMs = Number(process.env.SCHEDULE_DELAY_MS ?? "90000");

console.log("Creating standard reactivity subscriptions (health, metric, block tick, schedule)...");
const summary = await createStandardAutopilotSubscriptions({
  sdk,
  deployment,
  gas,
  scheduleDelayMs,
});

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../deployments/subscriptions.latest.json",
);
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(summary, null, 2));

console.log("Subscriptions created.");
console.log(JSON.stringify(summary, null, 2));
