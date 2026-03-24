import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'

type CopyableAddressProps = {
  label: string
  description?: string
  address: string | undefined
}

export function CopyableAddress({ label, description, address }: CopyableAddressProps) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [address])

  if (!address) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-300">{label}</p>
          {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          <p className="mt-1 break-all font-mono text-xs text-slate-200">{address}</p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-md border border-slate-600 p-1.5 text-slate-400 transition hover:border-slate-500 hover:bg-slate-800 hover:text-slate-200"
          aria-label={`Copy ${label} address`}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
