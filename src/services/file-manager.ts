import { App, TFile, normalizePath } from "obsidian";
import { Habit, Schedule, LogEntry, SinSettings } from "../types";
import { parseHabitFrontmatter, serializeHabit } from "../models/habit";
import { parseScheduleFrontmatter, serializeSchedule } from "../models/schedule";
import { toSafeFileName } from "../models/filename";
import { HABITS_FOLDER, SCHEDULES_FOLDER, LOGS_FOLDER } from "../constants";

// ------------------------------------------------------------
// Simple YAML frontmatter parser (Obsidian doesn't expose
// parseFrontMatter for arbitrary strings, so we roll our own.)
// ------------------------------------------------------------

function parseFrontmatter(content: string): {
  fm: Record<string, unknown>;
  body: string;
} {
  const fm: Record<string, unknown> = {};
  let body = content;

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fm, body };

  body = match[2] ?? "";

  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();

    // Array value: [a, b, c]
    if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      const inner = rawVal.slice(1, -1).trim();
      fm[key] = inner
        ? inner.split(",").map((s) => {
            const t = s.trim();
            const n = Number(t);
            return isNaN(n) ? t : n;
          })
        : [];
      continue;
    }

    // Boolean
    if (rawVal === "true") { fm[key] = true; continue; }
    if (rawVal === "false") { fm[key] = false; continue; }

    // Quoted string
    if (
      (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
      (rawVal.startsWith("'") && rawVal.endsWith("'"))
    ) {
      fm[key] = rawVal.slice(1, -1);
      continue;
    }

    // Number
    const n = Number(rawVal);
    if (!isNaN(n) && rawVal !== "") { fm[key] = n; continue; }

    fm[key] = rawVal;
  }

  return { fm, body };
}

// ------------------------------------------------------------
// SinFileManager
// ------------------------------------------------------------

export class SinFileManager {
  private app: App;
  private settings: SinSettings;

  constructor(app: App, settings: SinSettings) {
    this.app = app;
    this.settings = settings;
  }

  // ---- Folder paths ----------------------------------------

  private habitsFolder(): string {
    return normalizePath(`${this.settings.sinFolder}/${HABITS_FOLDER}`);
  }

  private schedulesFolder(): string {
    return normalizePath(`${this.settings.sinFolder}/${SCHEDULES_FOLDER}`);
  }

  private logsFolder(): string {
    return normalizePath(`${this.settings.sinFolder}/${LOGS_FOLDER}`);
  }

  // ---- Ensure folders exist --------------------------------

