# Somnia Autopilot

Hackathon-ready **chain-native automation** demo: scheduler-style triggers (Schedule / BlockTick / EpochTick), **alert rules** on contract events, and a **multi-step workflow orchestrator**—wired to **Somnia Reactivity** via `ReactiveAutopilotHandler`.

## Monorepo layout

| Package | Role |
|--------|------|
| `contracts/` | Solidity (`AutomationRegistry`, `ReactiveAutopilotHandler`, `WorkflowOrchestrator`, mock protocol + signal contracts), Hardhat, deploy & demo scripts |
| `sdk/` | `@somnia-autopilot/sdk` — typed helpers for gas config, deployment JSON, and standard reactivity subscriptions |
| `app/` | Vite + React + Tailwind dashboard (analytics, filters, drawers, job/alert/workflow management) |

## Prerequisites

- Node.js 20+
- A funded Somnia testnet account (see [Somnia reactivity docs](https://docs.somnia.network/developer/reactivity/quickstart) for balance / gas notes)
- Optional: MetaMask (or any injected wallet) on the same chain as `VITE_CHAIN_ID`

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

**Manual smoke trigger (no reactivity):** `ReactiveAutopilotHandler.runJobManually` is **owner-only**; use the deployer wallet in the UI or `contracts/scripts/triggerDemo.ts`.

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
