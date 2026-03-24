Winning concept: Somnia Autopilot (Keeperless Automation Layer)

A reusable infrastructure dApp where users define:

1. When to run (Schedule, EpochTick, BlockTick)
2. What to watch (events + state thresholds)
3. What to do (single call or multi-step cross-contract workflow)

Core value: “No off-chain bot needed; chain-native reactive automation.”



Module design (deep but hackathon-feasible)

1) Cron Scheduler Module (CronKernel)
•  Supports:
◦  One-time jobs via Schedule
◦  Recurring jobs via EpochTick + interval logic
◦  Optional high-frequency jobs via BlockTick
•  Key implementation detail:
◦  Schedule is one-off, so each execution should register the next run.
•  Use cases:
◦  Auto-claim rewards
◦  Timed treasury distributions
◦  Periodic maintenance calls (rebalance, rollover)

2) Alert System Module (Sentinel)
•  Users create alert rules:
◦  Event filter (emitter, topic)
◦  Optional state condition (eth_call / contract view checks)
•  Alert outputs:
◦  On-chain AlertRaised events (truth source)
◦  Real-time UI updates over websocket reactivity
•  Noise control:
◦  Use isCoalesced=true for high-volume signals
◦  Use cooldown windows to prevent spam

3) Cross-Contract Orchestrator (Conductor)
•  Reactive state machine:
◦  Trigger from event/alert
◦  Execute step-by-step action plan across contracts
◦  Handle failure with retry / fallback / compensate
•  Example runbook:
◦  “If vault health < X, swap collateral, repay debt, emit completion event.”
•  Why this wins:
◦  Shows clear infra impact beyond a toy app.



Best demo narrative (2–5 minutes)

Use one DeFi safety scenario that naturally shows all 3 modules:

1. Create a recurring “health check” job (cron)
2. Trigger a real market/state event (or mocked testnet event)
3. Alert appears instantly on dashboard (real-time UX)
4. Orchestrator auto-executes a 2–3 step rescue flow across contracts
5. Show final state + execution trace on explorer + app timeline

This hits all judging criteria directly:
•  Technical Excellence: deterministic workflow + retries
•  Real-Time UX: immediate push updates
•  Somnia Integration: native reactivity + deployed testnet contracts
•  Potential Impact: generalizable automation infra



Technical choices that align with Somnia Reactivity docs

•  System event subscriptions must set emitter to Somnia reactivity precompile address.
•  Prefer isGuaranteed=true for critical automations.
•  Keep isCoalesced=false for exact workflow sequencing; true only for noisy alerts.
•  Set gas conservatively (many teams fail here):
◦  start around maxFeePerGas ~10 gwei equivalent
◦  gasLimit at least around 2,000,000 for state writes; more for orchestration.
•  Align reactivity subscription gas with Somnia gas-configuration doc; `@somnia-chain/reactivity-contracts` defines a 32 ether minimum-balance constant in `SomniaExtensions`.
•  Reactivity is currently on Somnia testnet, so demo and deployment should target testnet only.



MVP scope (realistic)

If you keep scope tight, you can ship:

•  3 contracts:
◦  AutomationRegistry
◦  ReactiveHandler (inherits Somnia event handler)
◦  WorkflowOrchestrator
•  1 SDK/service layer:
◦  create/update subscription helpers
•  1 frontend page:
◦  jobs, alerts, workflow runs (live feed)
•  1 polished scenario:
◦  DeFi risk auto-mitigation

Stretch goal: plug-in adapters so any protocol can add actions without touching core engine.



Two backup ideas (if you want narrower scope)

1. Cron-as-a-Service only
◦  Infrastructure-grade scheduler for any contract.
◦  Fastest to ship, less differentiated than full stack.
2. Reactive Security Sentinel
◦  Detect suspicious contract activity and auto-pause/guard.
◦  Strong impact story, but needs careful false-positive handling.



If you want, I can next give you a repo architecture + contract interfaces + exact MVP task breakdown so you can start building immediately.

Sources:
•  https://docs.somnia.network/developer/reactivity/system-events  
•  https://docs.somnia.network/developer/reactivity/subscriptions-the-core-primitive  
•  https://docs.somnia.network/developer/reactivity/gas-configuration  
•  https://docs.somnia.network/developer/reactivity/api-reference  
•  https://docs.somnia.network/developer/reactivity/state-consistency-guarantees  
•  https://docs.somnia.network/developer/reactivity/what-is-reactivity  
•  https://docs.somnia.network/developer/reactivity/quickstart
okay, based on your proposed mvp (somnia autopilot), if we start now, can we finish up everything in about 10 hours?
Yes — if we keep it to a strict demo MVP, 10 hours is realistic.

If “everything” means production-grade (multiple workflows, hardened security, full tests, polished UI), then no.

What fits in 10 hours (realistically)
•  One end-to-end scenario only (e.g., “risk alert → auto-action”)
•  Minimal contracts:
◦  scheduler trigger
◦  alert rule check
◦  1 orchestrated action flow (2–3 contract calls max)
•  Basic dashboard (create rule/job + live event feed + execution history)
•  Testnet deploy + README + 2–5 min demo video

What to cut (must cut to hit 10h)
•  Multi-tenant permissions model
•  Generic plugin/adapters framework
•  Fancy UI/analytics
•  Extensive test suite (keep smoke tests only)
•  Multiple use-case demos

10-hour execution split
1. 1h: Scope lock + architecture + interfaces  
2. 3h: Solidity contracts + handler logic  
3. 1h: Subscription scripts + gas config + trigger wiring  
4. 2h: Minimal frontend (forms + live status + logs)  
5. 1h: Deploy + end-to-end validation on testnet  
6. 1h: README + setup scripts + known limits  
7. 1h: Demo recording + final bug fixes/buffer

If you want, I can give you a hard-scoped build checklist (task-by-task, in order) so you can execute this in a single 10-hour sprint.
lets include the fancy UI/analytics. if time permits, we will add the rest sequentially. now create a MD file that contains the system plan and what we are building, then you can get right to building the whole system. lets use vite +react + tailwindcss  for the UIside of thigs
You want two things: a clear system plan artifact and immediate implementation of the full Somnia Autopilot stack with a Vite + React + Tailwind frontend. I’ll first inspect the existing codebase to determine current scaffolding, then I’ll draft the implementation plan artifact and proceed into execution in sequence.
The repository is currently empty, so I’ll scaffold both smart-contract and frontend workspaces from scratch and structure them so the demo can run end-to-end quickly. I’m creating the implementation plan artifact now, then I’ll start building immediately from that plan.
Scaffold monorepo workspaces
Implement Solidity automation contracts
Configure Hardhat and deployment scripts
Add Somnia Reactivity subscription setup
Build Vite React Tailwind frontend
Integrate frontend blockchain wiring
Write project documentation
Validate build and quality checks
I’ve created the execution checklist and I’m now scaffolding the monorepo foundation first so contracts and frontend can be built in parallel safely. I’ll initialize workspace packages, then wire shared scripts/env defaults.