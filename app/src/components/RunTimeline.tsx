import { StatusBadge } from './StatusBadge'

export type TimelineRun = {
  id: bigint
  workflowId: bigint
  success: boolean
  failedStepIndex: bigint
  executedAt: bigint
}

type RunTimelineProps = {
  runs: TimelineRun[]
  formatTime: (unix: bigint) => string
}

export function RunTimeline({ runs, formatTime }: RunTimelineProps) {
  const ordered = [...runs]
    .sort((a, b) => (a.id === b.id ? 0 : a.id > b.id ? -1 : 1))
    .slice(0, 18)

  if (ordered.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">No runs to show yet.</p>
    )
  }

  return (
    <ol className="relative ml-2 space-y-5 border-l border-slate-700 py-2 pl-8">
      {ordered.map((run) => (
        <li key={run.id.toString()} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-slate-950" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-200">Run #{run.id.toString()}</span>
            <span className="text-xs text-slate-500">
              workflow {run.workflowId.toString()}
            </span>
            <StatusBadge
              status={run.success ? 'success' : 'failed'}
              text={run.success ? 'success' : 'failed'}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">{formatTime(run.executedAt)}</p>
        </li>
      ))}
    </ol>
  )
}
