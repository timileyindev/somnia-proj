import { parseGwei } from "viem";
import type { ReactivityGasConfig } from "./types.js";

const DEFAULT_MAX_FEE_GWEI = "10";
const DEFAULT_GAS_LIMIT = 3_000_000n;

/**
 * Reads reactivity gas from env. `REACTIVITY_MAX_FEE_GWEI` must not be zero:
 * `@somnia-chain/reactivity` rejects `maxFeePerGas === 0` before sending `subscribe`,
 * and the precompile expects a real ceiling (Somnia base fee is ~6 gwei per docs).
 */
export function reactivityGasFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ReactivityGasConfig {
  const priorityFeePerGas = parseGwei(
    env.REACTIVITY_PRIORITY_FEE_GWEI?.trim() || "0",
  );

  const maxRaw = env.REACTIVITY_MAX_FEE_GWEI?.trim();
  let maxFeePerGas =
    maxRaw === undefined || maxRaw === ""
      ? parseGwei(DEFAULT_MAX_FEE_GWEI)
      : parseGwei(maxRaw);
  if (maxFeePerGas === 0n) {
    maxFeePerGas = parseGwei(DEFAULT_MAX_FEE_GWEI);
  }

  const limitRaw = env.REACTIVITY_GAS_LIMIT?.trim();
  const gasLimit =
    limitRaw === undefined || limitRaw === ""
      ? DEFAULT_GAS_LIMIT
      : BigInt(limitRaw);
  const safeGasLimit = gasLimit > 0n ? gasLimit : DEFAULT_GAS_LIMIT;

  return {
    priorityFeePerGas,
    maxFeePerGas,
    gasLimit: safeGasLimit,
  };
}
