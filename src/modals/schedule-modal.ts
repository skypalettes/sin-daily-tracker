import { App, Modal, Notice } from "obsidian";
import { Schedule } from "../types";
import { SCHEDULE_EMOJIS } from "../constants";
import type SinPlugin from "../main";

export class ScheduleModal extends Modal {
  private plugin: SinPlugin;
  private existing: Schedule | null;
  private onSave: () => void;

  // Form state
  private name = "";
  private icon = "📅";
  private date = "";
  private time = "";
  private allDay = false;
  private memo = "";

  constructor(
    app: App,
    plugin: SinPlugin,
    existing: Schedule | null,
    onSave: () => void,
    defaultDate?: Date
  ) {
    super(app);
    this.plugin = plugin;
    this.existing = existing;
    this.onSave = onSave;

    if (existing) {
      this.name = existing.name;
      this.icon = existing.icon;
      this.date = existing.date;
      this.time = existing.time ?? "";
      this.allDay = existing.allDay;
      this.memo = existing.memo ?? "";
    } else {
      const base = defaultDate ?? new Date();
      this.date = base.toISOString().slice(0, 10);
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("sin-modal");
    contentEl.createEl("h2", {
      cls: "sin-modal-title",
      text: this.existing ? "予定を編集" : "予定を追加",
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
    this.addField(form, "予定名", (row) => {
      const input = row.createEl("input", {
        type: "text",
        cls: "sin-input",
        placeholder: "例: 歯医者",
        value: this.name,
      });
      input.addEventListener("input", () => { this.name = input.value; });
    });

    // Icon — text input + emoji picker
    let iconInput: HTMLInputElement;
    this.addField(form, "アイコン (絵文字)", (row) => {
      iconInput = row.createEl("input", {
        type: "text",
        cls: "sin-input sin-input--short",
        placeholder: "📅",
        value: this.icon,
      });
      iconInput.addEventListener("input", () => {
        this.icon = iconInput.value.trim() || "📅";
        refreshEmojiPicker();
      });
    });

    const emojiRow = form.createDiv({ cls: "sin-form-row" });
    emojiRow.createEl("span", { cls: "sin-form-label" });
    const emojiPicker = emojiRow.createDiv({ cls: "sin-emoji-picker" });

    const refreshEmojiPicker = () => {
      emojiPicker.querySelectorAll<HTMLButtonElement>(".sin-emoji-btn").forEach((btn) => {
        btn.toggleClass("sin-emoji-btn--active", btn.dataset.emoji === this.icon);
      });
    };

    for (const emoji of SCHEDULE_EMOJIS) {
      const btn = emojiPicker.createEl("button", {
        cls: `sin-emoji-btn${emoji === this.icon ? " sin-emoji-btn--active" : ""}`,
        text: emoji,
        type: "button",
      });
      btn.dataset.emoji = emoji;
      btn.addEventListener("click", () => {
        this.icon = emoji;
        iconInput.value = emoji;
        refreshEmojiPicker();
      });
    }

    // Date
    this.addField(form, "日付", (row) => {
      const input = row.createEl("input", {
        type: "date",
        cls: "sin-input",
        value: this.date,
      });
      input.addEventListener("change", () => { this.date = input.value; });
    });

    // All-day toggle
    this.addField(form, "終日", (row) => {
      const checkbox = row.createEl("input", { type: "checkbox", cls: "sin-checkbox-input" });
      checkbox.checked = this.allDay;
      checkbox.addEventListener("change", () => {
        this.allDay = checkbox.checked;
        timeRow.style.display = this.allDay ? "none" : "";
      });
    });

    // Time (hidden when all-day)
    const timeRow = form.createDiv({ cls: "sin-form-row" });
    timeRow.style.display = this.allDay ? "none" : "";
    timeRow.createEl("label", { cls: "sin-form-label", text: "時刻" });
    const timeInput = timeRow.createEl("input", {
      type: "time",
      cls: "sin-input sin-input--short",
      value: this.time,
    });
    timeInput.addEventListener("change", () => { this.time = timeInput.value; });

    // Memo
    this.addField(form, "メモ", (row) => {
      const textarea = row.createEl("textarea", {
        cls: "sin-textarea",
        placeholder: "補足情報...",
      });
      textarea.value = this.memo;
      textarea.addEventListener("input", () => { this.memo = textarea.value; });
    });

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
  // Save
  // ----------------------------------------------------------

  private async handleSave(): Promise<void> {
    const name = this.name.trim();
    if (!name) {
      new Notice("予定名を入力してください。");
      return;
    }

    if (!this.date) {
      new Notice("日付を選択してください。");
      return;
    }

    const filePath =
      this.existing?.filePath ??
      this.plugin.fileManager.newSchedulePath(this.date, name);

    const schedule: Schedule = {
      filePath,
      name,
      icon: this.icon,
      date: this.date,
      allDay: this.allDay,
      done: this.existing?.done ?? false,
    };

    if (!this.allDay && this.time) {
      schedule.time = this.time;
    }

    if (this.memo.trim()) {
      schedule.memo = this.memo.trim();
    }

    try {
      await this.plugin.fileManager.writeSchedule(schedule);
      new Notice(`予定「${name}」を${this.existing ? "更新" : "追加"}しました。`);
      this.close();
      this.onSave();
    } catch (e) {
      new Notice("保存に失敗しました: " + String(e));
    }
  }
}
