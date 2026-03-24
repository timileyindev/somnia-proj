/** Somnia reactivity precompile (`subscribe` / `unsubscribe`). */
export const SOMNIA_REACTIVITY_PRECOMPILE =
  "0x0000000000000000000000000000000000000100" as const;

/** Minimal ABI for `subscribe(SubscriptionData)` — matches `@somnia-chain/reactivity` precompile. */
export const somniaReactivityPrecompileAbi = [
  {
    name: "subscribe",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "subscriptionData",
        type: "tuple",
        components: [
          { name: "eventTopics", type: "bytes32[4]" },
          { name: "origin", type: "address" },
          { name: "caller", type: "address" },
          { name: "emitter", type: "address" },
          { name: "handlerContractAddress", type: "address" },
          { name: "handlerFunctionSelector", type: "bytes4" },
          { name: "priorityFeePerGas", type: "uint64" },
          { name: "maxFeePerGas", type: "uint64" },
          { name: "gasLimit", type: "uint64" },
          { name: "isGuaranteed", type: "bool" },
          { name: "isCoalesced", type: "bool" },
        ],
      },
    ],
    outputs: [{ name: "subscriptionId", type: "uint256" }],
  },
] as const;