  async ensureFolders(): Promise<void> {
    for (const folder of [
      this.settings.sinFolder,
      this.habitsFolder(),
      this.schedulesFolder(),
      this.logsFolder(),
    ]) {
      if (!this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
    }
  }

  // ---- Habits ----------------------------------------------

  async readHabits(): Promise<Habit[]> {
    const habits: Habit[] = [];
    const folder = this.app.vault.getAbstractFileByPath(this.habitsFolder());
    if (!folder) return habits;

    // @ts-ignore - folder.children exists on TFolder
    const files: TFile[] = (folder as any).children?.filter(
      (f: any) => f instanceof TFile && f.extension === "md"
    ) ?? [];

    for (const file of files) {
      const content = await this.app.vault.read(file);
      const { fm } = parseFrontmatter(content);
      const habit = parseHabitFrontmatter(file.path, fm);
      if (habit) habits.push(habit);
    }

    return habits;
  }

  async writeHabit(habit: Habit, body?: string): Promise<void> {
    await this.ensureFolders();

    let bodyContent = body ?? "";

    // When no explicit body is provided and the file already exists,
    // preserve whatever the user wrote below the frontmatter.
    if (body === undefined) {
      const existingFile = this.app.vault.getAbstractFileByPath(habit.filePath);
      if (existingFile instanceof TFile) {
        const existing = await this.app.vault.read(existingFile);
        const { body: parsedBody } = parseFrontmatter(existing);
        // Strip the auto-generated H1 heading (serializeHabit re-adds it)
        bodyContent = parsedBody.replace(/^#[^\n]*\n?/, "").trim();
      }
    }

    // Auto-rename: if the name changed, move the file to match the new name.
    if (this.settings.autoRenameFiles) {
      habit.filePath = await this.ensureHabitPath(habit);
    }

    const content = serializeHabit(habit, bodyContent);

    const existingFile = this.app.vault.getAbstractFileByPath(habit.filePath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(habit.filePath, content);
    }
  }

  /**
   * Return the canonical path for a habit (based on its current name).
   * If the file already lives at a different path, rename it and return
   * the new path.
   */
  private async ensureHabitPath(habit: Habit): Promise<string> {
    const safe = toSafeFileName(habit.name, "habit");
    const desiredPath = this.uniquePathExcluding(
      this.habitsFolder(), safe, habit.filePath
    );

    if (habit.filePath === desiredPath) return habit.filePath;

    const currentFile = this.app.vault.getAbstractFileByPath(habit.filePath);
    if (currentFile instanceof TFile) {
      await this.app.vault.rename(currentFile, desiredPath);
    }
    return desiredPath;
  }

  async deleteHabit(habit: Habit): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(habit.filePath);
    if (file instanceof TFile) {
      await this.app.vault.trash(file, true);
    }
  }

  /** Generate a unique file path for a new habit. */
  newHabitPath(name: string): string {
    const safe = toSafeFileName(name, "habit");
    return this.uniquePath(this.habitsFolder(), safe);
  }

  // ---- Schedules -------------------------------------------

  async readSchedules(afterDate?: string, beforeDate?: string): Promise<Schedule[]> {
    const schedules: Schedule[] = [];
    const folder = this.app.vault.getAbstractFileByPath(this.schedulesFolder());
    if (!folder) return schedules;

    // @ts-ignore
    const files: TFile[] = (folder as any).children?.filter(
      (f: any) => f instanceof TFile && f.extension === "md"
    ) ?? [];

    for (const file of files) {
      const content = await this.app.vault.read(file);
      const { fm, body } = parseFrontmatter(content);
      const schedule = parseScheduleFrontmatter(file.path, fm, body);
      if (!schedule) continue;
      if (afterDate && schedule.date < afterDate) continue;
      if (beforeDate && schedule.date > beforeDate) continue;
      schedules.push(schedule);
    }

    return schedules;
  }

  async writeSchedule(schedule: Schedule): Promise<void> {
    await this.ensureFolders();

    // Auto-rename: if name or date changed, move the file to match.
    if (this.settings.autoRenameFiles) {
      schedule.filePath = await this.ensureSchedulePath(schedule);
    }

    const content = serializeSchedule(schedule);

    const existingFile = this.app.vault.getAbstractFileByPath(schedule.filePath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(schedule.filePath, content);
    }
  }

  /**
   * Return the canonical path for a schedule (date_name).
   * Renames the file if it currently lives elsewhere.
   */
  private async ensureSchedulePath(schedule: Schedule): Promise<string> {
    const safe = toSafeFileName(schedule.name, "schedule");
    const desiredPath = this.uniquePathExcluding(
      this.schedulesFolder(),
      `${schedule.date}_${safe}`,
      schedule.filePath
    );

    if (schedule.filePath === desiredPath) return schedule.filePath;

    const currentFile = this.app.vault.getAbstractFileByPath(schedule.filePath);
    if (currentFile instanceof TFile) {
      await this.app.vault.rename(currentFile, desiredPath);
    }
    return desiredPath;
  }

  async deleteSchedule(schedule: Schedule): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(schedule.filePath);
    if (file instanceof TFile) {
      await this.app.vault.trash(file, true);
    }
  }

  /** Generate a unique file path for a new schedule. */
  newSchedulePath(date: string, name: string): string {
    const safe = toSafeFileName(name, "schedule");
    return this.uniquePath(this.schedulesFolder(), `${date}_${safe}`);
  }

  // ---- Internal helpers ------------------------------------

  /**
   * Return a unique `.md` path inside `folder` for the given `base` stem,
   * appending " (2)", " (3)" … when the file already exists.
   */
  private uniquePath(folder: string, base: string): string {
    return this.uniquePathExcluding(folder, base, "");
  }

  /**
   * Like `uniquePath` but treats `excludePath` as available (used when
   * the file being renamed already occupies a slot).
   */
  private uniquePathExcluding(
    folder: string,
    base: string,
    excludePath: string
  ): string {
    const first = normalizePath(`${folder}/${base}.md`);
    const existing = this.app.vault.getAbstractFileByPath(first);
    if (!existing || normalizePath(first) === normalizePath(excludePath)) {
      return first;
    }

    for (let n = 2; n < 9999; n++) {
      const candidate = normalizePath(`${folder}/${base} (${n}).md`);
      const c = this.app.vault.getAbstractFileByPath(candidate);
      if (!c || normalizePath(candidate) === normalizePath(excludePath)) {
        return candidate;
      }
    }
    return first;
  }

