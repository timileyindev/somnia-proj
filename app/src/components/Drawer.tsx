import type { ReactNode } from 'react'

type DrawerProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Wider panel for long-form content (e.g. dashboard guide). */
  wide?: boolean
}

export function Drawer({ open, title, onClose, children, wide = false }: DrawerProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className={`relative z-10 flex h-full w-full flex-col border-l border-slate-800 bg-slate-950 shadow-2xl ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  )
}
