# メインビュー再構成・日付切替・データ視認性改善 実装計画

## 0. 背景と目的

現状の Sin プラグインは、単一の Wave View (`SIN_VIEW_TYPE`) にその日の情報、今後の予定、
週間・月間サマリーの全てを詰め込んでおり、「1 日に集中する」という本来の狙いから
外れている。また、メインビューは `new Date()` をレンダリング時にハードコードしており、
日付を切り替えることができない。さらに、`habits/` と `schedules/` 配下の md ファイルは
現状スラッグが ASCII 英数字に限定されており、日本語タスク名を含むファイルでは
中身を開くまで何のファイルかわからない。

本ドキュメントでは、以下 3 つの改善を実装するための計画をまとめる。

1. メインビューを「当日情報」に絞り込み、今後の予定・サマリーを別画面に分離
2. メインビューで日付切替を可能にする（ボタン / カレンダー）
3. habit / schedule の md ファイル名にタスク名・スケジュール名を含めて視認性を向上

---

## 1. 対象ファイル概観

| 対象 | パス | 主な役割 |
|------|------|---------|
| メインビュー | `src/views/wave-view.ts` | Today / Upcoming / Summary を一括レンダリング |
| ルート | `src/main.ts` | `registerView` / コマンド登録 |
| 定数 | `src/constants.ts` | `SIN_VIEW_TYPE` / デフォルト設定 |
| 型 | `src/types.ts` | `SinSettings` / モデル型 |
| 設定 | `src/settings-tab.ts` | 設定 UI |
| ファイル管理 | `src/services/file-manager.ts` | `newHabitPath` / `newSchedulePath` など |
| モデル | `src/models/habit.ts`, `src/models/schedule.ts` | `nameToSlug` / シリアライズ |
| ロジック | `src/services/habit-tracker.ts`, `schedule-manager.ts` | 既に `date: Date` を受け取るので拡張は軽微 |
| スタイル | `styles.css` | 新規セクション用の CSS |

---

## 2. 機能 1: メインビューを「当日情報」に絞る

### 2.1 目的

- メインビュー = 「今この 1 日」に集中する場所。
- 「今後の予定」「週間/月間サマリー」は参照頻度が低く、スクロールで日々の操作を阻害している。
- 別画面に切り出すことで、メインビューの情報密度を下げ、視線の往復を減らす。

### 2.2 画面構成の方針

単一の `SIN_VIEW_TYPE` の中で**内部モード切替**とする方針を採用する。

| 候補 | 長所 | 短所 | 採否 |
|------|------|------|------|
| A: ItemView を 3 種類登録 (`sin-today` / `sin-upcoming` / `sin-summary`) | Obsidian のタブ管理と相性良 | 実装コスト大、状態の受け渡しが煩雑、リボン/コマンド増加 | ✗ |
| B: 単一 ItemView + 上部タブ切替 | 実装が軽量、波アニメ背景を共有 | URL (leaf state) で直リンクしづらい | ✓ |

**採用: B. 単一ビュー + 上部タブ切替**

```
┌─ Sin ─────────────────────────────────────┐
│ [ 今日 ] [ 今後の予定 ] [ サマリー ]      │ ← セグメントコントロール
├───────────────────────────────────────────┤
│ (選択中のモードに応じた本体)              │
│                                           │
└───────────────────────────────────────────┘
```

- モード状態はビューのインスタンス変数 `private mode: "today" | "upcoming" | "summary"` で保持。
- 切替はその場で再描画し、`refresh()` に委譲。
- `leaf.setViewState({ state: { mode } })` で Obsidian のタブ復元にも追従できるようにする。

### 2.3 既存コード分割

`wave-view.ts` の以下メソッドをそのまま残しつつ、`render()` から**モード別に呼び分け**る。

- `renderTodaySection` → `today` モードで呼ぶ
- `renderUpcomingSection` → `upcoming` モードで呼ぶ
- `renderSummarySection` → `summary` モードで呼ぶ
- `renderActionButtons` → `today` モードのみ表示（`+ 習慣を追加` / `+ 予定を追加`）

`today` モードで `getTodayHabits` / `getTodaySchedules` のみを並列取得し、Upcoming/Summary
のデータ取得は該当モード時にだけ実行する（現状の `Promise.all` も分解）。

