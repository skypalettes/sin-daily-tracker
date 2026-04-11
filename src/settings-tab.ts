import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type SinPlugin from "./main";

export class SinSettingTab extends PluginSettingTab {
  plugin: SinPlugin;

  constructor(app: App, plugin: SinPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Sin 設定" });

    // ------ Data folder ------
    new Setting(containerEl)
      .setName("Sin フォルダ")
      .setDesc("習慣・予定・ログを保存するフォルダのパス (Vault からの相対パス)")
      .addText((text) =>
        text
          .setPlaceholder("Sin")
          .setValue(this.plugin.settings.sinFolder)
          .onChange(async (value) => {
            this.plugin.settings.sinFolder = value.trim() || "Sin";
            await this.plugin.saveSettings();
          })
      );

    // ------ Week start day ------
    new Setting(containerEl)
      .setName("週の開始曜日")
      .setDesc("週の最初の曜日を選択します")
      .addDropdown((dd) =>
        dd
          .addOption("1", "月曜日")
          .addOption("0", "日曜日")
          .setValue(String(this.plugin.settings.weekStartDay))
          .onChange(async (value) => {
            this.plugin.settings.weekStartDay = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    // ------ Streaks ------
    new Setting(containerEl)
      .setName("ストリークを表示")
      .setDesc("習慣の連続達成日数を表示します")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showStreaks)
          .onChange(async (value) => {
            this.plugin.settings.showStreaks = value;
            await this.plugin.saveSettings();
          })
      );

    // ------ Upcoming days ------
    new Setting(containerEl)
      .setName("今後の予定の表示日数")
      .setDesc("Wave View に表示する今後の予定の日数 (1〜90)")
      .addSlider((sl) =>
        sl
          .setLimits(1, 90, 1)
          .setValue(this.plugin.settings.upcomingDays)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.upcomingDays = value;
            await this.plugin.saveSettings();
          })
      );

    // ------ Wave animation ------
    new Setting(containerEl)
      .setName("波アニメーション")
      .setDesc("Wave View の背景波アニメーションを有効にします")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.waveAnimationEnabled)
          .onChange(async (value) => {
            this.plugin.settings.waveAnimationEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    // ------ Intro animation ------
    new Setting(containerEl)
      .setName("起動アニメーション")
      .setDesc("Wave View を開いたときの起動アニメーションを表示します")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showIntroAnimation)
          .onChange(async (value) => {
            this.plugin.settings.showIntroAnimation = value;
            await this.plugin.saveSettings();
          })
      );

    // ------ Notifications ------
    new Setting(containerEl)
      .setName("通知")
      .setDesc("習慣の追加・更新時に通知を表示します")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showNotifications)
          .onChange(async (value) => {
            this.plugin.settings.showNotifications = value;
            await this.plugin.saveSettings();
          })
      );

    // ------ Future habit toggle ------
    new Setting(containerEl)
      .setName("未来日の習慣チェックを許可")
      .setDesc("今日より後の日付に切り替えたときも習慣のトグルを有効にします")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.allowFutureHabitToggle)
          .onChange(async (value) => {
            this.plugin.settings.allowFutureHabitToggle = value;
            await this.plugin.saveSettings();
          })
      );

    // ------ Auto rename files ------
    new Setting(containerEl)
      .setName("ファイル名を自動リネーム")
      .setDesc("習慣・予定の名前を変更したとき、ファイル名も自動で更新します")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.autoRenameFiles)
          .onChange(async (value) => {
            this.plugin.settings.autoRenameFiles = value;
            await this.plugin.saveSettings();
          })
      );

    // ------ Bulk rename ------
    new Setting(containerEl)
      .setName("ファイル名を整理する")
      .setDesc("既存の習慣・予定ファイルのファイル名を現在の名前に合わせてリネームします")
      .addButton((btn) =>
        btn
          .setButtonText("整理する")
          .onClick(async () => {
            try {
              const result = await this.plugin.fileManager.bulkRenameFiles();
              new Notice(
                `完了: 習慣 ${result.habits} 件、予定 ${result.schedules} 件を更新しました。`
              );
              this.plugin.refreshView();
            } catch {
              new Notice("ファイル名の整理中にエラーが発生しました。");
            }
          })
      );
  }
}
