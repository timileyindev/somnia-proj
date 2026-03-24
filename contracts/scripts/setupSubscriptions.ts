import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertReactivitySubscribePreflight,
  createAutopilotSdk,
  createStandardAutopilotSubscriptions,
  normalizePrivateKey,
  reactivityGasFromEnv,
  somniaChainFor,
} from "@somnia-autopilot/sdk";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadDeployment } from "./shared.js";

const deployment = await loadDeployment();

const rpcUrl = process.env.SOMNIA_RPC_URL?.trim();
const privateKey = process.env.SOMNIA_PRIVATE_KEY;
const chainId = process.env.SOMNIA_CHAIN_ID
  ? Number(process.env.SOMNIA_CHAIN_ID.trim())
  : undefined;

if (!rpcUrl || privateKey === undefined || privateKey === "" || !chainId) {
  throw new Error(
    "Missing SOMNIA_RPC_URL, SOMNIA_PRIVATE_KEY or SOMNIA_CHAIN_ID in environment.",
  );
}

const subscriberAddress = privateKeyToAccount(
  normalizePrivateKey(privateKey),
).address;

const chain = somniaChainFor(rpcUrl, chainId);
const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

await assertReactivitySubscribePreflight({
  publicClient,
  expectedChainId: chainId,
  deployment,
  subscriberAddress,
});

const { sdk, walletClient } = createAutopilotSdk(rpcUrl, privateKey, chainId);
const gas = reactivityGasFromEnv();
const scheduleDelayMs = Number(process.env.SCHEDULE_DELAY_MS ?? "90000");

console.log("Creating standard reactivity subscriptions (health, metric, block tick, schedule)...");
let summary;
try {
  summary = await createStandardAutopilotSubscriptions({
    sdk,
    walletClient,
    deployment,
    gas,
    scheduleDelayMs,
  });
} catch (err) {
  const base = err instanceof Error ? err.message : String(err);
  throw new Error(
    `${base}\n\n` +
      "If the precompile `subscribe` still reverted after preflight passed: fund the subscriber with 32+ native tokens (see Somnia Solidity reactivity tutorial), try higher `REACTIVITY_MAX_FEE_GWEI`, " +
      "or cancel duplicate subscriptions on-chain. Flow matches `@somnia-chain/reactivity` → `createSoliditySubscription` → precompile `0x…0100` `subscribe` (same as official docs).",
  );
}

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../deployments/subscriptions.latest.json",
);
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(summary, null, 2));

console.log("Subscriptions created.");
console.log(JSON.stringify(summary, null, 2));