### 2.4 追加コマンド

`src/main.ts` に以下を追加する:

| コマンド ID | 表示名 | 動作 |
|-------------|-------|------|
| `open-today` | Sin: 今日のビューを開く | ビュー起動 + `mode = "today"` |
| `open-upcoming` | Sin: 今後の予定を開く | ビュー起動 + `mode = "upcoming"` |
| `open-summary` | Sin: サマリーを開く | ビュー起動 + `mode = "summary"` |

`activateView` にオプション `{ mode }` を追加し、既存の leaf があればモードだけ差し替えて
`revealLeaf` する。

### 2.5 既存ホットキー

既存の `open-wave-view` (Mod+Shift+W) は後方互換のため残し、起動時は `today` モード固定とする。

---

## 3. 機能 2: メインビューの日付切替

### 3.1 目的

- 日付が変わってから昨日分の習慣を達成済みにしたい
- 翌日以降の予定を素早く確認したい
- カレンダーからも 1 日単位ボタンからも切り替えられるようにする

### 3.2 UI

Today モード上部の日付タイトルをナビゲーションヘッダに昇格させる。

```
◀  2026/04/10 (金) [📅]  ▶   [ 今日に戻る ]
```

- `◀` / `▶`: 1 日前 / 1 日後
- 日付表示部: クリックで日付ピッカー（Obsidian の Menu + `<input type="date">` ベース）を開く
- `[ 今日に戻る ]`: `currentDate = new Date()` にリセット（現在日と一致する時は非表示）

### 3.3 状態管理

```ts
class WaveView extends ItemView {
  // 0 時丸め済みの Date
  private currentDate: Date = startOfDay(new Date());
  ...
}
```

- `currentDate` はビューのインスタンス変数。
- `refresh()` は `currentDate` を保持したまま再描画する（現状も同じ形）。
- 日付切替ハンドラは `this.currentDate = ...` してから `this.refresh()` を呼ぶだけ。
- ビューが再度 `onOpen` されたときは `startOfDay(new Date())` で今日にリセット。

### 3.4 既存ロジックへの影響

幸い、既存サービスのインタフェースはほぼ日付を受け取れる形になっている:

- `HabitTracker.getTodayHabits(today: Date)`
- `HabitTracker.toggleCompletion(habit, date: Date)`
- `HabitTracker.ensureTodayLog(today: Date)`
- `ScheduleManager.getTodaySchedules(today: Date)`

よって、`render()` / `renderTodaySection()` / ハンドラ内の `new Date()` を
`this.currentDate` に置換するのが本質的な変更となる。

**注意が必要な点:**

1. `ensureTodayLog(this.currentDate)` を過去日・未来日に対して自動実行すべきではない。
   - 未来日で呼ぶと、そのまま未達成ログが積まれて統計を歪める。
   - **ルール**: `ensureTodayLog` は `currentDate === today` の場合のみ呼ぶ。
2. `toggleCompletion` は過去日を対象に呼んでも問題ないことを再確認する
   （`writeLog(dateStr, ...)` 側で月ファイルに対して upsert しているので OK）。
3. 未来日で習慣チェックを許可すべきか検討。
   - **方針**: 未来日のチェックは UI 上ディスエーブル（チェックボックスを読み取り専用化）し、
     `今日より後は操作不可` の旨を表示する。
4. ストリーク計算 (`getStreak`) は `today` 引数を持つので `this.currentDate` で整合。

### 3.5 表示の差分

- タイトル: `今日 2026/04/10 (金)` → 日付ナビゲーション行 + 本文
- 過去日のとき: セクション見出しに `過去` バッジ、背景トーンを一段暗く
- 未来日のとき: `予定` バッジ、習慣チェックボックスは非活性
- `+ 習慣を追加` / `+ 予定を追加` ボタンは常時表示
  - 予定追加モーダルの初期日付は `this.currentDate` を渡す

### 3.6 日付ピッカー実装

Obsidian はネイティブの日付選択 UI を提供していないので、以下の順で選択する:

1. 第一案: 非表示の `<input type="date">` を DOM に差し込み、クリックで `showPicker()` を呼ぶ
   （Chromium ベースなのでブラウザ日付ピッカーが使える）。
