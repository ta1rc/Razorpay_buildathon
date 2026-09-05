export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-32 items-end gap-3">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-24 w-full items-end">
            <div
              className="w-full rounded-t-md bg-[var(--accent)]"
              style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }}
              title={String(d.value)}
            />
          </div>
          <div className="text-[10px] text-[var(--text-tertiary)]">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
