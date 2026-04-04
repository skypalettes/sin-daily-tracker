import { Plugin, WorkspaceLeaf } from "obsidian";
import { SinSettings } from "./types";
import { DEFAULT_SETTINGS, SIN_VIEW_TYPE, SIN_RIBBON_ICON } from "./constants";
import { SinSettingTab } from "./settings-tab";
import { SinFileManager } from "./services/file-manager";
import { HabitTracker } from "./services/habit-tracker";
import { ScheduleManager } from "./services/schedule-manager";
import { WaveView } from "./views/wave-view";
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
      callback: () => this.activateView(),
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

    // Settings tab
    this.addSettingTab(new SinSettingTab(this.app, this));

    // URI protocol handler: obsidian://sin-open-wave-view
    this.registerObsidianProtocolHandler("sin-open-wave-view", () => {
      this.activateView();
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

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIN_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: SIN_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private refreshView(): void {
    const leaves = this.app.workspace.getLeavesOfType(SIN_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof WaveView) {
        view.refresh();
      }
    }
  }
}
