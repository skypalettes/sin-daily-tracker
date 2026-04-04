import { App, Modal, Notice, normalizePath } from "obsidian";
import { Habit, CycleType, WeekDay } from "../types";
import { serializeHabit } from "../models/habit";
import { WEEK_DAYS, WEEK_DAY_LABELS } from "../constants";
import type SinPlugin from "../main";

export class HabitModal extends Modal {
  private plugin: SinPlugin;
  private existing: Habit | null;
  private onSave: () => void;

  // Form state
  private name = "";
  private icon = "📌";
  private color = "#4ECDC4";
  private cycle: CycleType = "daily";
  private selectedDays: Set<WeekDay> = new Set();
  private selectedDates: Set<number> = new Set();
  private interval = 3;

  // Dynamic form area
  private cycleOptionsEl: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: SinPlugin,
    existing: Habit | null,
    onSave: () => void
  ) {
    super(app);
    this.plugin = plugin;
    this.existing = existing;
    this.onSave = onSave;

    if (existing) {
      this.name = existing.name;
      this.icon = existing.icon;
      this.color = existing.color;
      this.cycle = existing.cycle;
      this.selectedDays = new Set(existing.days ?? []);
      this.selectedDates = new Set(existing.dates ?? []);
      this.interval = existing.interval ?? 3;
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("sin-modal");
    contentEl.createEl("h2", {
      cls: "sin-modal-title",
      text: this.existing ? "習慣を編集" : "習慣を追加",
    });

    this.buildForm(contentEl);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  // ----------------------------------------------------------
  // Form
  // ----------------------------------------------------------

  private buildForm(parent: HTMLElement): void {
    const form = parent.createDiv({ cls: "sin-form" });

    // Name
    this.addField(form, "習慣名", (row) => {
      const input = row.createEl("input", {
        type: "text",
        cls: "sin-input",
        placeholder: "例: 朝のランニング",
        value: this.name,
      });
      input.addEventListener("input", () => { this.name = input.value; });
    });

    // Icon
    this.addField(form, "アイコン (絵文字)", (row) => {
      const input = row.createEl("input", {
        type: "text",
        cls: "sin-input sin-input--short",
        placeholder: "📌",
        value: this.icon,
      });
      input.addEventListener("input", () => { this.icon = input.value.trim() || "📌"; });
    });

    // Color
    this.addField(form, "カラー", (row) => {
      const input = row.createEl("input", { type: "color", cls: "sin-color-input" });
      input.value = this.color;
      input.addEventListener("input", () => { this.color = input.value; });
    });

    // Cycle
    this.addField(form, "周期", (row) => {
      const select = row.createEl("select", { cls: "sin-select" });
      const options: { value: CycleType; label: string }[] = [
        { value: "daily", label: "毎日 (日課)" },
        { value: "weekly", label: "毎週 (週課)" },
        { value: "monthly", label: "毎月 (月課)" },
        { value: "custom", label: "カスタム (N日ごと)" },
      ];
      for (const { value, label } of options) {
        const opt = select.createEl("option", { value, text: label });
        if (value === this.cycle) opt.selected = true;
      }
      select.addEventListener("change", () => {
        this.cycle = select.value as CycleType;
        this.renderCycleOptions();
      });
    });

    // Cycle-specific options (dynamic)
    this.cycleOptionsEl = form.createDiv({ cls: "sin-cycle-options" });
    this.renderCycleOptions();

    // Buttons
    const btnRow = form.createDiv({ cls: "sin-btn-row" });

    const cancelBtn = btnRow.createEl("button", {
      cls: "sin-btn sin-btn--ghost",
      text: "キャンセル",
    });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = btnRow.createEl("button", {
      cls: "sin-btn sin-btn--primary",
      text: this.existing ? "保存" : "追加",
    });
    saveBtn.addEventListener("click", () => this.handleSave());
  }

  private addField(
    parent: HTMLElement,
    label: string,
    buildInput: (row: HTMLElement) => void
  ): void {
    const row = parent.createDiv({ cls: "sin-form-row" });
    row.createEl("label", { cls: "sin-form-label", text: label });
    buildInput(row);
  }

  // ----------------------------------------------------------
  // Dynamic cycle options
  // ----------------------------------------------------------

  private renderCycleOptions(): void {
    if (!this.cycleOptionsEl) return;
    this.cycleOptionsEl.empty();

    if (this.cycle === "weekly") {
      this.renderWeekdayPicker(this.cycleOptionsEl);
    } else if (this.cycle === "monthly") {
      this.renderDatePicker(this.cycleOptionsEl);
    } else if (this.cycle === "custom") {
      this.renderIntervalPicker(this.cycleOptionsEl);
    }
  }

  private renderWeekdayPicker(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "sin-form-row" });
    row.createEl("label", { cls: "sin-form-label", text: "曜日" });
    const picker = row.createDiv({ cls: "sin-day-picker" });

    for (const day of WEEK_DAYS) {
      const btn = picker.createEl("button", {
        cls: `sin-day-btn${this.selectedDays.has(day) ? " sin-day-btn--active" : ""}`,
        text: WEEK_DAY_LABELS[day],
        type: "button",
      });
      btn.addEventListener("click", () => {
        if (this.selectedDays.has(day)) {
          this.selectedDays.delete(day);
          btn.removeClass("sin-day-btn--active");
        } else {
          this.selectedDays.add(day);
          btn.addClass("sin-day-btn--active");
        }
      });
    }
  }

  private renderDatePicker(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "sin-form-row" });
    row.createEl("label", { cls: "sin-form-label", text: "日付" });
    const picker = row.createDiv({ cls: "sin-date-picker" });

    for (let d = 1; d <= 31; d++) {
      const btn = picker.createEl("button", {
        cls: `sin-date-btn${this.selectedDates.has(d) ? " sin-date-btn--active" : ""}`,
        text: String(d),
        type: "button",
      });
      btn.addEventListener("click", () => {
        if (this.selectedDates.has(d)) {
          this.selectedDates.delete(d);
          btn.removeClass("sin-date-btn--active");
        } else {
          this.selectedDates.add(d);
          btn.addClass("sin-date-btn--active");
        }
      });
    }
  }

  private renderIntervalPicker(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "sin-form-row" });
    row.createEl("label", { cls: "sin-form-label", text: "間隔 (日)" });
    const input = row.createEl("input", {
      type: "number",
      cls: "sin-input sin-input--short",
      value: String(this.interval),
    });
    input.min = "1";
    input.addEventListener("input", () => {
      this.interval = Math.max(1, parseInt(input.value) || 1);
    });
  }

  // ----------------------------------------------------------
  // Save
  // ----------------------------------------------------------

  private async handleSave(): Promise<void> {
    const name = this.name.trim();
    if (!name) {
      new Notice("習慣名を入力してください。");
      return;
    }

    if (this.cycle === "weekly" && this.selectedDays.size === 0) {
      new Notice("週課の場合は曜日を選択してください。");
      return;
    }

    if (this.cycle === "monthly" && this.selectedDates.size === 0) {
      new Notice("月課の場合は日付を選択してください。");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const habit: Habit = {
      filePath: this.existing?.filePath ?? this.plugin.fileManager.newHabitPath(name),
      name,
      icon: this.icon,
      color: this.color,
      cycle: this.cycle,
      created: this.existing?.created ?? today,
      archived: this.existing?.archived ?? false,
    };

    if (this.cycle === "weekly") habit.days = [...this.selectedDays];
    if (this.cycle === "monthly") habit.dates = [...this.selectedDates].sort((a, b) => a - b);
    if (this.cycle === "custom") habit.interval = this.interval;

    try {
      await this.plugin.fileManager.writeHabit(habit);
      new Notice(`習慣「${name}」を${this.existing ? "更新" : "追加"}しました。`);
      this.close();
      this.onSave();
    } catch (e) {
      new Notice("保存に失敗しました: " + String(e));
    }
  }
}
