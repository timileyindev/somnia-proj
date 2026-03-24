import { SDK } from "@somnia-chain/reactivity";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ReactivityGasConfig } from "./types.js";

export type AutopilotSdkClients = {
  sdk: SDK;
  chainId: number;
};

export function createAutopilotSdk(
  rpcUrl: string,
  privateKey: `0x${string}`,
  chainId: number,
): AutopilotSdkClients {
  const chain = defineChain({
    id: chainId,
    name: "Somnia Testnet",
    nativeCurrency: { name: "SOMI", symbol: "SOMI", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: true,
  });

  const account = privateKeyToAccount(privateKey);
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

  return { sdk, chainId };
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