  // ---- Bulk rename -----------------------------------------

  /**
   * Rename all habit/schedule files to match the current naming convention
   * (toSafeFileName). Returns a count of files that were moved.
   */
  async bulkRenameFiles(): Promise<{ habits: number; schedules: number }> {
    let habits = 0;
    let schedules = 0;

    const allHabits = await this.readHabits();
    for (const habit of allHabits) {
      const newPath = await this.ensureHabitPath(habit);
      if (newPath !== habit.filePath) habits++;
    }

    const allSchedules = await this.readSchedules();
    for (const schedule of allSchedules) {
      const newPath = await this.ensureSchedulePath(schedule);
      if (newPath !== schedule.filePath) schedules++;
    }

    return { habits, schedules };
  }

  // ---- Logs ------------------------------------------------

  private logPath(month: string): string {
    return normalizePath(`${this.logsFolder()}/${month}.md`);
  }

  async readLog(month: string): Promise<LogEntry[]> {
    const path = this.logPath(month);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];

    const content = await this.app.vault.read(file);
    return parseLogContent(content);
  }

  async writeLog(date: string, entries: LogEntry[]): Promise<void> {
    await this.ensureFolders();
    const month = date.slice(0, 7); // YYYY-MM
    const path = this.logPath(month);

    // Read existing log
    const existingFile = this.app.vault.getAbstractFileByPath(path);
    let existingContent = "";
    if (existingFile instanceof TFile) {
      existingContent = await this.app.vault.read(existingFile);
    }

    const updatedContent = upsertLogEntries(existingContent, date, entries, month);

    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, updatedContent);
    } else {
      await this.app.vault.create(path, updatedContent);
    }
  }
}

// ------------------------------------------------------------
// Log parsing / serialisation
// ------------------------------------------------------------

function parseLogContent(content: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = content.split("\n");
  let currentDate = "";

  for (const line of lines) {
    // Date header: ## YYYY-MM-DD
    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    // Checklist item: - [x] icon name  or  - [ ] icon name
    const itemMatch = line.match(/^- \[( |x)\] (.+)/);
    if (itemMatch && currentDate) {
      const completed = itemMatch[1] === "x";
      const rest = itemMatch[2].trim();
      // Extract icon (first "word" which may be an emoji) and name
      const parts = rest.split(" ");
      const icon = parts[0] ?? "";
      const habitName = parts.slice(1).join(" ").trim();
      entries.push({ date: currentDate, habitName, habitIcon: icon, completed });
    }
  }

  return entries;
}

function upsertLogEntries(
  existingContent: string,
  date: string,
  entries: LogEntry[],
  month: string
): string {
  // Build the new section for this date
  const newSection = buildDateSection(date, entries);

  if (!existingContent.trim()) {
    // Brand new file
    const header = `---\nsin: log\nmonth: ${month}\n---\n\n# ${month} 達成ログ\n`;
    return header + "\n" + newSection;
  }

  // Check if date section already exists
  const dateHeader = `## ${date}`;
  const datePattern = new RegExp(
    `(${escapeRegex(dateHeader)}\\n[\\s\\S]*?)(?=\\n## \\d{4}-\\d{2}-\\d{2}|$)`
  );

  if (datePattern.test(existingContent)) {
    // Replace existing section
    return existingContent.replace(datePattern, newSection);
  }

  // Prepend new section after the main heading
  const headingMatch = existingContent.match(/^(---[\s\S]*?---\n\n# [^\n]+\n)/);
  if (headingMatch) {
    return headingMatch[1] + "\n" + newSection + existingContent.slice(headingMatch[1].length);
  }

  return existingContent + "\n" + newSection;
}

function buildDateSection(date: string, entries: LogEntry[]): string {
  const lines = [`## ${date}`, ""];
  for (const e of entries) {
    const check = e.completed ? "x" : " ";
    lines.push(`- [${check}] ${e.habitIcon} ${e.habitName}`);
  }
  lines.push("");
  return lines.join("\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
