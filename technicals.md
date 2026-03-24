# Somnia Autopilot — Technical reference

> **Audience:** engineers who are wiring deployments, scripts, and integrations. For a high-level product overview and developer experience narrative, see **[README.md](./README.md)**. For step-by-step deployment, see **[SETUP.md](./SETUP.md)**.

**Somnia Autopilot** is a hackathon-ready reference stack for **on-chain automation** on [Somnia](https://docs.somnia.network): time- and block-driven **jobs**, **alert rules** on contract logs, and **multi-step workflows**—all triggered through **Somnia Reactivity** into a single **`ReactiveAutopilotHandler`** contract.

The repo ships three pieces that work together:

1. **Solidity contracts** — registry, orchestrator, reactive handler, and demo “protocol” stand-ins.  
2. **TypeScript SDK** (`@somnia-autopilot/sdk`) — deployment types, gas helpers, and standard **reactivity subscriptions** (mock emitter + system ticks + schedule).  
3. **Web dashboard** — Vite + React + RainbowKit to create jobs, alerts, and workflows and to inspect on-chain state.

For a **step-by-step deploy and env walkthrough** (including Somnia doc cross-references and troubleshooting), see **[SETUP.md](./SETUP.md)**.

---

## Table of contents

- [How the platform works](#how-the-platform-works)
- [Monorepo layout](#monorepo-layout)
- [Contracts](#contracts)
- [SDK](#sdk)
- [Dashboard](#dashboard)
- [Getting started](#getting-started)
- [Configuration cheat sheet](#configuration-cheat-sheet)
- [Useful commands](#useful-commands)
- [Development and quality checks](#development-and-quality-checks)
- [Replacing demo contracts](#replacing-demo-contracts)
- [References](#references)

---

## How the platform works

Somnia **subscriptions** tell the network which logs should be delivered to your **handler** contract. This project’s handler is **`ReactiveAutopilotHandler`**: the chain calls its `onEvent` entrypoint (from the reactivity precompile). The handler then:

- Reads **jobs** and **alert rules** from **`AutomationRegistry`** (filtering by emitter, `topic0`, trigger type, etc.).  
- When a job or alert fires, it runs the linked workflow via **`WorkflowOrchestrator.executeWorkflow`**, which performs real `call`s to each step.  
- Writes execution results back to the registry (`recordJobExecution`, `recordAlertTrigger`, etc.) and emits events you can index or show in the UI.

So there are **two layers of filtering**:

| Layer | What it does |
|--------|----------------|
| **Reactivity subscription** | Somnia → forwards matching logs into `ReactiveAutopilotHandler.onEvent`. |
| **Registry job / alert** | Handler → decides whether this log should run *your* workflow for *your* job or alert. |

If no subscription covers an emitter/topic combination, the handler never sees those logs—**jobs with wildcards still need a matching subscription path on-chain**.

After **`npm run contracts:setup-subscriptions`**, the default setup registers subscriptions for **HealthSignal** and **MetricSignal** on the mock emitter, plus **BlockTick**, **EpochTick**, and a one-off **Schedule** (see [SETUP.md](./SETUP.md) for details and Somnia quirks).

---

## Monorepo layout

| Path | Package | Purpose |
|------|---------|---------|
| `contracts/` | `@somnia-autopilot/contracts` | Hardhat, Solidity sources, deploy / subscription / demo scripts, `deployments/latest.json`. |
| `sdk/` | `@somnia-autopilot/sdk` | Shared TypeScript library for scripts and tooling: viem + `@somnia-chain/reactivity` wrappers. |
| `app/` | `@somnia-autopilot/app` | Operator dashboard: RainbowKit, tables, charts, drawers, job/alert/workflow CRUD against deployed contracts. |

Root **`package.json`** defines workspace scripts (e.g. `contracts:deploy`, `dev`) so you usually run commands from the **repository root**.

---

## Contracts

Deployed by **`contracts/scripts/deploy.ts`** on Somnia testnet (see [SETUP.md](./SETUP.md) §3). Output addresses land in **`contracts/deployments/latest.json`**.

| Contract | Role |
|----------|------|
| **AutomationRegistry** | Stores jobs and alerts; tracks runs, cooldowns, and counters. |
| **WorkflowOrchestrator** | Executes ordered workflow steps (`executeWorkflow`) with real external calls. |
| **ReactiveAutopilotHandler** | Implements Somnia’s reactive handler interface; `onEvent` is the entry from the precompile. Also supports **`runJobManually`** for owner/creator smoke tests without a live reactive event. |
| **MockSignalEmitter** | Demo contract emitting **HealthSignal** / **MetricSignal** events—stand-in for an external protocol’s logs. |
| **MockProtocolController** | Demo callee for workflow steps (counters / demo behavior), stand-in for real integrations. |

### What is “real” on-chain vs mock?

| Piece | On-chain reality |
|--------|------------------|
| Registry, orchestrator, handler | Fully real: storage, access control, events, and calls behave as in production-style code. |
| Reactivity path | Real: subscriptions and precompile `subscribe` are the same model as [Somnia’s on-chain reactivity docs](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial). |
| Mock emitter / mock controller | **Real bytecode and real logs/calls**, but **fake business semantics**—replace addresses when you integrate a real protocol. |

---

## SDK

Package: **`@somnia-autopilot/sdk`**. In this monorepo it is marked **private**; you can still depend on it via a **workspace**, **`file:`** path, or by **publishing** the package to your registry for downstream projects.

Consumed by Hardhat scripts (e.g. `setupSubscriptions.ts`) and other Node tooling; **not** required in the browser app for normal dashboard use.

**Build before first script run:**

```bash
npm run sdk:build
```

### Responsibilities

- **Types** — `DeploymentManifest`, `ReactivityGasConfig`, `StandardSubscriptionSummary`.  
- **Chain / clients** — `somniaChainFor`, `createAutopilotSdk`, `normalizePrivateKey`, `baseSoliditySubscription`.  
- **Gas from env** — `reactivityGasFromEnv()` (aligns with [Somnia gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration)).  
- **Standard subscriptions** — `createStandardAutopilotSubscriptions`:  
  - Mock emitter: **`createSoliditySubscription`** with explicit **HealthSignal** / **MetricSignal** topics.  
  - Block tick, epoch tick, schedule: **`subscribeViaPrecompile`** (workaround for `@somnia-chain/reactivity` 0.1.10 rejecting the precompile as `emitter` in `createSoliditySubscription`).  
- **Preflight** — `assertReactivitySubscribePreflight` (chain ID, code, ERC-165 / `ISomniaEventHandler`, balance warning vs **32+ SOMI** guidance from docs).  
- **Low-level helpers** — `subscribeViaPrecompile`, `SOMNIA_REACTIVITY_PRECOMPILE`, `systemEventTopics` (`blockTickTopic0`, `epochTickTopic0`, `scheduleTopic0`, …).

Public exports are listed in **`sdk/src/index.ts`**.

---

## Dashboard

Path: **`app/`**. Package: **`@somnia-autopilot/app`**.

- **Stack:** Vite, React, Tailwind CSS, **wagmi v2**, **RainbowKit** (MetaMask, WalletConnect, injected wallets).  
- **WalletConnect:** set **`VITE_WALLETCONNECT_PROJECT_ID`** from [Reown Cloud](https://cloud.reown.com) in `app/.env`.  
- **Read RPC:** **`VITE_RPC_URL`** (can match your public Somnia RPC).  
- **Small viewports:** below the `lg` breakpoint (~1024px), only a **“Please use a larger screen”** message is shown; the main dashboard is hidden so tables and drawers stay usable on desktop-sized layouts.  
- **In-app help:** use the **Guide** control in the header for a walkthrough of each screen.

Contract addresses come from **`contracts/deployments/latest.json`** via **`npm run contracts:sync-vite-env`** (or `emitViteEnv.ts --write`); paste into **`app/.env`** per [SETUP.md](./SETUP.md) §7.

---

## Getting started

**Prerequisites**

- Node.js **20+**  
- A **funded** Somnia testnet account for deploy and subscription transactions  
- Optional: browser wallet + Reown project ID for the dashboard  

**End-to-end path (short version)**

1. **Install and build the SDK**

   ```bash
   npm install
   npm run sdk:build
   ```

2. **Configure the deployer** — copy `contracts/.env.example` → `contracts/.env` and set `SOMNIA_RPC_URL`, `SOMNIA_CHAIN_ID`, `SOMNIA_PRIVATE_KEY`. Optional: `REACTIVITY_MAX_FEE_GWEI`, `REACTIVITY_GAS_LIMIT`, `SCHEDULE_DELAY_MS`.

3. **Deploy contracts**

   ```bash
   npm run contracts:deploy
   ```

   Produces **`contracts/deployments/latest.json`**.

4. **Register reactivity subscriptions** (required for reactive triggers on testnet)

   ```bash
   npm run contracts:setup-subscriptions
   ```

   Writes **`contracts/deployments/subscriptions.latest.json`**. If `subscribe` reverts, see [SETUP.md](./SETUP.md) §5 (gas, **32+ SOMI** balance, duplicate subscriptions).

5. **Optional demo data**

   ```bash
   cd contracts && npm run demo:seed
   ```

   Or create jobs, alerts, and workflows entirely from the dashboard.

6. **Point the app at your deployment**

   ```bash
   npm run contracts:sync-vite-env
   ```

   Merge printed `VITE_*` lines into **`app/.env`** (see `app/.env.example`). Set **`VITE_CHAIN_ID`**, **`VITE_RPC_URL`**, **`VITE_WALLETCONNECT_PROJECT_ID`**.

7. **Run the dashboard**

   ```bash
   npm run dev
   ```

   Open the URL Vite prints (typically `http://localhost:5173`), switch to the configured chain, connect a wallet.

**Manual job execution (no reactive event):** `ReactiveAutopilotHandler.runJobManually` is allowed for the **handler owner** or the **job’s on-chain creator**—exposed in the UI and in **`contracts/scripts/triggerDemo.ts`**.

---

## Configuration cheat sheet

### `contracts/.env` (deployer / scripts)

| Variable | Required | Notes |
|----------|----------|--------|
| `SOMNIA_RPC_URL` | Yes | HTTP RPC for Somnia testnet. |
| `SOMNIA_CHAIN_ID` | Yes | Must match the network (e.g. `50312`). |
| `SOMNIA_PRIVATE_KEY` | Yes | `0x`-prefixed key; keep secret. |
| `REACTIVITY_MAX_FEE_GWEI` | No | Default `10`; `0`/empty treated as `10` gwei. |
| `REACTIVITY_GAS_LIMIT` | No | Default `3000000`. |
| `SCHEDULE_DELAY_MS` | No | One-off schedule delay; default `90000`. |

### `app/.env` (dashboard)

| Variable | Purpose |
|----------|---------|
| `VITE_RPC_URL` | Public RPC for reads and wallet RPC where applicable. |
| `VITE_CHAIN_ID` | Same chain as contracts. |
| `VITE_*_ADDRESS` | Registry, orchestrator, handler, mock emitter, mock controller (from sync script). |
| `VITE_WALLETCONNECT_PROJECT_ID` | RainbowKit / WalletConnect. |
| `VITE_EXPLORER_BASE_URL` | Optional explorer links. |

---

## Useful commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dashboard. |
| `npm run contracts:deploy` | Deploy all contracts to Somnia testnet. |
| `npm run contracts:setup-subscriptions` | Create standard handler subscriptions. |
| `npm run contracts:sync-vite-env` | Print `VITE_*` lines from `latest.json`. |
| `npm run sdk:build` | Compile `@somnia-autopilot/sdk`. |
| `npm run build` | SDK + app build + contract compile (root script). |
| `cd contracts && npm run demo:seed` | Seed sample workflow / job / alert. |
| `cd contracts && npm run demo:trigger` | Run demo contract calls (`triggerDemo.ts`). |

Writing **`app/.env.contracts`** automatically:

```bash
cd contracts && npx hardhat run scripts/emitViteEnv.ts --network hardhatMainnet -- --write
```

---

## Development and quality checks

```bash
npm run build
npm run test --workspace=@somnia-autopilot/contracts
npm run lint --workspaces --if-present
```

Solidity tests live under **`contracts/test/`** (e.g. registry, orchestrator, handler).

---

## Replacing demo contracts

- Point **subscriptions** (via your own script or a fork of `createStandardAutopilotSubscriptions`) at your protocol’s **emitter** and **event topic** hashes.  
- Point **jobs** and **alerts** at the same emitter/`topic0` your subscriptions deliver.  
- Point **workflow steps** at real **target** contracts and **calldata** instead of `MockProtocolController`.  
- Re-run **`setup-subscriptions`** (or equivalent) after redeploying the handler or changing subscription shape; cancel stale subscriptions on-chain if you duplicate them.

---

## References

- **[README.md](./README.md)** — High-level overview and developer experience.  
- **[SETUP.md](./SETUP.md)** — Detailed setup, Somnia tutorial mapping, subscription troubleshooting.  
- [What is reactivity?](https://docs.somnia.network/developer/reactivity/what-is-reactivity)  
- [Subscriptions (core primitive)](https://docs.somnia.network/developer/reactivity/subscriptions-the-core-primitive)  
- [Gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration)  
- [Solidity on-chain reactivity tutorial](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial)  
- [RainbowKit](https://www.rainbowkit.com) · [wagmi](https://wagmi.sh)
