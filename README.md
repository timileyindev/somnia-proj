# Somnia Autopilot

This project is a **Somnia hackathon automation stack**: Solidity contracts that receive [Somnia Reactivity](https://docs.somnia.network/developer/reactivity/what-is-reactivity) events, match **jobs** and **alerts** in an on-chain registry, and execute **multi-step workflows** via an orchestrator. It includes **`@somnia-autopilot/sdk`** for deploy/subscription scripts and a **React dashboard** to manage and inspect deployments.

## How it works

On-chain **subscriptions** (created with the SDK or Hardhat scripts) route matching logs and system ticks into **`ReactiveAutopilotHandler`**. The handler reads **`AutomationRegistry`** and, when a job or alert matches the event, runs the linked workflow through **`WorkflowOrchestrator`**. **`MockSignalEmitter`** and **`MockProtocolController`** are demo contracts so the full path can be tried on testnet without wiring a real protocol.

The default subscription set registers **HealthSignal** and **MetricSignal** on the mock emitter (explicit event topics), plus **BlockTick**, **EpochTick**, and a one-off **Schedule**. Block, epoch, and schedule use direct precompile **`subscribe`** where `@somnia-chain/reactivity` v0.1.10 refuses the precompile address as `emitter` in `createSoliditySubscription`. **Jobs** and **alerts** in the registry add a second filter (emitter, `topic0`, trigger type, cooldowns). Reactive execution needs **both** a subscription that delivers the event **and** a registry rule that matches it.

---

## Repository layout

| Path | Package | Description |
|------|---------|-------------|
| `contracts/` | `@somnia-autopilot/contracts` | Hardhat, five contracts, deploy / `setup-subscriptions` / seed / demo scripts. Outputs `deployments/latest.json`. |
| `sdk/` | `@somnia-autopilot/sdk` | TypeScript helpers for reactivity setup and scripts (`npm run sdk:build`). API details: **`technicals.md`**. |
| `app/` | `@somnia-autopilot/app` | RainbowKit + wagmi dashboard: workflows, jobs, alerts, charts, run timeline, in-app **Guide**. Layout targets desktop; viewports under ~1024px show a full-screen “use a larger screen” message. |

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
