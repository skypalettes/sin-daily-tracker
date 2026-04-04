import { SinSettings } from "./types";

export const SIN_VIEW_TYPE = "sin-wave-view";

export const DEFAULT_SETTINGS: SinSettings = {
  sinFolder: "Sin",
  weekStartDay: 1, // Monday
  showIntroAnimation: true,
  showNotifications: true,
  showStreaks: true,
  upcomingDays: 14,
  waveAnimationEnabled: true,
};

export const HABITS_FOLDER = "habits";
export const SCHEDULES_FOLDER = "schedules";
export const LOGS_FOLDER = "logs";

export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const WEEK_DAY_LABELS: Record<string, string> = {
  mon: "月",
  tue: "火",
  wed: "水",
  thu: "木",
  fri: "金",
  sat: "土",
  sun: "日",
};

export const MONTH_DATES = Array.from({ length: 31 }, (_, i) => i + 1);

/** Icon used in the Obsidian ribbon */
export const SIN_RIBBON_ICON = "activity";

/** Wave animation layers */
export const WAVE_LAYERS = [
  { amplitude: 40, frequency: 0.02, speed: 0.015, opacity: 0.06 },
  { amplitude: 25, frequency: 0.03, speed: 0.020, opacity: 0.04 },
  { amplitude: 15, frequency: 0.05, speed: 0.025, opacity: 0.03 },
];
