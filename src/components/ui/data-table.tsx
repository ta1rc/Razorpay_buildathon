export interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right";
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  keyFor,
  emptyMessage = "Nothing here yet.",
}: {
  columns: Column<T>[];
  rows: T[];
  keyFor: (row: T) => string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-tertiary)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--surface-border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--surface-border)]">
            {columns.map((c) => (
              <th
                key={c.header}
                style={c.width ? { width: c.width } : undefined}
                className={`px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)] ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={keyFor(row)} className="border-b border-[var(--surface-border)] last:border-0 hover:bg-[var(--surface-muted)]">
              {columns.map((c) => (
                <td key={c.header} className={`px-4 py-3 ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
