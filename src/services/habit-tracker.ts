import { Habit, TodayHabit, LogEntry } from "../types";
import { isHabitScheduledOn } from "../models/habit";
import { SinFileManager } from "./file-manager";

// ---- Stats types -----------------------------------------

export interface HabitStat {
  habit: Habit;
  completed: number;
  scheduled: number;
  rate: number; // 0-100
}

export class HabitTracker {
  constructor(private fileManager: SinFileManager) {}

  // ---- Today's habits --------------------------------------

  async getTodayHabits(today: Date = new Date()): Promise<TodayHabit[]> {
    const habits = await this.fileManager.readHabits();
    const todayStr = dateString(today);
    const month = todayStr.slice(0, 7);

    const logs = await this.fileManager.readLog(month);
    const todayLogs = logs.filter((l) => l.date === todayStr);

    const result: TodayHabit[] = [];

    for (const habit of habits) {
      if (!isHabitScheduledOn(habit, today)) continue;

      const logEntry = todayLogs.find((l) => l.habitName === habit.name);
      const completed = logEntry?.completed ?? false;
      const streak = await this.getStreak(habit, logs, today);

      result.push({ habit, completed, streak });
    }

    return result;
  }

  // ---- Toggle completion -----------------------------------

  async toggleCompletion(
    habit: Habit,
    date: Date = new Date()
  ): Promise<boolean> {
    const dateStr = dateString(date);
    const month = dateStr.slice(0, 7);

    let logs = await this.fileManager.readLog(month);
    const todayLogs = logs.filter((l) => l.date === dateStr);

    const existing = todayLogs.find((l) => l.habitName === habit.name);
    const newCompleted = !(existing?.completed ?? false);

    // Build updated entries for today
    const allHabits = await this.fileManager.readHabits();
    const todayHabits = allHabits.filter((h) => isHabitScheduledOn(h, date));

    const updatedEntries: LogEntry[] = todayHabits.map((h) => {
      if (h.name === habit.name) {
        return { date: dateStr, habitName: h.name, habitIcon: h.icon, completed: newCompleted };
      }
      const prev = todayLogs.find((l) => l.habitName === h.name);
      return {
        date: dateStr,
        habitName: h.name,
        habitIcon: h.icon,
        completed: prev?.completed ?? false,
      };
    });

    await this.fileManager.writeLog(dateStr, updatedEntries);
    return newCompleted;
  }

  // ---- Streak calculation ----------------------------------

  async getStreak(
    habit: Habit,
    logs?: LogEntry[],
    today: Date = new Date()
  ): Promise<number> {
    // Collect the last 365 days worth of logs
    const allLogs = logs ?? (await this.collectRecentLogs(today, 90));

    let streak = 0;
    const cursor = new Date(today);
    cursor.setHours(0, 0, 0, 0);

    // Walk backwards day by day
    for (let i = 0; i < 365; i++) {
      const dayStr = dateString(cursor);

      if (!isHabitScheduledOn(habit, cursor)) {
        // Skip non-scheduled days without breaking the streak
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }

      const logEntry = allLogs.find(
        (l) => l.date === dayStr && l.habitName === habit.name
      );

      if (logEntry?.completed) {
        streak++;
      } else if (i === 0) {
        // Today not yet completed → streak from yesterday
      } else {
        break;
      }

      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  // ---- Weekly / Monthly stats (Phase 3) -------------------

  /**
   * Returns completion stats for all active habits over the 7-day week
   * starting at weekStart.
   */
  async getWeeklyStats(weekStart: Date): Promise<HabitStat[]> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return this.getStatsForRange(weekStart, weekEnd);
  }

  /**
   * Returns completion stats for all active habits over the given calendar month.
   */
  async getMonthlyStats(year: number, month: number): Promise<HabitStat[]> {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0); // last day of month
    return this.getStatsForRange(from, to);
  }

  private async getStatsForRange(from: Date, to: Date): Promise<HabitStat[]> {
    const habits = await this.fileManager.readHabits();
    const active = habits.filter((h) => !h.archived);

    // Collect distinct months in range and load their logs in parallel
    const months = new Set<string>();
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cur <= end) {
      months.add(dateString(cur).slice(0, 7));
      cur.setDate(cur.getDate() + 1);
    }

    const logArrays = await Promise.all([...months].map((m) => this.fileManager.readLog(m)));
    const allLogs: LogEntry[] = logArrays.flat();

    const results: HabitStat[] = [];

    for (const habit of active) {
      let scheduled = 0;
      let completed = 0;
      const c = new Date(from);
      c.setHours(0, 0, 0, 0);
      const e = new Date(to);
      e.setHours(0, 0, 0, 0);
      while (c <= e) {
        if (isHabitScheduledOn(habit, c)) {
          scheduled++;
          const dayStr = dateString(c);
          const log = allLogs.find(
            (l) => l.date === dayStr && l.habitName === habit.name
          );
          if (log?.completed) completed++;
        }
        c.setDate(c.getDate() + 1);
      }
      if (scheduled === 0) continue;
      const rate = Math.round((completed / scheduled) * 100);
      results.push({ habit, completed, scheduled, rate });
    }

    return results;
  }

  // ---- Auto-generate today's log (Phase 2) -----------------

  /**
   * Ensures a log entry exists for every habit scheduled today.
   * Called when Wave View opens so the log file reflects the day's
   * habits even if the user never taps a checkbox.
   * Safe to call multiple times — skips when entries already exist.
   */
  async ensureTodayLog(today: Date = new Date()): Promise<void> {
    const dateStr = dateString(today);
    const month = dateStr.slice(0, 7);

    // If any log entry already exists for today, nothing to do.
    const existing = await this.fileManager.readLog(month);
    if (existing.some((l) => l.date === dateStr)) return;

    const allHabits = await this.fileManager.readHabits();
    const todayHabits = allHabits.filter((h) => isHabitScheduledOn(h, today));
    if (todayHabits.length === 0) return;

    const entries: LogEntry[] = todayHabits.map((h) => ({
      date: dateStr,
      habitName: h.name,
      habitIcon: h.icon,
      completed: false,
    }));

    await this.fileManager.writeLog(dateStr, entries);
  }

  // ---- Private helpers -------------------------------------

  private async collectRecentLogs(today: Date, days: number): Promise<LogEntry[]> {
    const months = new Set<string>();
    const cursor = new Date(today);
    for (let i = 0; i < days; i++) {
      months.add(dateString(cursor).slice(0, 7));
      cursor.setDate(cursor.getDate() - 1);
    }

    const all: LogEntry[] = [];
    for (const month of months) {
      const entries = await this.fileManager.readLog(month);
      all.push(...entries);
    }
    return all;
  }
}

function dateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
