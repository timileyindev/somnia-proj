# Somnia Autopilot

Somnia Autopilot is an **on-chain automation platform for the Somnia network**.

It provides a complete automation stack where teams can define **what should run** (workflows), **when it should run** (jobs and alerts), and **how it should be monitored** (dashboard + run history), all on top of Somnia Reactivity.

The project is organized into three core parts:
- a Solidity automation core (`AutomationRegistry`, `ReactiveAutopilotHandler`, `WorkflowOrchestrator`),
- an SDK (`@somnia-autopilot/sdk`) for setup and scripting,
- and a built-in dashboard for day-to-day operations.

Instead of rebuilding low-level automation plumbing for each use case, this project gives a reusable baseline for event-driven, schedule-driven, and recurring automation flows on Somnia.

## 📌 Overview

Somnia Autopilot is designed to support a practical lifecycle:

- define workflows as multi-step on-chain actions,
- attach jobs and alerts to trigger those workflows,
- connect the system to Somnia reactivity subscriptions,
- monitor execution outcomes from one interface.

## ⚙️ How It Works

**Label: Event delivery**
- Subscriptions route matching Somnia events and system ticks into your reactive handler.

**Label: Decision layer**
- The handler checks on-chain rules (jobs and alerts) in the registry to decide what should fire.

**Label: Execution layer**
- Matched rules trigger workflow execution through the orchestrator, step by step.

**Label: Visibility**
- Executions and state changes are visible in the dashboard for operators and developers.

## 🔄 How Reactivity Is Used (Submission Focus)

Somnia Reactivity is used as the **triggering layer** of the entire automation model in this project.
It is not used as a side feature; it is the entrypoint that activates workflows through jobs and alerts.

### 1) Core automation concepts in this project

- **Workflow (`what to do`)**  
  A workflow is a reusable sequence of on-chain actions (multiple contract calls, ordered steps, and execution behavior) stored in the system and executed by `WorkflowOrchestrator`.

- **Job (`when to run`)**  
  A job links a trigger condition to a workflow. Trigger conditions include time/cadence and event-based conditions. When its condition is met, the linked workflow is executed.

- **Alert (`when to react`)**  
  An alert rule watches for matching event conditions (emitter/topic/value logic) and triggers the linked workflow as a response.

In short: **workflows define actions**, while **jobs and alerts define activation rules**.

### 2) Where Reactivity fits in

Reactivity is the mechanism that delivers trigger signals into the system:

- Subscriptions define what event streams/signals should be forwarded to `ReactiveAutopilotHandler`.
- The handler receives those signals on-chain and evaluates registered jobs/alerts in `AutomationRegistry`.
- If a rule matches, the handler invokes `WorkflowOrchestrator` to execute the linked workflow.

Without Reactivity delivery, jobs and alerts have nothing to evaluate.
Without jobs/alerts, delivered events have no automation policy attached.
The project intentionally combines both.

### 3) Two-layer control model

This architecture uses two independent control layers:

- **Delivery control (Reactivity subscriptions):** which signals are allowed to enter the automation engine.
- **Policy control (Registry jobs/alerts):** which of those signals should actually execute which workflow.

This is important because teams can:
- broaden/narrow delivery without rewriting business logic,
- update job/alert policy without redeploying the trigger transport,
- reuse workflows across many different trigger rules.

### 4) End-to-end execution lifecycle

1. A subscribed signal/event is emitted on Somnia.
2. Somnia Reactivity forwards it to `ReactiveAutopilotHandler`.
3. The handler checks matching jobs and alerts in `AutomationRegistry`.
4. Matching rules select a workflow ID.
5. `WorkflowOrchestrator` executes that workflow’s steps.
6. Execution outcomes are persisted and surfaced in the dashboard.

This turns Reactivity into a full **automation pipeline**, not just event observation.

### 5) Why this matters for submission

This project demonstrates Reactivity as a **practical automation backbone**:

- It supports both recurring/cadence automation and event-driven automation.
- It cleanly separates **trigger transport** from **automation policy**.
- It enables scalable reuse: many jobs/alerts can target shared workflows.
- It provides an operator-facing dashboard to manage and monitor the lifecycle.

### 6) How the SDK supports this model

`@somnia-autopilot/sdk` is used to operationalize reactivity usage:

- create clients and load deployment context,
- preflight subscription requirements,
- register standard subscriptions,
- support script-based automation setup before operators manage rules in the dashboard.

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
