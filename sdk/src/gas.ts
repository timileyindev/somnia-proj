import { parseGwei } from "viem";
import type { ReactivityGasConfig } from "./types.js";

export function reactivityGasFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ReactivityGasConfig {
  const priorityFeePerGas = parseGwei(env.REACTIVITY_PRIORITY_FEE_GWEI ?? "0");
  const maxFeePerGas = parseGwei(env.REACTIVITY_MAX_FEE_GWEI ?? "10");
  const gasLimit = BigInt(env.REACTIVITY_GAS_LIMIT ?? "3000000");
  return { priorityFeePerGas, maxFeePerGas, gasLimit };
}
