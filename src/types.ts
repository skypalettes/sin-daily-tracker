// ============================================================
// Sin Types
// ============================================================

export type CycleType = "daily" | "weekly" | "monthly" | "custom";

export type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

// ------------------------------------------------------------
// Habit
// ------------------------------------------------------------

export interface Habit {
  /** File path within the vault (e.g. Sin/habits/morning-run.md) */
  filePath: string;
  name: string;
  icon: string;
  color: string;
  cycle: CycleType;
  /** Used when cycle === "weekly" */
  days?: WeekDay[];
  /** Used when cycle === "monthly" */
  dates?: number[];
  /** Used when cycle === "custom" */
  interval?: number;
  created: string; // YYYY-MM-DD
  archived: boolean;
}

/** A habit enriched with today's completion state */
export interface TodayHabit {
  habit: Habit;
  completed: boolean;
  streak: number;
}

// ------------------------------------------------------------
// Schedule
// ------------------------------------------------------------

export interface Schedule {
  /** File path within the vault */
  filePath: string;
  name: string;
  icon: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM, omitted when allDay
  allDay: boolean;
  done: boolean;
  memo?: string;
}

// ------------------------------------------------------------
// Log
// ------------------------------------------------------------

export interface LogEntry {
  date: string; // YYYY-MM-DD
  habitName: string;
  habitIcon: string;
  completed: boolean;
}

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

export interface SinSettings {
  sinFolder: string;
  weekStartDay: number; // 0=Sun, 1=Mon, ..., 6=Sat
  showIntroAnimation: boolean;
  showNotifications: boolean;
  showStreaks: boolean;
  upcomingDays: number;
  waveAnimationEnabled: boolean;
  /** Allow toggling habits on future dates (default: false) */
  allowFutureHabitToggle: boolean;
  /** Auto-rename habit/schedule files when their name changes (default: true) */
  autoRenameFiles: boolean;
}
