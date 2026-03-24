# Somnia Autopilot

Hackathon-ready **chain-native automation** demo: scheduler-style triggers (Schedule / BlockTick / EpochTick), **alert rules** on contract events, and a **multi-step workflow orchestrator**—wired to **Somnia Reactivity** via `ReactiveAutopilotHandler`.

### What is “real” on-chain vs mock?

| Layer | Real deployed contracts? | What happens |
|-------|---------------------------|--------------|
| **AutomationRegistry** | Yes | Stores jobs and alerts; **`recordJobExecution`** / **`recordAlertTrigger`** update counters when the handler reports a run. |
| **ReactiveAutopilotHandler** | Yes | Somnia calls **`onEvent`** (only from the reactivity precompile). It matches jobs/alerts, runs workflows, and updates the registry. **`JobTriggered`** / **`AlertRaised`** (and related) events fire from this contract. |
| **WorkflowOrchestrator** | Yes | **`executeWorkflow`** does real **`call`**s to each step’s `target` with your calldata; successes/failures and **`WorkflowExecuted`** / step events are real. |
| **MockSignalEmitter** | Stand-in | Only **pretends** to be an external protocol emitting events. The **emission and logs are real**; the **business meaning** is fake. |
| **MockProtocolController** | Stand-in | **Real contract code**, but it only toggles counters / emits demo events instead of talking to Aave, etc. Workflows that point at it **really execute** those calls. |

So: **orchestration, registry accounting, and handler logic are genuine.** The **only “fake” pieces** are the *pretend protocol* contracts you wire in for the demo. After you run **`setup:subscriptions`**, **Schedule / BlockTick / and mock-emitter events** can invoke the handler on testnet the same as production would—subject to Somnia reactivity, gas, and balances.

The app uses **[RainbowKit](https://www.rainbowkit.com)** on **[wagmi v2](https://wagmi.sh)** for the connect modal (MetaMask, WalletConnect, injected wallets, etc.). Add a free **`VITE_WALLETCONNECT_PROJECT_ID`** from [Reown Cloud](https://cloud.reown.com) in `app/.env` so WalletConnect and the full modal work reliably; reads still use **`VITE_RPC_URL`**.

## Monorepo layout

| Package | Role |
|--------|------|
| `contracts/` | Solidity (`AutomationRegistry`, `ReactiveAutopilotHandler`, `WorkflowOrchestrator`, mock protocol + signal contracts), Hardhat, deploy & demo scripts |
| `sdk/` | `@somnia-autopilot/sdk` — typed helpers for gas config, deployment JSON, and standard reactivity subscriptions |
| `app/` | Vite + React + Tailwind dashboard (analytics, filters, drawers, job/alert/workflow management) |

## Prerequisites

- Node.js 20+
- A **funded** Somnia testnet account for `contracts/.env` (deploy + `setup-subscriptions` txs). For subscription gas parameters, follow [Gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration) (`maxFeePerGas`, `gasLimit`, etc.)
- A browser wallet (e.g. MetaMask) and a **Reown (WalletConnect) project ID** for RainbowKit (`VITE_WALLETCONNECT_PROJECT_ID` in `app/.env`)

## 1. Install

```bash
npm install
npm run sdk:build
```

## 2. Configure contracts (deployer)

Copy `contracts/.env.example` → `contracts/.env` and set:

- `SOMNIA_RPC_URL` — Somnia testnet HTTP RPC
- `SOMNIA_CHAIN_ID` — e.g. `50312` (match your network)
- `SOMNIA_PRIVATE_KEY` — hex private key for deployment and scripts (keep secret)

Optional tuning (used by `setup:subscriptions`):

- `REACTIVITY_MAX_FEE_GWEI` (default `10`)
- `REACTIVITY_GAS_LIMIT` (default `3000000`)
- `SCHEDULE_DELAY_MS` (default `90000`) — one-off Schedule callback delay

## 3. Deploy (testnet)

```bash
npm run contracts:deploy
```

Writes `contracts/deployments/latest.json` with all contract addresses.

## 4. Reactivity subscriptions

After deploy, register Solidity subscriptions (mock emitter events, block tick, schedule):

```bash
npm run contracts:setup-subscriptions
```

Summary is saved to `contracts/deployments/subscriptions.latest.json`.

## 5. Seed demo registry data (optional)

Creates a sample workflow, external-event job, and metric alert (uses addresses from `latest.json`):

```bash
cd contracts && npx hardhat run scripts/seedDemoData.ts --network somniaTestnet
```

## 6. Configure the app

Generate `VITE_*` contract lines from `latest.json`:

```bash
npm run contracts:sync-vite-env
```

To write `app/.env.contracts` automatically:

```bash
cd contracts && npx hardhat run scripts/emitViteEnv.ts --network hardhatMainnet -- --write
```

Copy `app/.env.example` → `app/.env` (or merge `.env.contracts` into it) and set:

- `VITE_RPC_URL` — **public** RPC (can match `SOMNIA_RPC_URL`)
- `VITE_WALLETCONNECT_PROJECT_ID` — from [Reown Cloud](https://cloud.reown.com) (RainbowKit / WalletConnect)
- `VITE_CHAIN_ID` — same as `SOMNIA_CHAIN_ID`
- `VITE_EXPLORER_BASE_URL` — block explorer base (optional, for links)
- All `VITE_*_ADDRESS` values from the sync output

## 7. Run the dashboard

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Connect a wallet on the configured chain to create jobs/alerts/workflows and trigger demo actions.

## 8. Demo script order (quick reference)

1. `npm run contracts:deploy`
2. `npm run contracts:setup-subscriptions`
3. (Optional) `seedDemoData` / `demo:trigger` from the `contracts` workspace
4. Sync env → configure `app/.env` → `npm run dev`

**Manual smoke trigger (no reactivity):** `ReactiveAutopilotHandler.runJobManually` allows the **reactive handler owner** or the **job’s on-chain creator**; use either wallet in the UI or `contracts/scripts/triggerDemo.ts` (deployer).

## Quality checks

```bash
npm run build          # sdk + app + compile contracts
npm run test --workspace=@somnia-autopilot/contracts
npm run lint --workspaces --if-present
```

## Mock contracts

`MockSignalEmitter` and `MockProtocolController` are **stand-ins** for real protocol addresses so the same registry / handler / orchestrator path runs end-to-end on testnet without integrating external DeFi. Replace their addresses in workflows and subscriptions when targeting real emitters and callees.

## References

- [Somnia Reactivity](https://docs.somnia.network/developer/reactivity/what-is-reactivity)
- [Subscriptions](https://docs.somnia.network/developer/reactivity/subscriptions-the-core-primitive)
- [Gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration)
