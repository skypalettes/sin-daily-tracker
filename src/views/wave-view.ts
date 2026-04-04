import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { SIN_VIEW_TYPE, WAVE_LAYERS } from "../constants";
import { SinSettings, TodayHabit, Schedule } from "../types";
import { SinFileManager } from "../services/file-manager";
import { HabitTracker } from "../services/habit-tracker";
import { ScheduleManager } from "../services/schedule-manager";
import { HabitModal } from "../modals/habit-modal";
import { ScheduleModal } from "../modals/schedule-modal";
import { WaveIntro } from "./wave-intro";
import type SinPlugin from "../main";

// ── DEBUG flag: set true to enable diagnostic output ──────────
const SIN_DEBUG = true;
function dbg(...args: unknown[]): void {
  if (SIN_DEBUG) console.log("[Sin]", ...args);
}
// ─────────────────────────────────────────────────────────────

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
    dbg("onOpen() called");
    dbg("contentEl:", this.contentEl);
    dbg("contentEl size:", this.contentEl?.clientWidth, "x", this.contentEl?.clientHeight);

    await this.fileManager.ensureFolders();

    // Phase 2: auto-generate today's log so habits appear even without a toggle
    try {
      await this.habitTracker.ensureTodayLog(new Date());
    } catch {
      // Non-fatal: best-effort log init
    }

    await this.render();

    // Phase 2: wave intro animation (plays over the already-rendered content)
    dbg("showIntroAnimation setting:", this.plugin.settings.showIntroAnimation);
    if (this.plugin.settings.showIntroAnimation) {
      dbg("Starting WaveIntro on contentEl");
      const intro = new WaveIntro(this.contentEl);
      await intro.play();
      dbg("WaveIntro finished");
    }
  }

  async onClose(): Promise<void> {
    this.stopWaveAnimation();
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  private async render(): Promise<void> {
    // Use the official Obsidian ItemView contentEl, not containerEl.children[1]
    this.contentEl.empty();
    this.contentEl.addClass("sin-wave-view");

    dbg("render(): contentEl size after empty+addClass:",
      this.contentEl.clientWidth, "x", this.contentEl.clientHeight);
    dbg("waveAnimationEnabled:", this.plugin.settings.waveAnimationEnabled);

    // Wave background canvas
    if (this.plugin.settings.waveAnimationEnabled) {
      this.canvas = this.contentEl.createEl("canvas", { cls: "sin-wave-canvas" });
      dbg("canvas created, CSS size:",
        this.canvas.clientWidth, "x", this.canvas.clientHeight);
      this.startWaveAnimation();
    }

    // Scrollable content wrapper
    const content = this.contentEl.createDiv({ cls: "sin-content" });

    // Today section
    const today = new Date();
    await this.renderTodaySection(content, today);

    // Upcoming section (next 14 days, excluding today)
    await this.renderUpcomingSection(content, today);

    // Action buttons
    this.renderActionButtons(content);
  }

  // ----------------------------------------------------------
  // Today section
  // ----------------------------------------------------------

  private async renderTodaySection(parent: HTMLElement, today: Date): Promise<void> {
    const section = parent.createDiv({ cls: "sin-section sin-today-section" });

    // Title
    const titleEl = section.createDiv({ cls: "sin-section-title" });
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const dow = DAY_JA[today.getDay()];
    titleEl.setText(`今日  ${y}/${m}/${d} (${dow})`);

    // Grid wrapper (responsive 2-col on wide screens)
    const grid = section.createDiv({ cls: "sin-today-grid" });

    // Habits column
    const habitsCol = grid.createDiv({ cls: "sin-today-col" });
    await this.renderHabitChecklist(habitsCol, today);

    // Schedules column
    const schedulesCol = grid.createDiv({ cls: "sin-today-col" });
    await this.renderScheduleList(schedulesCol, today);
  }

  // ---- Habit checklist -------------------------------------

  private async renderHabitChecklist(parent: HTMLElement, today: Date): Promise<void> {
    const wrapper = parent.createDiv({ cls: "sin-subsection" });
    wrapper.createDiv({ cls: "sin-subsection-title", text: "習慣" });

    let todayHabits: TodayHabit[] = [];
    try {
      todayHabits = await this.habitTracker.getTodayHabits(today);
    } catch (e) {
      wrapper.createDiv({ cls: "sin-empty", text: "習慣の読み込みに失敗しました。" });
      return;
    }

    if (todayHabits.length === 0) {
      wrapper.createDiv({ cls: "sin-empty", text: "今日の習慣はありません。" });
      return;
    }

    const list = wrapper.createDiv({ cls: "sin-habit-list" });

    for (const { habit, completed, streak } of todayHabits) {
      const item = list.createDiv({
        cls: `sin-habit-item${completed ? " sin-habit-item--done" : ""}`,
      });

      // Checkbox
      const checkbox = item.createDiv({ cls: "sin-checkbox" });
      if (completed) checkbox.createSpan({ text: "✓", cls: "sin-checkbox-check" });

      // Icon + Name
      const info = item.createDiv({ cls: "sin-habit-info" });
      info.createSpan({ cls: "sin-habit-icon", text: habit.icon });
      info.createSpan({ cls: "sin-habit-name", text: habit.name });

      // Streak
      if (this.plugin.settings.showStreaks && streak > 0) {
        item.createDiv({
          cls: "sin-streak",
          text: `🔥 ${streak}日連続`,
        });
      }

      // Click handler
      item.addEventListener("click", async () => {
        try {
          const nowCompleted = await this.habitTracker.toggleCompletion(habit, today);
          item.toggleClass("sin-habit-item--done", nowCompleted);
          if (nowCompleted) {
            // Checkmark enters with a scale animation (CSS @keyframes)
            checkbox.createSpan({ text: "✓", cls: "sin-checkbox-check" });
          } else {
            // Checkmark exits with a scale-out animation before removal
            const check = checkbox.querySelector(".sin-checkbox-check");
            if (check instanceof HTMLElement) {
              check.addClass("sin-checkbox-check--exit");
              setTimeout(() => checkbox.empty(), 200);
            } else {
              checkbox.empty();
            }
          }
          this.ripple(item);
        } catch (e) {
          new Notice("習慣の更新に失敗しました。");
        }
      });
    }
  }

  // ---- Schedule list ---------------------------------------

  private async renderScheduleList(parent: HTMLElement, today: Date): Promise<void> {
    const wrapper = parent.createDiv({ cls: "sin-subsection" });
    wrapper.createDiv({ cls: "sin-subsection-title", text: "予定" });

    let schedules: Schedule[] = [];
    try {
      schedules = await this.scheduleManager.getTodaySchedules(today);
    } catch (e) {
      wrapper.createDiv({ cls: "sin-empty", text: "予定の読み込みに失敗しました。" });
      return;
    }

    if (schedules.length === 0) {
      wrapper.createDiv({ cls: "sin-empty", text: "今日の予定はありません。" });
      return;
    }

    const list = wrapper.createDiv({ cls: "sin-schedule-list" });
    for (const schedule of schedules) {
      const item = list.createDiv({
        cls: `sin-schedule-item${schedule.done ? " sin-schedule-item--done" : ""}`,
      });

      const timeEl = item.createSpan({ cls: "sin-schedule-time" });
      timeEl.setText(schedule.allDay ? "終日" : (schedule.time ?? ""));

      item.createSpan({ cls: "sin-schedule-icon", text: schedule.icon });
      item.createSpan({ cls: "sin-schedule-name", text: schedule.name });
    }
  }

  // ----------------------------------------------------------
  // Upcoming section
  // ----------------------------------------------------------

  private async renderUpcomingSection(parent: HTMLElement, today: Date): Promise<void> {
    const section = parent.createDiv({ cls: "sin-section sin-upcoming-section" });
    section.createDiv({ cls: "sin-section-title", text: "今後の予定" });

    let upcoming: Schedule[] = [];
    try {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      upcoming = await this.scheduleManager.getUpcoming(
        this.plugin.settings.upcomingDays,
        tomorrow
      );
    } catch (e) {
      section.createDiv({ cls: "sin-empty", text: "予定の読み込みに失敗しました。" });
      return;
    }

    if (upcoming.length === 0) {
      section.createDiv({ cls: "sin-empty", text: "今後の予定はありません。" });
      return;
    }

    const list = section.createDiv({ cls: "sin-upcoming-list" });
    for (const schedule of upcoming) {
      const item = list.createDiv({ cls: "sin-upcoming-item" });

      const dateEl = item.createSpan({ cls: "sin-upcoming-date" });
      dateEl.setText(formatUpcomingDate(schedule.date));

      item.createSpan({ cls: "sin-upcoming-icon", text: schedule.icon });
      item.createSpan({ cls: "sin-upcoming-name", text: schedule.name });

      if (schedule.time) {
        item.createSpan({ cls: "sin-upcoming-time", text: schedule.time });
      }
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

    // Disconnect any previous observer to avoid leaks across refreshes
    this.resizeObserver?.disconnect();

    // Observe contentEl (the Obsidian view-content element) — it reliably
    // reflects pane resize events and always has layout dimensions.
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.contentEl);

    // `onOpen` may be called before the leaf is revealed (revealLeaf is called
    // after setViewState). Retry resizing every frame until we get real
    // dimensions — this handles both the "tab not yet active" case and normal
    // first-render timing.
    const tryResize = (attempts = 0) => {
      this.resizeCanvas();
      const w = this.canvas?.width ?? 0;
      const h = this.canvas?.height ?? 0;
      if (SIN_DEBUG && (attempts === 0 || attempts === 1 || w > 0)) {
        dbg(`tryResize attempt=${attempts} canvas=${w}x${h}`,
          "getBCR:", this.canvas?.getBoundingClientRect());
      }
      // Keep retrying for up to ~2 seconds (120 frames at 60 fps)
      if (w === 0 && attempts < 120) {
        requestAnimationFrame(() => tryResize(attempts + 1));
      } else if (w > 0) {
        dbg("Canvas sized successfully:", w, "x", h, "after", attempts, "attempts");
      } else {
        dbg("Canvas sizing gave up after", attempts, "attempts — still 0x0");
        new Notice("[Sin debug] canvas still 0×0 after 120 frames. Check console.");
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

    // Read the CSS-rendered size of the canvas itself.
    // The canvas has `width: 100%; height: 100%` in CSS, so this gives us
    // exactly the dimensions we need regardless of parent reference issues.
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
    // Skip drawing if the canvas buffer hasn't been sized yet
    if (width === 0 || height === 0) return;

    ctx.clearRect(0, 0, width, height);

    // Use CSS custom property for accent colour
    const accentColor = getComputedStyle(this.contentEl)
      .getPropertyValue("--interactive-accent")
      .trim() || "#7b6cd4";

    // ── DEBUG: draw a bright diagonal line to confirm canvas is rendering ─
    if (SIN_DEBUG) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "#ff4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.3);
      ctx.lineTo(width, height * 0.7);
      ctx.stroke();
      ctx.restore();
    }
    // ─────────────────────────────────────────────────────────────────────

    // Reduce layers on small canvases (mobile / narrow pane)
    const layerCount = width < 400 ? 1 : WAVE_LAYERS.length;

    for (let i = 0; i < layerCount; i++) {
      const { amplitude, frequency, speed, opacity } = WAVE_LAYERS[i];
      ctx.beginPath();
      // DEBUG: use higher opacity so waves are clearly visible
      ctx.globalAlpha = SIN_DEBUG ? opacity * 8 : opacity;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = SIN_DEBUG ? 3 : 2;

      for (let x = 0; x <= width; x++) {
        const y =
          height / 2 +
          amplitude *
            Math.sin(frequency * x + this.waveOffset * speed * 60);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
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