2. フォールバック: 月グリッドを自前描画した小さなポップオーバー。

最初は **第一案のみ実装**し、モバイル含め動作確認後に必要なら自前実装を追加する。

### 3.7 設定

`SinSettings` に以下を追加（任意）:

| キー | 型 | 既定 | 説明 |
|------|---|------|-----|
| `allowFutureHabitToggle` | `boolean` | `false` | 未来日の習慣チェックを許可 |

デフォルトは `false`（3.4 節の方針と整合）。

---

## 4. 機能 3: ファイル名にタスク・予定名を含める

### 4.1 現状の問題

| 種別 | 現在の命名 | 問題 |
|------|-----------|------|
| habit | `habits/{slug}.md` | `nameToSlug` 相当関数が `[^\w-]` を除去するため、**日本語が全て消える**。結果として `habit.md` / `habit-ks9lzx.md` のようなファイルが並ぶ |
| schedule | `schedules/{YYYY-MM-DD}_{slug}.md` | 同上。日本語予定名は `2026-04-10_schedule.md` になりがち |
| log | `logs/{YYYY-MM}.md` | 問題なし（月集約のため現状維持） |

対象コード:

- `src/models/schedule.ts:69` `nameToSlug`
- `src/services/file-manager.ts:165` `newHabitPath`（独自に同等のスラッグ処理を持つ）
- `src/services/file-manager.ts:225` `newSchedulePath`

### 4.2 命名規則の新ルール

#### 4.2.1 habit

```
habits/{safeName}.md
```

衝突時は末尾に ` (2)`, ` (3)`, … を付与する（Obsidian 流）。

#### 4.2.2 schedule

```
schedules/{YYYY-MM-DD}_{safeName}.md
```

日付プレフィックスは維持（ソート性とユニーク性のため）。衝突時は habit と同じ処理。

#### 4.2.3 `safeName` の定義

Vault のファイル名として利用できるよう、最低限だけを置換する。
Obsidian の禁則文字・OS 横断の制約を考慮:

- 置換対象: `\ / : * ? " < > |` → `-`
- 連続スペースは単一スペースに圧縮
- 先頭末尾の空白 / ドットを除去
- 長さは **80 文字**で切り捨て（UTF-16 code unit ベース）
- 空になった場合のフォールバック: `habit` / `schedule`
- **日本語・絵文字・漢字はそのまま保持**

→ 新ユーティリティ `src/models/filename.ts` を新設:

```ts
export function toSafeFileName(name: string): string { ... }
```

`nameToSlug` は削除（参照箇所は file-manager のみ）。

### 4.3 既存ファイルとの共存

- **読み取り側はファイル名を一切参照していない**（`parseHabitFrontmatter` / `parseScheduleFrontmatter`
  は frontmatter の `name` フィールドを使い、`filePath` は表示・書込用に保持するだけ）。
- したがって **既存の英数字スラッグのファイルは放置しても動作する**。
- 新規作成ファイルのみ新ルールが適用される（非破壊）。

### 4.4 既存ファイルの一括リネーム（オプション）

ユーザーが希望する場合のみ有効化する一括リネーム機能を追加する:

- コマンド: `Sin: ファイル名を整理する`
- 動作:
  1. `readHabits()` / `readSchedules()` で全件読み込み
  2. 期待される `safeName` と現在のファイル名を比較
  3. 差分を `app.vault.rename(file, newPath)` で移動
  4. 進捗を `Notice` で表示
- 呼び出し前に確認モーダルを表示（破壊的ではないが移動件数を見せる）。

### 4.5 編集時のリネーム

既存 habit / schedule の `name` を変更したとき、ファイル名も追従すべきか。

| 方針 | 挙動 | 採否 |
|------|------|------|
| A: 自動リネーム | 編集のたびに `vault.rename` | ✓ (簡潔) |
| B: 手動のみ | リネームしない | ✗ (劣化する) |

**採用: A. 自動リネーム**

実装:

- `SinFileManager.writeHabit` / `writeSchedule` で現在の `filePath` と期待パスが異なる場合
  `app.vault.rename` を呼ぶ。リネーム後は `habit.filePath` / `schedule.filePath` を更新。
- 衝突時は `(2)` サフィックスで再試行。
- schedule の日付変更時も同様にリネーム対象（既存の `filePath` と期待パスの差分検出で
  自然にカバーされる）。

