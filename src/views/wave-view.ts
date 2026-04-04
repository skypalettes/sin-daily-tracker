import { ItemView, WorkspaceLeaf, Notice, Menu } from "obsidian";
import { SIN_VIEW_TYPE, WAVE_LAYERS } from "../constants";
import { SinSettings, TodayHabit, Schedule } from "../types";
import { SinFileManager } from "../services/file-manager";
import { HabitTracker, HabitStat } from "../services/habit-tracker";
import { ScheduleManager } from "../services/schedule-manager";
import { HabitModal } from "../modals/habit-modal";
import { ScheduleModal } from "../modals/schedule-modal";
import { WaveIntro } from "./wave-intro";
import type SinPlugin from "../main";

const DAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

export class WaveView extends ItemView {
  private plugin: SinPlugin;
  private fileManager: SinFileManager;
  private habitTracker: HabitTracker;
  private scheduleManager: ScheduleManager;

  // Canvas wave animation
  private canvas: HTMLCanvasElement | null = null;
  private animFrameId: number | null = null;
  private waveOffset = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: SinPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.fileManager = plugin.fileManager;
    this.habitTracker = plugin.habitTracker;
    this.scheduleManager = plugin.scheduleManager;
  }

  getViewType(): string {
    return SIN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Sin";
  }

  getIcon(): string {
    return "activity";
  }

  // ----------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------

  async onOpen(): Promise<void> {
    await this.fileManager.ensureFolders();

    // Auto-generate today's log so habits appear even without a toggle
    try {
      await this.habitTracker.ensureTodayLog(new Date());
    } catch {
      // Non-fatal
    }

    await this.render();

    if (this.plugin.settings.showIntroAnimation) {
      const intro = new WaveIntro(this.contentEl);
      await intro.play();
    }
  }

  async onClose(): Promise<void> {
    this.stopWaveAnimation();
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  private async render(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("sin-wave-view");

    // Wave background canvas
    if (this.plugin.settings.waveAnimationEnabled) {
      this.canvas = this.contentEl.createEl("canvas", { cls: "sin-wave-canvas" });
      this.startWaveAnimation();
    }

    const content = this.contentEl.createDiv({ cls: "sin-content" });
    const today = new Date();

    // --- Performance: load all view data in parallel ---
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = getWeekStart(today, this.plugin.settings.weekStartDay);

    const [todayHabits, todaySchedules, upcomingSchedules] = await Promise.all([
      this.habitTracker.getTodayHabits(today).catch(() => [] as TodayHabit[]),
      this.scheduleManager.getTodaySchedules(today).catch(() => [] as Schedule[]),
      this.scheduleManager
        .getUpcoming(this.plugin.settings.upcomingDays, tomorrow)
        .catch(() => [] as Schedule[]),
    ]);

    // Today section
    await this.renderTodaySection(content, today, todayHabits, todaySchedules);

    // Upcoming section
    this.renderUpcomingSection(content, upcomingSchedules);

    // Summary section (weekly / monthly stats)
    this.renderSummarySection(content, today, weekStart);

    // Action buttons
    this.renderActionButtons(content);
  }

  // ----------------------------------------------------------
  // Today section
  // ----------------------------------------------------------

  private async renderTodaySection(
    parent: HTMLElement,
    today: Date,
    todayHabits: TodayHabit[],
    todaySchedules: Schedule[]
  ): Promise<void> {
    const section = parent.createDiv({ cls: "sin-section sin-today-section" });

    // Title
    const titleEl = section.createDiv({ cls: "sin-section-title" });
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const dow = DAY_JA[today.getDay()];
    titleEl.setText(`今日  ${y}/${m}/${d} (${dow})`);

    const grid = section.createDiv({ cls: "sin-today-grid" });

    const habitsCol = grid.createDiv({ cls: "sin-today-col" });
    this.renderHabitChecklist(habitsCol, today, todayHabits);

    const schedulesCol = grid.createDiv({ cls: "sin-today-col" });
    this.renderScheduleList(schedulesCol, todaySchedules);
  }

  // ---- Habit checklist -------------------------------------

  private renderHabitChecklist(
    parent: HTMLElement,
    today: Date,
    todayHabits: TodayHabit[]
  ): void {
    const wrapper = parent.createDiv({ cls: "sin-subsection" });
    wrapper.createDiv({ cls: "sin-subsection-title", text: "習慣" });

    if (todayHabits.length === 0) {
      wrapper.createDiv({ cls: "sin-empty", text: "今日の習慣はありません。" });
      return;
    }

    const list = wrapper.createDiv({ cls: "sin-habit-list" });

    for (const { habit, completed, streak } of todayHabits) {
      const item = list.createDiv({
        cls: `sin-habit-item${completed ? " sin-habit-item--done" : ""}`,
      });

      // Checkbox (click area: whole item minus the actions button)
      const checkbox = item.createDiv({ cls: "sin-checkbox" });
      if (completed) checkbox.createSpan({ text: "✓", cls: "sin-checkbox-check" });

      const info = item.createDiv({ cls: "sin-habit-info" });
      info.createSpan({ cls: "sin-habit-icon", text: habit.icon });
      info.createSpan({ cls: "sin-habit-name", text: habit.name });

      if (this.plugin.settings.showStreaks && streak > 0) {
        item.createDiv({ cls: "sin-streak", text: `🔥 ${streak}日連続` });
      }

      // ⋮ context menu button (edit / archive / delete)
      const actions = item.createDiv({ cls: "sin-habit-actions" });
      const menuBtn = actions.createEl("button", { cls: "sin-icon-btn", text: "⋮" });
      menuBtn.setAttribute("aria-label", "操作");
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = new Menu();
        menu.addItem((mi) =>
          mi
            .setTitle("編集")
            .setIcon("pencil")
            .onClick(() => {
              new HabitModal(this.app, this.plugin, habit, () => this.refresh()).open();
            })
        );
        menu.addItem((mi) =>
          mi
            .setTitle("アーカイブ")
            .setIcon("archive")
            .onClick(async () => {
              try {
                habit.archived = true;
                await this.fileManager.writeHabit(habit);
                new Notice(`習慣「${habit.name}」をアーカイブしました。`);
                await this.refresh();
              } catch {
                new Notice("アーカイブに失敗しました。");
              }
            })
        );
        menu.addItem((mi) =>
          mi
            .setTitle("削除")
            .setIcon("trash")
            .onClick(async () => {
              try {
                await this.fileManager.deleteHabit(habit);
                new Notice(`習慣「${habit.name}」を削除しました。`);
                await this.refresh();
              } catch {
                new Notice("削除に失敗しました。");
              }
            })
        );
        menu.showAtMouseEvent(e);
      });

      // Toggle completion on item click (excluding menu button)
      item.addEventListener("click", async () => {
        try {
          const nowCompleted = await this.habitTracker.toggleCompletion(habit, today);
          item.toggleClass("sin-habit-item--done", nowCompleted);
          if (nowCompleted) {
            checkbox.createSpan({ text: "✓", cls: "sin-checkbox-check" });
          } else {
            const check = checkbox.querySelector(".sin-checkbox-check");
            if (check instanceof HTMLElement) {
              check.addClass("sin-checkbox-check--exit");
              setTimeout(() => checkbox.empty(), 200);
            } else {
              checkbox.empty();
            }
          }
          this.ripple(item);
        } catch {
          new Notice("習慣の更新に失敗しました。");
        }
      });
    }
  }

  // ---- Schedule list (today) --------------------------------

  private renderScheduleList(parent: HTMLElement, schedules: Schedule[]): void {
    const wrapper = parent.createDiv({ cls: "sin-subsection" });
    wrapper.createDiv({ cls: "sin-subsection-title", text: "予定" });

    if (schedules.length === 0) {
      wrapper.createDiv({ cls: "sin-empty", text: "今日の予定はありません。" });
      return;
    }

    const list = wrapper.createDiv({ cls: "sin-schedule-list" });
    for (const schedule of schedules) {
      this.renderScheduleItem(list, schedule, true);
    }
  }

  private renderScheduleItem(
    parent: HTMLElement,
    schedule: Schedule,
    showDoneToggle: boolean
  ): HTMLElement {
    const item = parent.createDiv({
      cls: `sin-schedule-item${schedule.done ? " sin-schedule-item--done" : ""}`,
    });

    // Done toggle circle
    if (showDoneToggle) {
      const doneBtn = item.createEl("button", { cls: "sin-schedule-done-btn" });
      doneBtn.setAttribute("aria-label", schedule.done ? "未完了に戻す" : "完了にする");
      if (schedule.done) doneBtn.setText("✓");
      doneBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const nowDone = await this.scheduleManager.toggleDone(schedule);
          item.toggleClass("sin-schedule-item--done", nowDone);
          doneBtn.setText(nowDone ? "✓" : "");
          doneBtn.setAttribute("aria-label", nowDone ? "未完了に戻す" : "完了にする");
        } catch {
          new Notice("予定の更新に失敗しました。");
        }
      });
    }

    const timeEl = item.createSpan({ cls: "sin-schedule-time" });
    timeEl.setText(schedule.allDay ? "終日" : (schedule.time ?? ""));

    item.createSpan({ cls: "sin-schedule-icon", text: schedule.icon });
    item.createSpan({ cls: "sin-schedule-name", text: schedule.name });

    // Edit button
    const editBtn = item.createEl("button", { cls: "sin-icon-btn sin-schedule-edit-btn" });
    editBtn.setText("✎");
    editBtn.setAttribute("aria-label", "編集");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      new ScheduleModal(this.app, this.plugin, schedule, () => this.refresh()).open();
    });

    return item;
  }

  // ----------------------------------------------------------
  // Upcoming section
  // ----------------------------------------------------------

  private renderUpcomingSection(parent: HTMLElement, upcoming: Schedule[]): void {
    const section = parent.createDiv({ cls: "sin-section sin-upcoming-section" });
    section.createDiv({ cls: "sin-section-title", text: "今後の予定" });

    if (upcoming.length === 0) {
      section.createDiv({ cls: "sin-empty", text: "今後の予定はありません。" });
      return;
    }

    const list = section.createDiv({ cls: "sin-upcoming-list" });
    for (const schedule of upcoming) {
      const item = list.createDiv({ cls: "sin-upcoming-item" });

      item.createSpan({ cls: "sin-upcoming-date", text: formatUpcomingDate(schedule.date) });
      item.createSpan({ cls: "sin-upcoming-icon", text: schedule.icon });
      item.createSpan({ cls: "sin-upcoming-name", text: schedule.name });

      if (schedule.time) {
        item.createSpan({ cls: "sin-upcoming-time", text: schedule.time });
      }

      // Edit button
      const editBtn = item.createEl("button", { cls: "sin-icon-btn sin-upcoming-edit-btn" });
      editBtn.setText("✎");
      editBtn.setAttribute("aria-label", "編集");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        new ScheduleModal(this.app, this.plugin, schedule, () => this.refresh()).open();
      });
    }
  }

  // ----------------------------------------------------------
  // Summary section (Phase 3)
  // ----------------------------------------------------------

  private renderSummarySection(
    parent: HTMLElement,
    today: Date,
    weekStart: Date
  ): void {
    const section = parent.createDiv({ cls: "sin-section sin-summary-section" });

    const titleRow = section.createDiv({ cls: "sin-summary-title-row" });
    titleRow.createDiv({ cls: "sin-section-title", text: "サマリー" });

    // Tab buttons
    const tabBar = titleRow.createDiv({ cls: "sin-summary-tabs" });
    const weeklyBtn = tabBar.createEl("button", {
      cls: "sin-tab-btn sin-tab-btn--active",
      text: "週間",
    });
    const monthlyBtn = tabBar.createEl("button", {
      cls: "sin-tab-btn",
      text: "月間",
    });

    const statsContainer = section.createDiv({ cls: "sin-stats-container" });

    const renderWeekly = async () => {
      statsContainer.empty();
      weeklyBtn.addClass("sin-tab-btn--active");
      monthlyBtn.removeClass("sin-tab-btn--active");

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const range = `${formatShortDate(weekStart)}〜${formatShortDate(weekEnd)}`;
      statsContainer.createDiv({ cls: "sin-stats-range", text: range });

      try {
        const stats = await this.habitTracker.getWeeklyStats(weekStart);
        if (stats.length === 0) {
          statsContainer.createDiv({ cls: "sin-empty", text: "集計できる習慣がありません。" });
          return;
        }
        this.renderStatsItems(statsContainer, stats);
      } catch {
        statsContainer.createDiv({ cls: "sin-empty", text: "統計の読み込みに失敗しました。" });
      }
    };

    const renderMonthly = async () => {
      statsContainer.empty();
      monthlyBtn.addClass("sin-tab-btn--active");
      weeklyBtn.removeClass("sin-tab-btn--active");

      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      statsContainer.createDiv({
        cls: "sin-stats-range",
        text: `${year}/${String(month).padStart(2, "0")}`,
      });

      try {
        const stats = await this.habitTracker.getMonthlyStats(year, month);
        if (stats.length === 0) {
          statsContainer.createDiv({ cls: "sin-empty", text: "集計できる習慣がありません。" });
          return;
        }
        this.renderStatsItems(statsContainer, stats);
      } catch {
        statsContainer.createDiv({ cls: "sin-empty", text: "統計の読み込みに失敗しました。" });
      }
    };

    weeklyBtn.addEventListener("click", () => renderWeekly());
    monthlyBtn.addEventListener("click", () => renderMonthly());

    // Initial render (async, fire-and-forget — section skeleton already in DOM)
    renderWeekly();
  }

  private renderStatsItems(container: HTMLElement, stats: HabitStat[]): void {
    const list = container.createDiv({ cls: "sin-stats-list" });

    for (const { habit, completed, scheduled, rate } of stats) {
      const item = list.createDiv({ cls: "sin-stat-item" });

      const labelEl = item.createDiv({ cls: "sin-stat-label" });
      labelEl.createSpan({ cls: "sin-habit-icon", text: habit.icon });
      labelEl.createSpan({ cls: "sin-habit-name sin-stat-habit-name", text: habit.name });

      const barWrapper = item.createDiv({ cls: "sin-stat-bar-wrapper" });
      const bar = barWrapper.createDiv({ cls: "sin-stat-bar" });
      const fill = bar.createDiv({ cls: "sin-stat-bar-fill" });
      // Delay width assignment slightly so CSS transition can play
      requestAnimationFrame(() => { fill.style.width = `${rate}%`; });

      item.createDiv({
        cls: "sin-stat-value",
        text: `${completed}/${scheduled} (${rate}%)`,
      });
    }
  }

  // ----------------------------------------------------------
  // Action buttons
  // ----------------------------------------------------------

  private renderActionButtons(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: "sin-action-bar" });

    const habitBtn = bar.createEl("button", {
      cls: "sin-btn sin-btn--primary",
      text: "+ 習慣を追加",
    });
    habitBtn.addEventListener("click", () => {
      new HabitModal(this.app, this.plugin, null, () => this.refresh()).open();
    });

    const scheduleBtn = bar.createEl("button", {
      cls: "sin-btn sin-btn--secondary",
      text: "+ 予定を追加",
    });
    scheduleBtn.addEventListener("click", () => {
      new ScheduleModal(this.app, this.plugin, null, () => this.refresh()).open();
    });
  }

  // ----------------------------------------------------------
  // Refresh
  // ----------------------------------------------------------

  async refresh(): Promise<void> {
    this.stopWaveAnimation();
    await this.render();
  }

  // ----------------------------------------------------------
  // Wave animation
  // ----------------------------------------------------------

  private startWaveAnimation(): void {
    if (!this.canvas) return;

    this.resizeObserver?.disconnect();

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.contentEl);

    const tryResize = (attempts = 0) => {
      this.resizeCanvas();
      if (
        (this.canvas?.width ?? 0) <= 300 &&
        (this.canvas?.getBoundingClientRect().width ?? 0) === 0 &&
        attempts < 120
      ) {
        requestAnimationFrame(() => tryResize(attempts + 1));
      }
    };
    requestAnimationFrame(() => tryResize());

    const draw = () => {
      this.drawWaves();
      this.waveOffset += 1;
      this.animFrameId = requestAnimationFrame(draw);
    };
    this.animFrameId = requestAnimationFrame(draw);
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w > 0 && h > 0 && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private drawWaves(): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = this.canvas;
    if (width <= 300 && height <= 150) return;

    ctx.clearRect(0, 0, width, height);

    const accentColor =
      getComputedStyle(this.contentEl)
        .getPropertyValue("--interactive-accent")
        .trim() || "#7b6cd4";

    const layerCount = width < 400 ? 1 : WAVE_LAYERS.length;

    // Number of wave lines tiled vertically per layer
    const wavesPerLayer = 4;

    for (let i = 0; i < layerCount; i++) {
      const { amplitude, frequency, speed, opacity } = WAVE_LAYERS[i];
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = opacity;

      // Spacing between repeated wave lines
      const spacing = height / wavesPerLayer;
      // scrollY increases → wave moves upward (subtract from Y)
      const scrollY = (this.waveOffset * speed * 20) % spacing;

      for (let w = 0; w < wavesPerLayer + 1; w++) {
        // Start from bottom, scroll upward over time
        const baseY = height - w * spacing + scrollY;

        ctx.beginPath();
        for (let x = 0; x <= width; x++) {
          const y = baseY + amplitude * Math.sin(frequency * x + i * 2.1 + w * 1.3);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  private stopWaveAnimation(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  // ----------------------------------------------------------
  // Ripple effect
  // ----------------------------------------------------------

  private ripple(el: HTMLElement): void {
    const ripple = el.createDiv({ cls: "sin-ripple" });
    setTimeout(() => ripple.remove(), 600);
  }
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------

function formatUpcomingDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const dow = DAY_JA[d.getDay()];
  return `${m}/${day} (${dow})`;
}

function formatShortDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

/**
 * Returns the start of the week containing `today`, respecting
 * `weekStartDay` (0 = Sun, 1 = Mon, …).
 */
function getWeekStart(today: Date, weekStartDay: number): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  let diff = d.getDay() - weekStartDay;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() - diff);
  return d;
}
