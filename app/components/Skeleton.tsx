export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-zinc-800/60 ${className}`} />
  )
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Skeleton className="h-8 w-36 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
          <Skeleton className="h-3 w-24 mb-4" />
          <Skeleton className="h-36 w-full" />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10">
          <Skeleton className="h-6 w-48 mx-auto mb-3" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
      </div>
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Skeleton className="h-7 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-zinc-800/60 last:border-0">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <Skeleton className="h-4 flex-1 max-w-[180px]" />
              <Skeleton className="h-4 w-20 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
