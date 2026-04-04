import { Schedule } from "../types";

// ------------------------------------------------------------
// Frontmatter parsing
// ------------------------------------------------------------

export function parseScheduleFrontmatter(
  filePath: string,
  fm: Record<string, unknown>,
  body = ""
): Schedule | null {
  if (fm["sin"] !== "schedule") return null;

  const name = String(fm["name"] ?? "").trim();
  if (!name) return null;

  const date = String(fm["date"] ?? "").trim();
  if (!date) return null;

  const schedule: Schedule = {
    filePath,
    name,
    icon: String(fm["icon"] ?? "📅"),
    date,
    allDay: Boolean(fm["allDay"] ?? true),
    done: Boolean(fm["done"] ?? false),
  };

  const time = fm["time"];
  if (typeof time === "string" && time.trim()) {
    schedule.time = time.trim();
    schedule.allDay = false;
  }

  const memo = body.replace(/^#[^\n]*\n?/m, "").trim();
  if (memo) schedule.memo = memo;

  return schedule;
}

/** Serialize a Schedule into a frontmatter YAML block + body. */
export function serializeSchedule(schedule: Schedule): string {
  const lines: string[] = [
    "---",
    `sin: schedule`,
    `name: ${schedule.name}`,
    `icon: ${schedule.icon}`,
    `date: ${schedule.date}`,
  ];

  if (!schedule.allDay && schedule.time) {
    lines.push(`time: "${schedule.time}"`);
  }

  lines.push(`allDay: ${schedule.allDay}`);
  lines.push(`done: ${schedule.done}`);
  lines.push("---");

  const header = `# ${schedule.name}`;
  const memo = schedule.memo?.trim() ?? "";
  return [lines.join("\n"), header, memo].filter(Boolean).join("\n\n") + "\n";
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Generate a slug from a schedule name for use in file names. */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 40)
    || "schedule";
}

/** Compare schedules by date then time for sorting. */
export function compareSchedules(a: Schedule, b: Schedule): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time ?? "00:00";
  const tb = b.time ?? "00:00";
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}
