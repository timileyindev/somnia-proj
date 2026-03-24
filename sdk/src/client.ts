import { SDK } from "@somnia-chain/reactivity";
import {
  createPublicClient,
  createWalletClient,
  http,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaChainFor } from "./chain.js";
import type { ReactivityGasConfig } from "./types.js";

const HEX32 = /^[0-9a-fA-F]{64}$/;

/**
 * Normalizes values from `.env`: trim, strip wrapping quotes, add `0x` if missing.
 * Viem rejects keys with trailing newlines or without the prefix.
 */
export function normalizePrivateKey(raw: string): `0x${string}` {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  const body = s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s;
  if (!HEX32.test(body)) {
    throw new Error(
      "Invalid private key: expected 32 bytes as 64 hex characters (optional 0x prefix), one line, no spaces. " +
        "Fix SOMNIA_PRIVATE_KEY in contracts/.env.",
    );
  }
  return `0x${body}` as `0x${string}`;
}

export type AutopilotSdkClients = {
  sdk: SDK;
  chainId: number;
  /** Use for precompile `subscribe` when `@somnia-chain/reactivity` rejects system emitters. */
  walletClient: WalletClient;
};

export function createAutopilotSdk(
  rpcUrl: string,
  privateKey: string,
  chainId: number,
): AutopilotSdkClients {
  const chain = somniaChainFor(rpcUrl, chainId);

  const key = normalizePrivateKey(privateKey);
  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const sdk = new SDK({
    public: publicClient as never,
    wallet: walletClient as never,
  });

  return { sdk, chainId, walletClient };
}

export function baseSoliditySubscription(
  handlerContractAddress: `0x${string}`,
  gas: ReactivityGasConfig,
  overrides?: { isGuaranteed?: boolean; isCoalesced?: boolean },
) {
  return {
    handlerContractAddress,
    priorityFeePerGas: gas.priorityFeePerGas,
    maxFeePerGas: gas.maxFeePerGas,
    gasLimit: gas.gasLimit,
    isGuaranteed: overrides?.isGuaranteed ?? true,
    isCoalesced: overrides?.isCoalesced ?? false,
  };
}
