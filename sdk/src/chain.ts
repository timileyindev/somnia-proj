import type { Chain } from "viem";
import { defineChain } from "viem";
import { somniaTestnet } from "viem/chains";

/**
 * Matches the [Somnia tutorial](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial):
 * use viem's `somniaTestnet` metadata with your RPC URL so clients match the documented setup.
 */
export function somniaChainFor(rpcUrl: string, chainId: number): Chain {
  if (chainId === somniaTestnet.id) {
    return {
      ...somniaTestnet,
      rpcUrls: { default: { http: [rpcUrl] } },
    };
  }
  return defineChain({
    id: chainId,
    name: "Somnia / custom",
    nativeCurrency: { name: "SOMI", symbol: "SOMI", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: true,
  });
}
