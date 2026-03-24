# Somnia Autopilot

This project is a **full automation platform built on Somnia**.

It combines:
- a smart-contract automation core,
- an SDK for developer scripting and setup,
- and a built-in dashboard for monitoring and control.

The goal is simple: make it easy to run **reliable on-chain automation** using Somnia Reactivity, without every team rebuilding the same infrastructure from scratch.

## 🚀 What You Built

**Somnia Autopilot** gives users a complete loop:

- define **workflows** (what to execute),
- define **jobs and alerts** (when to execute),
- connect reactive events and system ticks,
- monitor results from one interface.

It is designed for practical automation use cases like scheduled actions, event-driven triggers, and recurring health checks.

## ⚙️ How It Works

**Label: Event delivery**
- Subscriptions route matching Somnia events and system ticks into your reactive handler.

**Label: Decision layer**
- The handler checks on-chain rules (jobs and alerts) in the registry to decide what should fire.

**Label: Execution layer**
- Matched rules trigger workflow execution through the orchestrator, step by step.

**Label: Visibility**
- Executions and state changes are visible in the dashboard for operators and developers.

## 🧩 Project Components

| Component | Path | Purpose |
|---|---|---|
| **Contracts** | `contracts/` | Core automation logic: registry, handler, orchestrator, and demo contracts for testnet flow. |
| **SDK** | `sdk/` | `@somnia-autopilot/sdk` helpers for client setup, reactivity subscriptions, and developer scripts. |
| **Dashboard** | `app/` | UI to create/manage workflows, jobs, alerts, and track runs in real time. |

## 🛠️ SDK in Plain Terms

The SDK is the developer entry point for integrating this automation system in scripts and backend tools.

With it, developers can:
- bootstrap clients quickly,
- register and manage reactivity subscriptions,
- connect deployed addresses and manifests,
- orchestrate automation setup without dealing directly with low-level reactivity wiring each time.

For detailed API-level usage, see **`technicals.md`**.

## 📊 Dashboard Experience

The dashboard provides a management layer over the contracts:
- create and edit workflows,
- create and edit jobs and alerts,
- inspect execution history and outcomes,
- monitor system behavior from one place.

This makes the platform usable not only by protocol engineers, but also by operators running day-to-day automation.

## 🧪 Quick Start

```bash
npm install
npm run sdk:build
```

Then follow the setup flow in **[SETUP.md](./SETUP.md)**:
- configure environment,
- deploy contracts,
- set up subscriptions,
- run the dashboard.

## 📚 Documentation Guide

- **`README.md`** (this file): high-level product overview.
- **[SETUP.md](./SETUP.md)**: setup and deployment flow.
- **[technicals.md](./technicals.md)**: technical internals, commands, and deeper implementation notes.

## 🔗 Somnia References

- [What is Reactivity?](https://docs.somnia.network/developer/reactivity/what-is-reactivity)
- [Solidity on-chain reactivity tutorial](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial)
- [Gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration)
