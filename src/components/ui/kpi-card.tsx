export function KpiCard({
  label,
  value,
  sublabel,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const valueColor =
    tone === "success" ? "text-[var(--success)]" : tone === "danger" ? "text-[var(--danger)]" : "text-[var(--text-primary)]";

  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">{label}</div>
      <div className={`tabular-nums mt-2 text-3xl font-semibold ${valueColor}`}>{value}</div>
      {sublabel && <div className="mt-1 text-xs text-[var(--text-tertiary)]">{sublabel}</div>}
    </div>
  );
}
