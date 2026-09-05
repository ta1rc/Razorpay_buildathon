export interface TimelineEntry {
  at: string;
  stage: string;
  detail: string;
}

export function appendTimeline(existingJson: string, stage: string, detail: string): string {
  const entries: TimelineEntry[] = JSON.parse(existingJson || "[]");
  entries.push({ at: new Date().toISOString(), stage, detail });
  return JSON.stringify(entries);
}
