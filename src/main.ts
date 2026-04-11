import { Plugin, Notice, Modal, WorkspaceLeaf } from "obsidian";
import { SinSettings } from "./types";
import { DEFAULT_SETTINGS, SIN_VIEW_TYPE, SIN_RIBBON_ICON } from "./constants";
import { SinSettingTab } from "./settings-tab";
import { SinFileManager } from "./services/file-manager";
import { HabitTracker } from "./services/habit-tracker";
import { ScheduleManager } from "./services/schedule-manager";
import { WaveView, ViewMode } from "./views/wave-view";
import { HabitModal } from "./modals/habit-modal";
import { ScheduleModal } from "./modals/schedule-modal";

export default class SinPlugin extends Plugin {
  settings: SinSettings = DEFAULT_SETTINGS;
  fileManager!: SinFileManager;
  habitTracker!: HabitTracker;
  scheduleManager!: ScheduleManager;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Services
    this.fileManager = new SinFileManager(this.app, this.settings);
    this.habitTracker = new HabitTracker(this.fileManager);
    this.scheduleManager = new ScheduleManager(this.fileManager);

    // Register view
    this.registerView(SIN_VIEW_TYPE, (leaf) => new WaveView(leaf, this));

    // Ribbon icon
    this.addRibbonIcon(SIN_RIBBON_ICON, "Sin を開く", () => {
      this.activateView();
    });

    // Commands
    this.addCommand({
      id: "open-wave-view",
      name: "Wave View を開く",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "W" }],
      callback: () => this.activateView("today"),
    });

    this.addCommand({
      id: "open-today",
      name: "今日のビューを開く",
      callback: () => this.activateView("today"),
    });

    this.addCommand({
      id: "open-upcoming",
      name: "今後の予定を開く",
      callback: () => this.activateView("upcoming"),
    });

    this.addCommand({
      id: "open-summary",
      name: "サマリーを開く",
      callback: () => this.activateView("summary"),
    });

    this.addCommand({
      id: "add-habit",
      name: "習慣を追加",
      callback: () => {
        new HabitModal(this.app, this, null, () => this.refreshView()).open();
      },
    });

    this.addCommand({
      id: "add-schedule",
      name: "予定を追加",
      callback: () => {
        new ScheduleModal(this.app, this, null, () => this.refreshView()).open();
      },
    });

    this.addCommand({
      id: "rename-files",
      name: "ファイル名を整理する",
      callback: () => this.runBulkRename(),
    });

    // Settings tab
    this.addSettingTab(new SinSettingTab(this.app, this));

    // URI protocol handler: obsidian://sin-open-wave-view
    this.registerObsidianProtocolHandler("sin-open-wave-view", () => {
      this.activateView("today");
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(SIN_VIEW_TYPE);
  }

  // ----------------------------------------------------------
  // Settings
  // ----------------------------------------------------------

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // Keep fileManager in sync after settings load
    if (this.fileManager) {
      this.fileManager = new SinFileManager(this.app, this.settings);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Re-create file manager with updated settings
    this.fileManager = new SinFileManager(this.app, this.settings);
    this.habitTracker = new HabitTracker(this.fileManager);
    this.scheduleManager = new ScheduleManager(this.fileManager);
  }

  // ----------------------------------------------------------
  // View helpers
  // ----------------------------------------------------------

  async activateView(mode: ViewMode = "today"): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIN_VIEW_TYPE);
    if (existing.length > 0) {
      const view = existing[0].view;
      if (view instanceof WaveView) {
        view.setMode(mode);
      }
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: SIN_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);

    // Set mode after view is created
    const newLeaves = this.app.workspace.getLeavesOfType(SIN_VIEW_TYPE);
    if (newLeaves.length > 0) {
      const view = newLeaves[0].view;
      if (view instanceof WaveView) {
        view.setMode(mode);
      }
    }
  }

  refreshView(): void {
    const leaves = this.app.workspace.getLeavesOfType(SIN_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof WaveView) {
        view.refresh();
      }
    }
  }

  // ----------------------------------------------------------
  // Bulk rename
  // ----------------------------------------------------------

  private async runBulkRename(): Promise<void> {
    const modal = new BulkRenameConfirmModal(this.app, async () => {
      try {
        const result = await this.fileManager.bulkRenameFiles();
        new Notice(
          `ファイル名の整理が完了しました。習慣: ${result.habits} 件、予定: ${result.schedules} 件を更新。`
        );
        this.refreshView();
      } catch {
        new Notice("ファイル名の整理中にエラーが発生しました。");
      }
    });
    modal.open();
  }
}

// ----------------------------------------------------------
// Confirmation modal for bulk rename
// ----------------------------------------------------------

class BulkRenameConfirmModal extends Modal {
  private onConfirm: () => Promise<void>;

  constructor(app: import("obsidian").App, onConfirm: () => Promise<void>) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "ファイル名を整理する" });
    contentEl.createEl("p", {
      text: "習慣・予定ファイルのファイル名を、現在の名前に合わせてリネームします。Vault 内リンクは自動で更新されますが、外部ツールからの参照は手動対応が必要です。続けますか？",
    });

    const btnRow = contentEl.createDiv({ cls: "sin-modal-btn-row" });

    const cancelBtn = btnRow.createEl("button", { text: "キャンセル" });
    cancelBtn.addEventListener("click", () => this.close());

    const okBtn = btnRow.createEl("button", {
      cls: "mod-cta",
      text: "整理する",
    });
    okBtn.addEventListener("click", async () => {
      this.close();
      await this.onConfirm();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
