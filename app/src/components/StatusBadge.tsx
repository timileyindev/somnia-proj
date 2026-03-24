import clsx from 'clsx'

type StatusBadgeProps = {
  status: 'active' | 'inactive' | 'success' | 'failed'
  text?: string
}

const styleByStatus = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  inactive: 'bg-slate-700/40 text-slate-300 border-slate-600',
  success: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  failed: 'bg-red-500/20 text-red-300 border-red-500/30',
} as const

export function StatusBadge({ status, text }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        styleByStatus[status],
      )}
    >
      {text ?? status}
    </span>
  )
}
