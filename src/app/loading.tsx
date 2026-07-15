import { BrandLogo } from '@/components/brand/brand-logo'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="app-shell min-h-screen">
      <header className="app-sticky-glass">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 sm:px-5">
          <BrandLogo />
          <div className="flex items-center gap-1" aria-hidden="true">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="size-11 rounded-full" />
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto grid max-w-6xl gap-6 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(19rem,0.9fr)_minmax(0,1.4fr)] lg:items-start lg:gap-8 lg:py-8"
      >
        <p className="sr-only" aria-live="polite">
          読み込み中…
        </p>

        <aside className="app-glass-heavy rounded-[28px] p-5 lg:sticky lg:top-20">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-11 w-48" />
          <Skeleton className="mt-3 h-4 w-56" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="app-solid-panel rounded-2xl p-4">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="mt-2 h-6 w-24" />
            </div>
            <div className="app-solid-panel rounded-2xl p-4">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="mt-2 h-6 w-24" />
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {Array.from({ length: 3 }, (_, sectionIndex) => (
            <section
              key={sectionIndex}
              className="app-solid-panel overflow-hidden rounded-[24px] px-4 sm:px-5"
              aria-hidden="true"
            >
              <div className="flex min-h-14 items-center justify-between border-b border-border">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              {Array.from({ length: 2 }, (_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-3 border-b border-border last:border-b-0"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
