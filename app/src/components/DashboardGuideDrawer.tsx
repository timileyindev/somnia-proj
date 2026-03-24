import type { ReactNode } from 'react'
import { Drawer } from './Drawer'

type DashboardGuideDrawerProps = {
  open: boolean
  onClose: () => void
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="border-b border-slate-800/90 pb-4 last:border-0 last:pb-0">
      <h3 className="mb-2 text-sm font-semibold text-indigo-200">{title}</h3>
      <div className="space-y-2 text-xs leading-relaxed text-slate-400">{children}</div>
    </section>
  )
}

export function DashboardGuideDrawer({ open, onClose }: DashboardGuideDrawerProps) {
  return (
    <Drawer open={open} title="Dashboard guide" onClose={onClose} wide>
      <div className="space-y-6">
        <p className="text-xs text-slate-500">
          Reference for every part of the Somnia Autopilot dashboard: what it does and how to use it
          end-to-end.
        </p>

        <Section title="Before you start">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              Set <span className="font-mono text-slate-500">VITE_*</span> contract addresses and{' '}
              <span className="font-mono text-slate-500">VITE_RPC_URL</span> /{' '}
              <span className="font-mono text-slate-500">VITE_CHAIN_ID</span> in{' '}
              <span className="font-mono text-slate-500">app/.env</span> (sync from your deployment).
            </li>
            <li>
              On Somnia testnet, run <span className="font-mono text-slate-500">contracts:setup-subscriptions</span>{' '}
              after deploy so reactive events can reach your handler. Registry jobs do not replace
              chain subscriptions.
            </li>
            <li>
              Connect a wallet on the <strong className="font-medium text-slate-300">same chain</strong> as{' '}
              <span className="font-mono text-slate-500">VITE_CHAIN_ID</span>. Writes require a signer.
            </li>
          </ul>
        </Section>

        <Section title="Header">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="text-slate-300">Wallet</strong> — RainbowKit connect / network switch.
            </li>
            <li>
              <strong className="text-slate-300">Guide</strong> — opens this panel.
            </li>
            <li>
              <strong className="text-slate-300">Refresh data</strong> — reloads jobs, alerts, workflows,
              runs, and handler <span className="font-mono text-slate-500">processedEvents</span> from RPC
              (auto-refresh also runs on an interval).
            </li>
          </ul>
        </Section>

        <Section title="How to use this dashboard (quick path)">
          <ol className="list-decimal space-y-1.5 pl-4 marker:text-indigo-400">
            <li>Create at least one workflow (sample or custom).</li>
            <li>Add a job or alert; set its workflow ID to that workflow.</li>
            <li>
              For external-event jobs, point emitter/topic at your contract (e.g. mock signal emitter +
              HealthSignal / MetricSignal / wildcard topic).
            </li>
            <li>Trigger with real chain events or “Send test signals” for the mock emitter.</li>
          </ol>
        </Section>

        <Section title="Demo contract addresses">
          <p>
            Copy-paste helpers for the mock signal emitter and mock protocol controller. Use the{' '}
            <strong className="text-slate-300">signal emitter</strong> as the job/alert{' '}
            <strong className="text-slate-300">emitter</strong> when you want demo health/metric logs.
          </p>
        </Section>

        <Section title="Stat cards">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="text-slate-300">Handler runs</strong> — times the reactive handler processed
              an event (Somnia delivered a log into your handler).
            </li>
            <li>
              <strong className="text-slate-300">Active jobs / alerts</strong> — on-chain rules currently
              enabled.
            </li>
            <li>
              <strong className="text-slate-300">Workflow success rate / runs</strong> — from orchestrator
              execution history.
            </li>
            <li>
              <strong className="text-slate-300">Job runs (registry)</strong> — executions recorded on the
              automation registry for jobs.
            </li>
            <li>
              <strong className="text-slate-300">Your wallet</strong> — connected address; pending actions
              show here while a transaction is in flight.
            </li>
          </ul>
        </Section>

        <Section title="What do you want to do?">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="text-slate-300">Create workflow (custom steps)</strong> — opens a form:
              name, ordered steps (target address, wei value, calldata hex, allow failure). You can paste
              any contract; optional helpers fill addresses from env or demo ABIs into calldata only.
            </li>
            <li>
              <strong className="text-slate-300">Create sample workflow</strong> — one transaction that
              registers three calls to the mock protocol controller (needs that address in env).
            </li>
            <li>
              <strong className="text-slate-300">Add job</strong> — when to run a workflow: schedule, block
              tick, epoch tick, or external contract event. System triggers auto-fill emitter/topic for the
              Somnia precompile; external events use emitter + topic presets or custom hex.
            </li>
            <li>
              <strong className="text-slate-300">Add alert</strong> — watch an emitter/topic; if the first
              32-byte word in log data is ≥ your minimum, it can run a workflow (with cooldown).
            </li>
            <li>
              <strong className="text-slate-300">Send test signals</strong> — calls the mock emitter twice
              (<span className="font-mono text-slate-500">HealthSignal</span>, then{' '}
              <span className="font-mono text-slate-500">MetricSignal</span>). Requires wallet + correct
              mock emitter address.
            </li>
            <li>
              <strong className="text-slate-300">Advanced · manual run</strong> —{' '}
              <span className="font-mono text-slate-500">runJobManually(jobId)</span> on the handler. Only
              the <strong className="text-slate-300">job creator</strong> or{' '}
              <strong className="text-slate-300">handler owner</strong> may call it; bypasses reactive
              delivery for testing.
            </li>
          </ul>
        </Section>

        <Section title="Run timeline chart">
          <p>
            Visualizes recent orchestrator runs (success vs failed) for a quick health check. Data comes
            from the same refresh as the tables.
          </p>
        </Section>

        <Section title="Jobs table">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>Filter with the search box (matches name, id, emitter, topic, creator).</li>
            <li>
              <strong className="text-slate-300">Pause / Activate</strong> — toggles{' '}
              <span className="font-mono text-slate-500">setJobActive</span>.
            </li>
            <li>
              <strong className="text-slate-300">Edit</strong> — opens the job drawer with current values.
            </li>
          </ul>
        </Section>

        <Section title="Alerts table">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>Same pattern: filter, pause/activate, edit threshold / workflow / cooldown.</li>
          </ul>
        </Section>

        <Section title="Workflows table">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="text-slate-300">New workflow</strong> — same as the sidebar button (custom
              workflow drawer).
            </li>
            <li>
              <strong className="text-slate-300">Pause / Activate</strong> — workflow must be active for the
              orchestrator to execute it.
            </li>
            <li>
              <strong className="text-slate-300">Steps</strong> — read-only list of targets and labels for
              that workflow ID.
            </li>
          </ul>
        </Section>

        <Section title="Recent runs table">
          <p>
            Last orchestrator executions: run id, workflow id, success/fail, failed step index, timestamp.
          </p>
        </Section>

        <Section title="Drawers (forms)">
          <p className="mb-2">
            Submitting a form sends a transaction; the UI refreshes after confirmation. Errors appear in the
            toast at the bottom.
          </p>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="text-slate-300">Create workflow</strong> — add/remove steps; validate
              addresses and calldata hex before submit.
            </li>
            <li>
              <strong className="text-slate-300">Add / Edit job</strong> — cooldown and trigger value apply
              per trigger type (see inline hints in the form).
            </li>
            <li>
              <strong className="text-slate-300">Add / Edit alert</strong> — topic presets mirror jobs;
              minimum value applies to the first uint256 in event data.
            </li>
          </ul>
        </Section>

        <Section title="If jobs do not fire (events, block tick, schedule)">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="text-slate-300">Subscriptions</strong> must exist for the kind of signal you
              expect: mock-emitter logs, and (on testnet) system subs for{' '}
              <span className="font-mono text-slate-500">BlockTick</span>,{' '}
              <span className="font-mono text-slate-500">EpochTick</span>, and a one-off{' '}
              <span className="font-mono text-slate-500">Schedule</span>. Run{' '}
              <span className="font-mono text-slate-500">contracts:setup-subscriptions</span> after deploy; the
              summary JSON lists each setup tx. Registry jobs alone are not enough.
            </li>
            <li>
              Confirm <strong className="text-slate-300">Handler runs</strong> increases when something should
              trigger — if it stays flat, the handler is not receiving precompile callbacks.
            </li>
            <li>
              Job must be <strong className="text-slate-300">active</strong>, trigger type and emitter/topic
              must match the log, and <strong className="text-slate-300">cooldown</strong> must have elapsed.
            </li>
            <li>
              <strong className="text-slate-300">Schedule</strong> jobs with a specific trigger value must match
              the exact scheduled timestamp (ms) used when the subscription was created; one-off schedules fire
              once.
            </li>
            <li>
              The orchestrator must be able to <strong className="text-slate-300">execute</strong> the workflow
              (handler authorized as executor, workflow active, steps valid).
            </li>
          </ul>
        </Section>
      </div>
    </Drawer>
  )
}
