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
  allowFutureHabitToggle: false,
  autoRenameFiles: true,
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
  { amplitude: 60, frequency: 0.008, speed: 0.003, opacity: 0.10, offset: 0 },
  { amplitude: 40, frequency: 0.015, speed: 0.006, opacity: 0.15, offset: 2 },
  { amplitude: 20, frequency: 0.025, speed: 0.010, opacity: 0.25, offset: 5 },
];

/** Preset emojis for habit icons */
export const HABIT_EMOJIS = [
  "📌", "🏃", "📚", "💪", "🧘", "🍎", "💊", "🌙",
  "⭐", "🎯", "💧", "🧹", "🎵", "📝", "🌿", "🏋️",
  "✏️", "🛌", "🚶", "🧠",
];

/** Preset emojis for schedule icons */
export const SCHEDULE_EMOJIS = [
  "📅", "🦷", "🏥", "🎂", "✈️", "💼", "🛒", "🎉",
  "📞", "🚗", "🏫", "🍽️", "👔", "🏃", "📝", "🎬",
  "🎓", "💰", "🏠", "💈",
];
