# Somnia Autopilot

This project is a **Somnia hackathon automation stack**: Solidity contracts that receive [Somnia Reactivity](https://docs.somnia.network/developer/reactivity/what-is-reactivity) events, match **jobs** and **alerts** in an on-chain registry, and execute **multi-step workflows** via an orchestrator. It ships a TypeScript SDK (**`@somnia-autopilot/sdk`**) to wire **reactivity subscriptions** and to **drive the automation contracts from Node** (workflows, jobs, alerts—any pattern Somnia should deliver), plus a **React dashboard** for interactive management.

## How it works

On-chain **subscriptions** (created with the SDK or Hardhat scripts) route matching logs and system ticks into **`ReactiveAutopilotHandler`**. The handler reads **`AutomationRegistry`** and, when a job or alert matches the event, runs the linked workflow through **`WorkflowOrchestrator`**. **`MockSignalEmitter`** and **`MockProtocolController`** are demo contracts so the full path can be tried on testnet without wiring a real protocol.

The default subscription set registers **HealthSignal** and **MetricSignal** on the mock emitter (explicit event topics), plus **BlockTick**, **EpochTick**, and a one-off **Schedule**. Block, epoch, and schedule use direct precompile **`subscribe`** where `@somnia-chain/reactivity` v0.1.10 refuses the precompile address as `emitter` in `createSoliditySubscription`. **Jobs** and **alerts** in the registry add a second filter (emitter, `topic0`, trigger type, cooldowns). Reactive execution needs **both** a subscription that delivers the event **and** a registry rule that matches it.

---

## Repository layout

| Path | Package | Description |
|------|---------|-------------|
| `contracts/` | `@somnia-autopilot/contracts` | Hardhat, five contracts, deploy / `setup-subscriptions` / seed / demo scripts. Outputs `deployments/latest.json`. |
| `sdk/` | `@somnia-autopilot/sdk` | Reactivity SDK + **viem `walletClient`**, **`DeploymentManifest`** / **`readDeploymentFile`**, subscription helpers, preflight, gas from env. Use the wallet + addresses to send **any** `AutomationRegistry` / **`WorkflowOrchestrator`** txs (see below). Build with `npm run sdk:build`. |
| `app/` | `@somnia-autopilot/app` | RainbowKit + wagmi dashboard: workflows, jobs, alerts, charts, run timeline, in-app **Guide**. Layout targets desktop; viewports under ~1024px show a full-screen “use a larger screen” message. |

---

## SDK: subscriptions and full automation management

Install **`@somnia-autopilot/sdk`** from npm when published, or depend on `sdk/` via workspace / `file:`.

**Reactive delivery.** Load a **`DeploymentManifest`** (e.g. with **`readDeploymentFile`**), call **`createAutopilotSdk`**, then **`createStandardAutopilotSubscriptions`** or your own subscription logic so Somnia delivers the right logs and system events into **`ReactiveAutopilotHandler`**. Use **`assertReactivitySubscribePreflight`** and **`reactivityGasFromEnv`** before sending `subscribe` txs.

**Workflows, jobs, and alerts (any automation on Somnia).** The same **`createAutopilotSdk`** return value includes a **viem `walletClient`** keyed to your RPC and chain. Together with **`deployment.contracts.automationRegistry`**, **`deployment.contracts.workflowOrchestrator`**, and the handler/emitter addresses from the manifest, you can **`writeContract`** against **`AutomationRegistry`** and **`WorkflowOrchestrator`** for the full lifecycle: create and update **workflows** (steps, targets, calldata), **jobs** (Schedule, BlockTick, EpochTick, External Event triggers, cooldowns, links to workflows), and **alert rules** (emitters, topics, thresholds)—covering whatever automation surface you deploy on Somnia. Pair those txs with **custom subscriptions** (same wallet + `subscribeViaPrecompile` / `sdk.createSoliditySubscription`) so reactive events actually reach the handler for external emitters and system ticks.

There are no separate “job builder” classes in the package today: **management is viem + contract ABIs** (from this repo’s **`contracts/artifacts`** or the app’s ABI snippets) **plus** the SDK’s clients, types, and reactivity helpers. That keeps one stack for hackathon scripts, CI pipelines, or a custom operator tool targeting **any** Somnia network where these contracts are deployed.

---

## Quick start

```bash
npm install
npm run sdk:build
```

Configure `contracts/.env`, then `npm run contracts:deploy`, `npm run contracts:setup-subscriptions`, sync contract addresses into `app/.env`, and `npm run dev`. See **[SETUP.md](./SETUP.md)** for the full sequence and **[technicals.md](./technicals.md)** for commands and environment tables.

---

## External documentation

- [What is reactivity?](https://docs.somnia.network/developer/reactivity/what-is-reactivity)  
- [Solidity on-chain reactivity tutorial](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial)  
- [Gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration)
