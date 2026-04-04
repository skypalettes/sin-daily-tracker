import { Habit, CycleType, WeekDay } from "../types";

// ------------------------------------------------------------
// Frontmatter parsing
// ------------------------------------------------------------

/**
 * Parse raw frontmatter object (from Obsidian's parseFrontMatter or
 * our own YAML parser) into a typed Habit.
 */
export function parseHabitFrontmatter(
  filePath: string,
  fm: Record<string, unknown>
): Habit | null {
  if (fm["sin"] !== "habit") return null;

  const name = String(fm["name"] ?? "").trim();
  if (!name) return null;

  const cycle = fm["cycle"] as CycleType;
  if (!["daily", "weekly", "monthly", "custom"].includes(cycle)) return null;

  const habit: Habit = {
    filePath,
    name,
    icon: String(fm["icon"] ?? "📌"),
    color: String(fm["color"] ?? "#4ECDC4"),
    cycle,
    created: String(fm["created"] ?? todayString()),
    archived: Boolean(fm["archived"] ?? false),
  };

  if (cycle === "weekly" && Array.isArray(fm["days"])) {
    habit.days = (fm["days"] as string[]).filter(Boolean) as WeekDay[];
  }
  if (cycle === "monthly" && Array.isArray(fm["dates"])) {
    habit.dates = (fm["dates"] as number[]).filter(
      (d) => typeof d === "number" && d >= 1 && d <= 31
    );
  }
  if (cycle === "custom" && typeof fm["interval"] === "number") {
    habit.interval = fm["interval"];
  }

  return habit;
}

/** Serialize a Habit into a frontmatter YAML block + body. */
export function serializeHabit(habit: Habit, body = ""): string {
  const lines: string[] = ["---", `sin: habit`, `name: ${habit.name}`];

  lines.push(`icon: ${habit.icon}`);
  lines.push(`color: "${habit.color}"`);
  lines.push(`cycle: ${habit.cycle}`);

  if (habit.cycle === "weekly" && habit.days) {
    lines.push(`days: [${habit.days.join(", ")}]`);
  }
  if (habit.cycle === "monthly" && habit.dates) {
    lines.push(`dates: [${habit.dates.join(", ")}]`);
  }
  if (habit.cycle === "custom" && habit.interval !== undefined) {
    lines.push(`interval: ${habit.interval}`);
  }

  lines.push(`created: ${habit.created}`);
  lines.push(`archived: ${habit.archived}`);
  lines.push("---");

  const header = `# ${habit.name}`;
  const content = body.trim() ? body.trim() : "";
  return [lines.join("\n"), header, content].filter(Boolean).join("\n\n") + "\n";
}

// ------------------------------------------------------------
// Business logic helpers
// ------------------------------------------------------------

/** Returns true if this habit is scheduled for the given date. */
export function isHabitScheduledOn(habit: Habit, date: Date): boolean {
  if (habit.archived) return false;

  switch (habit.cycle) {
    case "daily":
      return true;

    case "weekly": {
      const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const dayName = dayNames[date.getDay()];
      return (habit.days ?? []).includes(dayName as WeekDay);
    }

    case "monthly": {
      const dayOfMonth = date.getDate();
      return (habit.dates ?? []).includes(dayOfMonth);
    }

    case "custom": {
      if (!habit.interval || habit.interval <= 0) return false;
      const created = new Date(habit.created);
      created.setHours(0, 0, 0, 0);
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      const diffDays = Math.round(
        (target.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diffDays >= 0 && diffDays % habit.interval === 0;
    }
  }
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
