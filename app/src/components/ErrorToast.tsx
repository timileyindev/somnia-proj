import { AlertTriangle, X } from 'lucide-react'

type ErrorToastProps = {
  message: string | null
  onDismiss: () => void
}

/**
 * Fixed-position error so users see failures while scrolled or in side panels.
 * z-index above Drawer (z-50).
 */
export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  if (!message) {
    return null
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4 pt-2 sm:pb-6"
      role="alert"
      aria-live="assertive"
      aria-relevant="additions text"
    >
      <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-2 rounded-xl border border-red-500/40 bg-red-950/95 px-4 py-3 text-sm text-red-100 shadow-2xl shadow-black/50 ring-1 ring-red-500/20 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
          <div className="min-w-0 flex-1 max-h-[min(40vh,16rem)] overflow-y-auto pr-1 text-red-100/95">
            {message}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-red-300/90 transition hover:bg-red-900/80 hover:text-white"
            aria-label="Dismiss error"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
