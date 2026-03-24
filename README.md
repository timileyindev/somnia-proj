# Somnia Autopilot

**Somnia Autopilot** is an automation stack for [Somnia](https://docs.somnia.network): it turns **Somnia Reactivity**—the network’s ability to push the *right* contract logs and system signals into your on-chain code—into something teams can **operate** day to day. Instead of treating every automation as a one-off integration with precompiles, gas tuning, and bespoke handlers, you get a **registry of jobs and alerts**, **reusable multi-step workflows**, a **single reactive entry contract**, and a **management dashboard** to configure and monitor everything.

This repository is the **reference implementation**: Solidity contracts, the **`@somnia-autopilot/sdk`** TypeScript package, and a production-style **web console**. Together they show how to build serious automation on Somnia without every developer re-learning the lowest layers of the reactivity stack.

---

## Why automation on-chain is hard—and what Somnia changes

On many chains, “automation” means off-chain bots, centralized schedulers, or fragile scripts that watch RPC logs. That works until you care about **trust minimization**, **transparent execution**, or **composability** with other protocols: someone still has to run infrastructure, secure keys, and keep watchers in sync with chain reorganizations and missed blocks.

**Somnia Reactivity** is different: the protocol can **deliver events to your contracts** according to **subscriptions** you register on-chain. Your contract becomes the place where reactions run—auditable, atomic with the rest of your protocol, and aligned with Somnia’s execution model. The mental model is powerful, but the **operational details** are still demanding: subscription shapes, handler interfaces, gas parameters, precompile addresses, and the difference between “subscribing to a contract” versus “subscribing to system ticks and schedules.”

**Somnia Autopilot** sits on top of that foundation. It **does not replace** Somnia’s reactivity primitives; it **uses them deliberately** and wraps them in a **product-shaped layer**: jobs, alerts, workflows, and an operator UI—so teams spend time on *what* should run, not only on *how* the chain delivers the next log.

---

## What you get: three layers that work together

### 1. On-chain automation core

At the center is **`ReactiveAutopilotHandler`**, the contract Somnia’s reactivity system calls when a subscribed event fires. That handler is wired to:

- **`AutomationRegistry`** — where **jobs** (scheduled, per-block, per-epoch, or external-event triggers) and **alert rules** (threshold-style reactions to events) live, with cooldowns, counters, and ownership.  
- **`WorkflowOrchestrator`** — where **workflows** are defined as ordered steps: each step is a **target contract** and **calldata**, executed in sequence with explicit success/failure semantics.

Nothing here is a toy accounting trick: when a workflow runs, the orchestrator performs **real external calls**. The registry records **real execution history**. The handler enforces **who** may trigger what and **when** cooldowns apply.

### 2. **`@somnia-autopilot/sdk`**

The SDK is how **developers and DevOps** interact with the **sharp edges** of reactivity **without** hand-rolling every precompile call for common paths. It packages:

- **Viem-first clients** and **chain helpers** tuned for Somnia testnet usage.  
- **Gas configuration** that follows [Somnia’s gas documentation](https://docs.somnia.network/developer/reactivity/gas-configuration) so `maxFeePerGas`, `priorityFeePerGas`, and `gasLimit` land in the ranges validators expect.  
- **Standard subscription flows** that register the handler for **mock demo events**, **block ticks**, **epoch ticks**, and **one-shot schedules**—including workarounds where the upstream Reactivity SDK rejects certain precompile-shaped emitters, so your scripts still match the **same `SubscriptionData`** shape as the official Solidity tutorials.  
- **Preflight checks** (chain ID, bytecode, ERC-165 / `ISomniaEventHandler`, and balance hints) so failed `subscribe` transactions fail **before** you burn gas without context.

You use the SDK in **Node** (Hardhat scripts, deployment pipelines, cron in CI, internal admin tools). The browser dashboard does **not** need the SDK for normal operation; it talks to the same contracts through **wagmi** and your RPC.

### 3. **Management dashboard**

The **`app/`** package is a **built-in operator console**: connect a wallet, create and edit **workflows**, **jobs**, and **alerts**, refresh on-chain state, filter tables, inspect runs, and use charts and timelines for a quick health read. An in-app **Guide** explains each area for new teammates.

The dashboard is intentionally **desktop-first** (wide tables and drawers); on small viewports it asks the user to switch to a larger screen so operational work stays reliable.

---

## Real-world use on Somnia

The following are **illustrative** patterns the architecture supports—not limits. Replace demo contracts with your protocol’s addresses and the same flows apply.

**Protocol health and risk**  
Lending, perps, and vaults emit **health**, **liquidation**, or **utilization** style events. An **alert rule** can watch a specific `topic0` and numeric payload, then run a **workflow** that updates internal state, notifies another contract, or prepares a defensive action—**triggered by reactivity** when the log is emitted, without a private indexer holding the keys.

**Time-based and cadence operations**  
**Schedule** subscriptions fire at a concrete timestamp; **block** and **epoch** ticks give you a regular heartbeat on-chain. Jobs tied to those triggers can run **harvest**, **fee distribution**, **oracle heartbeat checks**, or **state compaction** on a rhythm you define in the registry—again with execution visible on-chain.

**Cross-contract playbooks**  
A **workflow** is a **script stored as data**: step one might call a router, step two a pool, step three a rewards contract. The autopilot handler becomes the **single trusted executor** for that playbook when a job or alert fires, which is easier to audit than scattered EOAs.

**Gradual decentralization**  
Teams often start with **manual** `runJobManually` (where the contract allows it) for smoke tests, then move to **fully reactive** execution as subscriptions and jobs are tuned. The same registry and orchestrator support both.

In every case, **Somnia Reactivity** supplies the **delivery mechanism**; **Somnia Autopilot** supplies the **operational vocabulary** (job vs alert vs workflow) and the **dashboard** to manage it.

---

## How Somnia Autopilot simplifies automation

**One handler, many policies**  
Instead of deploying a new reactive contract for every integration pattern, you deploy **one** autopilot handler (per environment) and register **many** jobs and alerts against it. Subscription traffic still lands in one place; **policy** lives in the registry.

**Separation of “delivery” and “policy”**  
Somnia **subscriptions** answer: *which logs or system events reach the handler?*  
Registry **jobs and alerts** answer: *given this event, which workflow should run, for whom, and under what cooldown?*  
That split mirrors how production teams think: infrastructure (subscriptions) vs product rules (registry).

**Less low-level reactivity code in application repos**  
The SDK encodes repeated lessons: gas magnitudes, precompile interaction patterns, and the **topic** layout for system events. Your application code focuses on **deployment manifests** and **calling high-level functions** like `createStandardAutopilotSubscriptions` or your own thin wrappers—rather than copying tutorial snippets into every repo.

**Operational visibility**  
The dashboard surfaces **workflows, jobs, alerts, and runs** in one place. New operators do not need to read the whole handler Solidity to understand what the system is supposed to do; they read the registry through the UI.

---

## Making strong use of Somnia Reactivity

Reactivity is most valuable when **subscriptions are intentional** and **handlers are strict**. Somnia Autopilot aligns with that:

- **Explicit subscriptions** for demo emitters (concrete event signatures) avoid invalid “wildcard” shapes that the precompile rejects.  
- **System subscriptions** (ticks, schedule) follow the same **`SubscriptionData`** model as [Somnia’s on-chain tutorials](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial), so you stay compatible with network expectations.  
- The **handler** implements the interfaces Somnia expects and delegates business logic to **registry + orchestrator**, which keeps **reactivity plumbing** separate from **your automation rules**.

You still read [Somnia’s reactivity documentation](https://docs.somnia.network/developer/reactivity/what-is-reactivity) when tuning gas or debugging delivery; Autopilot reduces how often you must touch **precompile details** for the **standard** automation paths.

---

## Using `@somnia-autopilot/sdk` in your own project

The package name is **`@somnia-autopilot/sdk`**. It is the supported way to **script** reactivity setup and to share **types** (`DeploymentManifest`, gas config, subscription summaries) across tools.

**Installing**

- **From npm** — when the package is published under that scope, use `npm install @somnia-autopilot/sdk` (or your package manager equivalent) in any Node 20+ project.  
- **From this monorepo** — use npm/pnpm/yarn **workspaces**, or a **`file:../somnia-proj/sdk`** (or similar) dependency while you develop, then publish or vendor the built `dist/` for internal use.

After install, run **`npm run build`** inside the SDK package (or consume the prebuilt artifacts your pipeline produces) so TypeScript resolves **`dist/`** exports.

**What developers do *not* need to do for common flows**

- Manually assemble every field of **`SubscriptionData`** for block ticks, epoch ticks, and schedules from scratch (the SDK’s helpers and `createStandardAutopilotSubscriptions` encode the working shapes).  
- Guess **fee fields** in wei vs gwei incorrectly—the SDK’s `reactivityGasFromEnv()` and helpers follow Somnia’s documented scales.  
- Rediscover why a given **`createSoliditySubscription`** call never sends a transaction (the repo documents upstream SDK constraints and uses **direct precompile writes** only where necessary).

**Workflows, jobs, and alerts**

Creating **workflows**, **jobs**, and **alerts** means calling **`AutomationRegistry`** and **`WorkflowOrchestrator`** on-chain—exactly what the **dashboard** does with your wallet, or what **your scripts** can do with viem/ethers. The SDK today focuses on **reactivity subscription setup**, **client bootstrapping**, and **deployment typing**; registry writes are straightforward contract calls and are easiest from the UI or from small custom scripts. As your team grows, you can add more SDK helpers for registry CRUD without changing the core contracts.

**Typical integration path**

1. Deploy (or reuse) the Autopilot **contracts** on Somnia.  
2. Use the SDK in a **setup script** to run **preflight** and **create subscriptions** pointing at your **`ReactiveAutopilotHandler`** and your real or demo emitters.  
3. Configure **workflows / jobs / alerts** via the **dashboard** or your own tooling.  
4. Run the **dashboard** against the same deployment to **monitor** executions and iterate.

---

## Documentation map

| Document | Purpose |
|----------|---------|
| **README.md** (this file) | Product-level story, Somnia fit, SDK role, dashboard, real-world patterns. |
| **[technicals.md](./technicals.md)** | Architecture tables, command reference, env cheat sheet, contract inventory—**for engineers** wiring systems. |
| **[SETUP.md](./SETUP.md)** | Hands-on deploy order, env vars, Somnia doc cross-links, subscription troubleshooting. |

---

## Quick start

From the repository root:

```bash
npm install
npm run sdk:build
```

Then configure **`contracts/.env`**, run **`npm run contracts:deploy`** and **`npm run contracts:setup-subscriptions`**, sync addresses into **`app/.env`**, and start **`npm run dev`**. Full detail is in **[SETUP.md](./SETUP.md)**; compact tables and commands are in **[technicals.md](./technicals.md)**.

---

## Learn more

- [What is Somnia Reactivity?](https://docs.somnia.network/developer/reactivity/what-is-reactivity)  
- [Subscriptions — core primitive](https://docs.somnia.network/developer/reactivity/subscriptions-the-core-primitive)  
- [Gas configuration](https://docs.somnia.network/developer/reactivity/gas-configuration)  
- [Solidity on-chain reactivity tutorial](https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial)
