type Tone = "success" | "warning" | "danger" | "neutral" | "accent";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  neutral: "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
};

export function StatusChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function verificationTone(level: string): Tone {
  if (level === "VERIFIED") return "success";
  if (level === "INFERRED") return "warning";
  return "danger";
}

export function freshnessTone(state: string): Tone {
  if (state === "FRESH") return "success";
  if (state === "STALE") return "warning";
  return "danger";
}

export function orderStatusTone(status: string): Tone {
  if (status === "PAID") return "success";
  if (status === "FAILED") return "danger";
  return "warning";
}
