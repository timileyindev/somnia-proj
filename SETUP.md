# Somnia Autopilot — setup & deployment

Step-by-step: what to configure, which contracts deploy, post-deploy scripts, and how to run the dashboard.

## Prerequisites

- Node.js 20+
- A funded Somnia testnet account (see [Somnia reactivity docs](https://docs.somnia.network/developer/reactivity/quickstart))
- Browser wallet for the app; optional [Reown Cloud](https://cloud.reown.com) project ID for RainbowKit

## 1. Install

From the repository root:

```bash
npm install
npm run sdk:build
```

## 2. Configure the deployer (`contracts/.env`)

Copy `contracts/.env.example` → `contracts/.env` and set:

| Variable | Purpose |
|----------|---------|
| `SOMNIA_RPC_URL` | HTTP RPC for Somnia testnet |
| `SOMNIA_CHAIN_ID` | e.g. `50312` (must match the network) |
| `SOMNIA_PRIVATE_KEY` | Deployer private key (`0x…`) — used for deploy and scripts |

**Gas & funding (official docs):** [Gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration) documents `priorityFeePerGas`, `maxFeePerGas`, and `gasLimit` (use `parseGwei()` for fee fields; base fee ~6 gwei / nanoSOMI-scale). The same page’s **Cost Estimation** section states the subscription owner must keep **at least 32 SOMI**. [Subscription management](https://docs.somnia.network/developer/reactivity/tooling/subscription-management) repeats that on-chain subs need funding (**32+ SOMI**) and shows the same `createSoliditySubscription` shape.

**This repo’s env helper:** `REACTIVITY_MAX_FEE_GWEI` of **`0` or empty** is treated as **`10` gwei** (`parseGwei`), matching the gas doc examples and avoiding `@somnia-chain/reactivity`’s rejection of `maxFeePerGas === 0`.

### How this repo maps to Somnia reactivity tutorials

| Doc | We use it? | Role in this project |
|-----|------------|----------------------|
| [Wildcard off-chain reactivity](https://docs.somnia.network/developer/reactivity/tutorials/wildcard-off-chain-reactivity-tutorial) | No | **Off-chain** WebSocket `sdk.subscribe()` — not used by `setup-subscriptions` or the autopilot contracts. |
| [Off-chain filtered subscriptions](https://docs.somnia.network/developer/reactivity/tutorials/off-chain-reactivity-filtered-subscriptions-tutorial) | No | Same: WS push to a **TypeScript** app; different from our **on-chain** handler path. |
| [Solidity on-chain reactivity](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial) | **Yes** | Handler inherits `SomniaEventHandler`; subscriptions via `SDK.createSoliditySubscription` with `emitter` + `eventTopics` (Step 4). We use `somniaTestnet` from `viem/chains` + your RPC, same idea as the snippet. |
| [Cron subscriptions via SDK](https://docs.somnia.network/developer/reactivity/tutorials/cron-subscriptions-via-sdk) | **Yes** | We call `createOnchainBlockTickSubscription` and `scheduleOnchainCronJob` (wrappers over the same precompile `subscribe`). Raw `BigInt` examples there (e.g. `1e9`, `20e9`) are the same **nanoSOMI / gwei-scale wei** values as `parseGwei('1')` / `parseGwei('20')`. |
| [Gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration) | **Yes** | Source of truth for fee fields and recommended magnitudes; aligns with our `reactivityGasFromEnv()` + `parseGwei`. |
| [On-chain (Solidity) tooling](https://docs.somnia.network/developer/reactivity/tooling/on-chain-solidity) | **Yes** | Precompile `0…0100`, `SubscriptionData`, validation: **at least one** of `eventTopics`, `origin`, or `emitter` non-zero; handler non-zero; `gasLimit > 0`. Our health/metric subs set **emitter + topic0**; block tick / schedule use system events via the SDK helpers. |
| [Subscription management](https://docs.somnia.network/developer/reactivity/tooling/subscription-management) | **Yes** | Describes the same on-chain `SoliditySubscriptionData` / `createSoliditySubscription` / `getSubscriptionInfo` / `cancelSoliditySubscription` model we rely on. |

Optional (used when registering reactivity subscriptions):

| Variable | Notes |
|----------|--------|
| `REACTIVITY_PRIORITY_FEE_GWEI` | Default in `.env.example` |
| `REACTIVITY_MAX_FEE_GWEI` | Default `10` |
| `REACTIVITY_GAS_LIMIT` | Default `3000000` |
| `SCHEDULE_DELAY_MS` | Delay for one-off schedule callback; default `90000` |

## 3. What gets deployed

`npm run contracts:deploy` runs `contracts/scripts/deploy.ts` on **`somniaTestnet`** and deploys **five** contracts:

| Contract | Role |
|----------|------|
| **AutomationRegistry** | Stores jobs and alerts; execution counters |
| **WorkflowOrchestrator** | Runs multi-step workflows (`executeWorkflow`) |
| **ReactiveAutopilotHandler** | Somnia reactivity calls `onEvent` here; matches jobs/alerts and runs workflows |
| **MockProtocolController** | Demo contract your workflows can call |
| **MockSignalEmitter** | Demo contract that emits events for jobs/alerts |

Immediately after deployment, the script configures on-chain permissions (no separate init script):

- `AutomationRegistry.setOperator(reactiveAutopilotHandler, true)`
- `WorkflowOrchestrator.setExecutor(reactiveAutopilotHandler, true)`

Deployment output is saved to **`contracts/deployments/latest.json`**.

## 4. Deploy

```bash
npm run contracts:deploy
```

Local Hardhat deploy (if you use the bundled local network):

```bash
cd contracts && npm run deploy:local
```

## 5. Required post-deploy: reactivity subscriptions

Register Solidity subscriptions so schedule / block tick / mock emitter events can reach the handler:

```bash
npm run contracts:setup-subscriptions
```

This reads `latest.json`, uses `@somnia-autopilot/sdk` to create the standard autopilot subscriptions, and writes **`contracts/deployments/subscriptions.latest.json`**.

**What the script does (same path as Somnia docs):**

1. Build viem clients with **`somniaTestnet` from `viem/chains`** plus your `SOMNIA_RPC_URL` (see [Solidity on-chain reactivity tutorial](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial), Step 4).
2. Preflight: RPC `chainId` matches `SOMNIA_CHAIN_ID`, handler and emitter have code, handler passes `supportsInterface` for ERC-165 and `ISomniaEventHandler`.
3. Call **`@somnia-chain/reactivity` → `SDK.createSoliditySubscription(...)`**, which performs `writeContract` on the precompile at **`0x0000000000000000000000000000000000000100`** with function **`subscribe(SubscriptionData)`** — identical to the SDK snippet in that tutorial.

If `subscribe` still reverts after preflight passes, cross-check [gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration), **32+ SOMI** on the subscriber ([Solidity on-chain tutorial](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial), [subscription management](https://docs.somnia.network/developer/reactivity/tooling/subscription-management)), and duplicate / stale subscriptions. There is no alternate subscribe API in this repo beyond `@somnia-chain/reactivity` → precompile `subscribe`.

**Minimum path after a fresh deploy:** deploy → **then** run `setup-subscriptions`. Without subscriptions, the reactive pipeline will not behave as intended on testnet.

## 6. Optional scripts

| Command | What it does |
|---------|----------------|
| `cd contracts && npm run demo:seed` | On-chain sample workflow, external-event job, and metric alert (`seedDemoData.ts`) |
| `cd contracts && npm run demo:trigger` | Demo triggers (`triggerDemo.ts`) |
| `npm run contracts:sync-vite-env` | Prints `VITE_*` lines from `latest.json` for the app |
| `cd contracts && npx hardhat run scripts/emitViteEnv.ts --network hardhatMainnet -- --write` | Writes **`app/.env.contracts`** |

You can create jobs, alerts, and workflows from the dashboard instead of using `demo:seed`.

## 7. Configure the dashboard (`app/.env`)

1. Copy `app/.env.example` → `app/.env` (or merge generated lines).
2. Add contract addresses — e.g. run `npm run contracts:sync-vite-env` and paste the `VITE_*_ADDRESS` lines.
3. Set:
   - `VITE_RPC_URL` — public RPC (often same as `SOMNIA_RPC_URL`)
   - `VITE_CHAIN_ID` — same as `SOMNIA_CHAIN_ID`
   - `VITE_WALLETCONNECT_PROJECT_ID` — from Reown Cloud (RainbowKit)
   - `VITE_EXPLORER_BASE_URL` — optional, for explorer links

## 8. Run the app

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Connect a wallet on the configured chain.

## 9. Checklist (quick reference)

1. `contracts/.env` — RPC, chain ID, private key  
2. `npm run contracts:deploy`  
3. `npm run contracts:setup-subscriptions`  
4. *(Optional)* `demo:seed` / `demo:trigger`  
5. Sync addresses → `app/.env`  
6. `npm run dev`  

**Manual job run:** `ReactiveAutopilotHandler.runJobManually` is **owner-only** (typically the deployer). Use that wallet in the UI or `contracts/scripts/triggerDemo.ts`.

## 10. Replacing mocks

`MockSignalEmitter` and `MockProtocolController` are stand-ins. For real integrations, point workflows and subscriptions at your protocol’s contracts and update env / subscriptions accordingly.

## See also

- [README.md](./README.md) — project overview, “real vs mock”, quality commands  
- [Somnia Reactivity](https://docs.somnia.network/developer/reactivity/what-is-reactivity)  
- [Subscriptions](https://docs.somnia.network/developer/reactivity/subscriptions-the-core-primitive)  
