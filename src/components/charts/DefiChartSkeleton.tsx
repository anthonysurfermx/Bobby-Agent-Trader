export function DefiChartSkeleton() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 w-10 bg-muted rounded" />
          ))}
        </div>
      </div>
      <div className="h-[280px] bg-muted/30 rounded-lg" />
      <div className="flex justify-end mt-2">
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    </div>
  );
}
