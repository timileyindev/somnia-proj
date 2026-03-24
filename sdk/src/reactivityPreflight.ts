import type { PublicClient } from "viem";
import { formatEther, parseEther, toFunctionSelector } from "viem";
import type { DeploymentManifest } from "./types.js";

const IERC165_ABI = [
  {
    name: "supportsInterface",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** First topic of `ISomniaEventHandler` for EIP-165 (single-function interface). */
const ISomniaEventHandler_INTERFACE_ID = toFunctionSelector(
  "onEvent(address,bytes32[],bytes)",
);

/**
 * RPC sanity checks before `SDK.createSoliditySubscription` / precompile `subscribe`.
 * Aligns with the flow in Somnia’s Solidity reactivity tutorial (handler code + subscription).
 */
export async function assertReactivitySubscribePreflight(params: {
  publicClient: PublicClient;
  expectedChainId: number;
  deployment: DeploymentManifest;
  subscriberAddress: `0x${string}`;
}): Promise<void> {
  const { publicClient, expectedChainId, deployment, subscriberAddress } = params;

  const rpcChainId = await publicClient.getChainId();
  if (rpcChainId !== expectedChainId) {
    throw new Error(
      `RPC reports chainId ${rpcChainId} but SOMNIA_CHAIN_ID is ${expectedChainId}. Fix .env so RPC and chain id match.`,
    );
  }

  const handler = deployment.contracts.reactiveAutopilotHandler;
  const emitter = deployment.contracts.mockSignalEmitter;

  const handlerCode = await publicClient.getCode({ address: handler });
  if (!handlerCode || handlerCode === "0x") {
    throw new Error(
      `No bytecode at reactive handler ${handler}. Redeploy or fix contracts/deployments/latest.json for this network.`,
    );
  }

  const emitterCode = await publicClient.getCode({ address: emitter });
  if (!emitterCode || emitterCode === "0x") {
    throw new Error(
      `No bytecode at mock signal emitter ${emitter}. Redeploy or fix latest.json.`,
    );
  }

  const supportsErc165 = await publicClient.readContract({
    address: handler,
    abi: IERC165_ABI,
    functionName: "supportsInterface",
    args: ["0x01ffc9a7"],
  });
  if (!supportsErc165) {
    throw new Error(
      `Handler ${handler} does not respond to ERC-165. It must inherit SomniaEventHandler from @somnia-chain/reactivity-contracts.`,
    );
  }

  const supportsHandlerIface = await publicClient.readContract({
    address: handler,
    abi: IERC165_ABI,
    functionName: "supportsInterface",
    args: [ISomniaEventHandler_INTERFACE_ID],
  });
  if (!supportsHandlerIface) {
    throw new Error(
      `Handler ${handler} does not support ISomniaEventHandler (${ISomniaEventHandler_INTERFACE_ID}). The precompile rejects invalid handlers.`,
    );
  }

  const minHold = parseEther("32");
  const bal = await publicClient.getBalance({ address: subscriberAddress });
  if (bal < minHold) {
    console.warn(
      `[Somnia Autopilot] Subscriber ${subscriberAddress} balance ${formatEther(bal)} STT/SOMI is below ${formatEther(minHold)}. ` +
        "The Solidity reactivity tutorial states the subscription owner should hold 32+ SOMI; `subscribe` may revert on-chain if the protocol enforces this.",
    );
  }
}
