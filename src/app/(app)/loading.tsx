export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Loading" role="status">
      <div className="h-8 w-56 rounded bg-slate-200/70" />
      <div className="h-4 w-96 max-w-full rounded bg-slate-200/60" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 rounded-[var(--radius)] border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-72 rounded-[var(--radius)] border border-slate-200 bg-white" />
    </div>
  );
}