---

## 5. データ型 / 設定の変更

### 5.1 `SinSettings` 追加

```ts
export interface SinSettings {
  sinFolder: string;
  weekStartDay: number;
  showIntroAnimation: boolean;
  showNotifications: boolean;
  showStreaks: boolean;
  upcomingDays: number;
  waveAnimationEnabled: boolean;
  // 新規
  allowFutureHabitToggle: boolean;   // 機能 2
  autoRenameFiles: boolean;          // 機能 3 (既定 true)
}
```

`DEFAULT_SETTINGS` (`src/constants.ts`) にも追加する。

### 5.2 設定 UI

`src/settings-tab.ts` に 2 項目を追加:

- 「未来日の習慣チェックを許可」（Toggle）
- 「ファイル名を自動リネーム」（Toggle）
- 「ファイル名を整理する」（Button → 4.4 節のコマンドを呼ぶ）

---

## 6. 実装ステップ

依存を考慮した推奨順:

1. **機能 3 のユーティリティ層** (`toSafeFileName` 追加、`file-manager.ts` の新パス生成を置換)
   - 読み取り経路は変更しないので独立してマージ可能
   - 既存テスト（なければ手動）: 日本語 habit を新規作成 → ファイル名に日本語が入る
2. **機能 3 の自動リネーム対応** (`writeHabit` / `writeSchedule` 拡張)
3. **機能 3 の一括リネームコマンド**
4. **機能 1 のモード分割** (`WaveView` 内部リファクタ + 上部タブ UI)
   - 各 `render*Section` は温存し、呼び出し経路のみ変更
5. **機能 2 の日付状態化** (`currentDate` 追加 + ハンドラ差替)
   - ステップ 4 の `today` モード内で完結
6. **機能 2 の日付ピッカー / ナビ UI**
7. **設定追加**（5 節）
8. **スタイル** (`styles.css`): タブ、ナビゲーションヘッダ、未来/過去バッジ

各ステップ単位で動作確認できる粒度。ステップ 4 と 5 の間で型チェック
（`tsc --noEmit`）と手動スモークテストを行うこと。

---

## 7. 影響範囲サマリー

| ファイル | 変更種別 | 備考 |
|---------|---------|------|
| `src/views/wave-view.ts` | 大幅改修 | モード切替、日付状態、ナビヘッダ |
| `src/main.ts` | 追加 | コマンド 3 つ + 一括リネームコマンド |
| `src/constants.ts` | 追加 | 設定デフォルト |
| `src/types.ts` | 追加 | `SinSettings` 2 フィールド |
| `src/settings-tab.ts` | 追加 | Toggle 2 + Button 1 |
| `src/services/file-manager.ts` | 改修 | `newHabitPath` / `newSchedulePath` / `writeHabit` / `writeSchedule` |
| `src/models/filename.ts` | 新規 | `toSafeFileName` |
| `src/models/schedule.ts` | 削除 | `nameToSlug` 削除 |
| `styles.css` | 追加 | タブ、ナビ、バッジ用クラス |
| `docs/sin-design.md` | 追記 | FR-03 / FR-06 の記述を今回の変更に合わせて更新 |

---

## 8. リスクとオープン事項

1. **iOS / Android の `<input type="date">` 互換性**
   - Obsidian Mobile は WebView。動かない場合は自前ポップオーバーにフォールバック。
2. **ファイル自動リネーム時のリンク切れ**
   - `app.vault.rename` は Obsidian が内部リンクを自動更新するため、Vault 内のリンクは
     基本追従する。外部ツールからの参照は対象外。
3. **既存ユーザーのファイルが混在**
   - 旧英数字スラッグと新日本語ファイル名が併存しても動作はするが、見た目が
     不揃いになる。「ファイル名を整理する」コマンドで解消可能。
4. **モード切替時のアニメーション**
   - `summary` モードで重めのファイル読み込みが発生するので、タブ切替時の
     ローディング表示（スケルトンまたは `読み込み中…`）を追加する。
5. **Intro アニメーション**
   - 現在はビューを開いた直後に一度だけ再生。モード切替のたびに出すと煩わしいので、
     `onOpen` 時のみ維持。
