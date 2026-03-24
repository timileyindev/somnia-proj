import { Monitor } from 'lucide-react'

/**
 * Full-screen prompt on viewports below Tailwind `lg` (1024px).
 * The dashboard tables and drawers are impractical on phones; we ask users to use a larger screen.
 *
 * We intentionally do **not** set `document.body.style.overflow = 'hidden'`. That pattern often makes
 * fixed overlays feel “frozen” or non-interactive on mobile Safari after the browser chrome settles,
 * because it fights the compositor’s touch/scroll routing.
 *
 * `touch-none` + `overscroll-none` help on devices where the dashboard tree is only `hidden` (not
 * unmounted). The dashboard is wrapped with `hidden lg:block` in `App.tsx` so nothing shows through.
 */
export function SmallScreenNotice() {
  return (
    <div
      className="fixed inset-0 z-[200] flex min-h-[100dvh] flex-col items-center justify-center gap-6 overscroll-none bg-slate-950 p-8 text-center touch-none lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="small-screen-title"
      aria-describedby="small-screen-desc"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
        <Monitor className="h-9 w-9" aria-hidden />
      </div>
      <div className="max-w-sm space-y-3">
        <h1
          id="small-screen-title"
          className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl"
        >
          Please use a larger screen
        </h1>
        <p id="small-screen-desc" className="text-sm leading-relaxed text-slate-400">
          This dashboard is built for wide layouts—tables, charts, and side panels need more space.
          Open it on a tablet in landscape, laptop, or desktop (about{' '}
          <span className="whitespace-nowrap text-slate-300">1024px</span> wide or more) for the full
          experience.
        </p>
      </div>
    </div>
  )
}
