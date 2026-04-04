# Sin - 予定・習慣トラッカー 設計書

## 1. コンセプト

### 1.1 Sin とは

Sin は Obsidian プラグインとして動作する**時間管理ベースの予定・習慣トラッカー**である。

- **Abyss** = 突発的な思いつき → 思考キャプチャから行動へ
- **Sin** = 時間管理 → 行動の習慣化・継続化

Sin の名前はサイン波 (sine wave) に由来する。横軸を「時間の流れ」、繰り返す波を「行動」に見立て、習慣の周期性と時間の連続性を表現する。

### 1.2 Abyss との差別化

| 観点 | Abyss | Sin |
|------|-------|-----|
| 対象 | 突発的な思いつき・単発タスク | 定期的な習慣・日時指定の予定 |
| 時間軸 | なし（発生時刻のみ記録） | 中心（周期・スケジュール管理） |
| 操作感 | 素早いキャプチャ特化 | 一覧性・視認性特化 |
| UI | モーダル + サイドバー | フルスクリーンタブビュー |
| データ | 単一ログファイル | 複数マークダウンファイル |

### 1.3 Sin が解決する課題

1. 日次・週次などの繰り返し行動の管理（Abyss では毎回手動入力が必要）
2. 日時が決まっている予定の可視化（Abyss には時間軸ベースの表示がない）
3. 習慣の継続状況の把握（ストリーク、達成率）

---

## 2. 要件定義

### 2.1 機能要件

#### FR-01: 習慣 (Habit) 管理

- 習慣の作成・編集・削除・アーカイブ
- 周期タイプ: `daily` (日課), `weekly` (週課), `monthly` (月課), `custom` (N日ごと)
- 週課の場合は曜日指定（複数選択可）
- 月課の場合は日付指定（複数選択可）
- 習慣ごとにアイコン (絵文字) とカラーを設定可能
- 習慣の達成記録（完了/未完了のトグル）
- ストリーク（連続達成日数）の自動計算と表示

#### FR-02: 予定 (Schedule) 管理

- 予定の作成・編集・削除
- 日時指定（日付 + 任意で時刻）
- 終日予定の対応
- 予定ごとにアイコン (絵文字) を設定可能
- メモ欄（予定に関する補足情報）

#### FR-03: メインビュー (Wave View)

- フルスクリーンタブビューとして実装
- **今日のセクション**: 本日の習慣チェックリスト + 本日の予定一覧
- **波形タイムライン**: 時間軸に沿った予定の可視化
- 習慣の完了/未完了をワンクリックでトグル
- ビュー表示前に起動アニメーション（波が広がるイントロ）

#### FR-04: 習慣追加モーダル

- 習慣名、周期タイプ、アイコン、カラーの入力
- 周期タイプに応じた動的フォーム（曜日選択、日付選択など）

#### FR-05: 予定追加モーダル

- 予定名、日時、アイコン、メモの入力
- 日付ピッカーと時刻ピッカー

#### FR-06: 未来の予定ビュー (Upcoming View)

- 今後の予定・習慣を時系列で表示するサブビュー
- メインビュー内のナビゲーションまたはモーダルで表示

#### FR-07: データ永続化

- 習慣・予定データを Vault 内のマークダウンファイルとして保存
- ユーザが手動でファイルを編集可能な構造
- Obsidian の検索・リンク機能との互換性

#### FR-08: 設定

- Sin 用フォルダパスのカスタマイズ
- 週の開始曜日の設定（月曜/日曜）
- 通知の ON/OFF
- 起動アニメーションの ON/OFF

### 2.2 非機能要件

#### NFR-01: パフォーマンス

- メインビューの初期表示: 500ms 以内（アニメーション除く）
- 習慣トグルのレスポンス: 100ms 以内
- ファイル I/O は非同期で UI をブロックしない

#### NFR-02: データ整合性

- ファイル書き込み時の競合を防止（排他制御）
- 不正なフロントマターに対するフォールバック処理

#### NFR-03: 互換性

- Obsidian 最小バージョン: 0.15.0
- Abyss プラグインと共存可能（フォルダ・コマンド名の衝突なし）
- Obsidian のテーマ（ダーク/ライト）に対応

#### NFR-04: レスポンシブ対応

- PC（デスクトップ版）、タブレット、スマートフォン（Obsidian Mobile）の全環境で動作
- ペイン分割時にもビューが崩れないこと
- タッチ操作とマウス操作の両方に対応

---

## 3. データモデル

### 3.1 フォルダ構造

```
Vault/
└── Sin/
    ├── habits/
    │   ├── morning-run.md
    │   ├── read-book.md
    │   └── ...
    ├── schedules/
    │   ├── 2026-04-10_dentist.md
    │   ├── 2026-04-15_team-meeting.md
    │   └── ...
    └── logs/
        ├── 2026-04.md      ← 月次の達成ログ
        ├── 2026-03.md
        └── ...
```

- **`habits/`**: 習慣定義ファイル（1習慣 = 1ファイル）
- **`schedules/`**: 予定ファイル（1予定 = 1ファイル）、ファイル名は `YYYY-MM-DD_slug.md`
- **`logs/`**: 月次の達成ログ（習慣の完了記録を集約）

### 3.2 習慣ファイル (Habit File) フォーマット

```markdown
---
sin: habit
name: 朝のランニング
icon: 🏃
color: "#4ECDC4"
cycle: daily
created: 2026-04-01
archived: false
---

# 朝のランニング

毎朝30分のランニングをする。
雨の日はストレッチに置き換え。
```

**週課の場合:**

```markdown
---
sin: habit
name: 週次レビュー
icon: 📋
color: "#FFE66D"
cycle: weekly
days: [fri]
created: 2026-04-01
archived: false
---
```

**カスタム周期の場合:**

```markdown
---
sin: habit
name: 植物の水やり
icon: 🌱
color: "#95E1D3"
cycle: custom
interval: 3
created: 2026-04-01
archived: false
---
```

**フロントマター定義:**

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `sin` | `"habit"` | ✅ | ファイル種別識別子 |
| `name` | `string` | ✅ | 習慣名 |
| `icon` | `string` | ✅ | 絵文字アイコン |
| `color` | `string` | ✅ | HEX カラーコード |
| `cycle` | `"daily" \| "weekly" \| "monthly" \| "custom"` | ✅ | 周期タイプ |
| `days` | `string[]` | 週課時 | 曜日 (`mon`, `tue`, ..., `sun`) |
| `dates` | `number[]` | 月課時 | 日付 (1-31) |
| `interval` | `number` | カスタム時 | 間隔日数 |
| `created` | `string` | ✅ | 作成日 (YYYY-MM-DD) |
| `archived` | `boolean` | ✅ | アーカイブ状態 |

### 3.3 予定ファイル (Schedule File) フォーマット

```markdown
---
sin: schedule
name: 歯医者
icon: 🦷
date: 2026-04-10
time: "14:30"
allDay: false
done: false
---

# 歯医者

定期検診。保険証を忘れずに。
```

**フロントマター定義:**

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `sin` | `"schedule"` | ✅ | ファイル種別識別子 |
| `name` | `string` | ✅ | 予定名 |
| `icon` | `string` | ✅ | 絵文字アイコン |
| `date` | `string` | ✅ | 日付 (YYYY-MM-DD) |
| `time` | `string` | - | 時刻 (HH:MM)、省略時は終日 |
| `allDay` | `boolean` | ✅ | 終日フラグ |
| `done` | `boolean` | ✅ | 完了フラグ |

### 3.4 達成ログファイル (Log File) フォーマット

月ごとに1ファイル。習慣の日次達成記録を蓄積する。

```markdown
---
sin: log
month: 2026-04
---

# 2026-04 達成ログ

## 2026-04-04

- [x] 🏃 朝のランニング
- [ ] 📖 読書
- [x] 🌱 植物の水やり

## 2026-04-03

- [x] 🏃 朝のランニング
- [x] 📖 読書

## 2026-04-02

- [x] 🏃 朝のランニング
- [ ] 📖 読書
- [x] 📋 週次レビュー
```

ログは `- [x]` / `- [ ]` の Obsidian チェックボックス形式を使用し、Obsidian のプレビューモードでも視認性を確保する。

---

## 4. プラグインアーキテクチャ

### 4.1 モジュール構成

```
src/
├── main.ts                  # プラグインエントリポイント
├── types.ts                 # 型定義
├── constants.ts             # 定数・デフォルト値
├── settings-tab.ts          # 設定タブ
│
├── models/
│   ├── habit.ts             # Habit モデル・バリデーション
│   └── schedule.ts          # Schedule モデル・バリデーション
│
├── services/
│   ├── file-manager.ts      # ファイル I/O (CRUD)
│   ├── habit-tracker.ts     # 習慣の達成判定・ストリーク計算
│   └── schedule-manager.ts  # 予定の取得・フィルタリング
│
├── views/
│   ├── wave-view.ts         # メインビュー (フルスクリーンタブ)
│   ├── wave-intro.ts        # 起動アニメーション
│   ├── today-section.ts     # 今日の習慣 + 予定セクション
│   ├── timeline-section.ts  # 波形タイムラインセクション
│   └── upcoming-section.ts  # 未来の予定セクション
│
├── modals/
│   ├── habit-modal.ts       # 習慣追加・編集モーダル
│   └── schedule-modal.ts    # 予定追加・編集モーダル
│
└── ui/
    ├── wave-animation.ts    # 波アニメーション (Canvas/CSS)
    ├── components.ts        # 共通 UI コンポーネント
    └── theme.ts             # テーマ・カラー管理
```

### 4.2 クラス設計

```
SinPlugin (main.ts)
├── SinSettings
├── SinFileManager
│   ├── readHabits() → Habit[]
│   ├── readSchedules(range) → Schedule[]
│   ├── readLog(month) → LogEntry[]
│   ├── writeHabit(habit) → void
│   ├── writeSchedule(schedule) → void
│   └── writeLog(date, entries) → void
│
├── HabitTracker
│   ├── getTodayHabits() → TodayHabit[]
│   ├── toggleCompletion(habit, date) → void
│   ├── getStreak(habit) → number
│   └── getCompletionRate(habit, range) → number
│
├── ScheduleManager
│   ├── getTodaySchedules() → Schedule[]
│   ├── getUpcoming(days) → Schedule[]
│   └── markDone(schedule) → void
│
└── WaveView
    ├── TodaySection
    │   ├── HabitChecklist
    │   └── ScheduleList
    ├── TimelineSection
    └── UpcomingSection
```

### 4.3 データフロー

```
[Markdown Files]
       ↕ read/write
[SinFileManager]  ← frontmatter parse / serialize
       ↕
[HabitTracker / ScheduleManager]  ← ビジネスロジック
       ↕
[WaveView]  ← DOM 構築・イベントハンドリング
       ↕
[User Interaction]
```

### 4.4 技術スタック

Abyss と同一のビルド環境を使用:

- TypeScript 4.7+
- esbuild (バンドラー)
- Obsidian API (Plugin, ItemView, Modal, etc.)
- 純粋な DOM 操作（React/Vue 不使用）
- CSS カスタムプロパティ（Obsidian テーマ連携）

---

## 5. UI/UX 設計

### 5.1 デザインコンセプト

**波 (Wave) を基調とした流動的なデザイン**

- 背景に常時アニメーションする波形を配置し、「流れる時間」を表現
- コンポーネントの境界線やセパレータに波形のカーブを使用
- トグルやボタンのインタラクションに波紋 (ripple) エフェクトを使用
- 配色はオーシャン系のグラデーション（テーマカラーを尊重しつつ）

### 5.2 起動アニメーション (Wave Intro)

メインビューの表示前に再生される短いアニメーション:

1. 画面中央から 1本の波形線が水平に伸びる (0.3s)
2. 波が振動を開始し、サイン波のうねりが発生 (0.5s)
3. 波が画面全体に広がりながらフェードし、メインビューが出現 (0.4s)

合計約 1.2 秒。設定で無効化可能。

### 5.3 メインビュー (Wave View) レイアウト

```
┌─────────────────────────────────────────────────────┐
│  ～～～ 波形背景アニメーション (常時) ～～～            │
│                                                     │
│  ┌─── 今日 (YYYY/MM/DD ddd) ──────────────────────┐ │
│  │                                                 │ │
│  │  ── 習慣 ──────────────────────────────────     │ │
│  │  [✅] 🏃 朝のランニング      🔥 12日連続      │ │
│  │  [  ] 📖 読書                🔥 3日連続       │ │
│  │  [✅] 🌱 植物の水やり         -               │ │
│  │                                                 │ │
│  │  ── 予定 ──────────────────────────────────     │ │
│  │  14:30  🦷 歯医者                              │ │
│  │  19:00  🍽️ 夕食会                              │ │
│  │                                                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─── 今後の予定 ─────────────────────────────────┐ │
│  │  04/10 (金)  🦷 歯医者                         │ │
│  │  04/12 (日)  🎂 誕生日パーティー                │ │
│  │  04/15 (火)  📊 チームミーティング              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│        [+ 習慣を追加]    [+ 予定を追加]              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.4 波形背景アニメーション

Canvas または CSS で実装する常時アニメーション:

```
技法: Canvas 2D API を使用
描画: 複数のサイン波を重ね合わせて有機的な波形を生成
速度: ゆっくり (1周期 = 4〜6秒)
透明度: 低め (0.03〜0.08) で背景に溶け込ませる
カラー: Obsidian テーマの --interactive-accent を基調
レイヤー: 3〜4 層の波を異なる周期・振幅で重ねる
```

波形パラメータ例:

```typescript
const WAVE_LAYERS = [
  { amplitude: 40, frequency: 0.02, speed: 0.015, opacity: 0.06 },
  { amplitude: 25, frequency: 0.03, speed: 0.020, opacity: 0.04 },
  { amplitude: 15, frequency: 0.05, speed: 0.025, opacity: 0.03 },
];
```

### 5.5 インタラクションデザイン

**習慣チェックボックス:**
- タップ/クリックで完了トグル
- 完了時: 波紋エフェクト + チェックマークのスケールアニメーション
- 未完了に戻す: フェードアウトアニメーション

**カード要素:**
- ホバー時: 微かな浮遊 (translateY -2px) + シャドウ拡大
- 波打つ下線のアンダーライン効果をセクション見出しに適用

**追加ボタン:**
- 波形の輪郭を持つボタンデザイン (border-radius で波風のカーブ)
- ホバー時にボタン内の波アニメーションが加速

### 5.6 CSS カスタムプロパティ

```css
/* Sin テーマ変数 (Obsidian テーマと連携) */
--sin-primary: var(--interactive-accent);
--sin-bg: var(--background-primary);
--sin-bg-secondary: var(--background-secondary);
--sin-text: var(--text-normal);
--sin-text-muted: var(--text-muted);
--sin-border: var(--background-modifier-border);

/* Sin 固有カラー */
--sin-wave-color: var(--interactive-accent);
--sin-streak-color: #FF6B6B;
--sin-success-color: #4ECDC4;
--sin-schedule-color: #FFE66D;
```

### 5.7 レスポンシブデザイン

#### 対応環境

| 環境 | ビューポート幅 | 備考 |
|------|---------------|------|
| PC (フル幅) | 800px〜 | サイドバー閉じ状態 |
| PC (ペイン分割) | 300px〜800px | 2〜3ペイン利用時 |
| タブレット | 600px〜1024px | Obsidian Mobile (iPad 等) |
| スマートフォン | 300px〜600px | Obsidian Mobile (iPhone/Android) |

#### 実装方針: CSS Container Queries

Obsidian ではサイドバーやペイン分割によりビューポート幅とビューの実際の幅が一致しない。`@media` クエリではなく **CSS Container Queries** (`@container`) を使用し、Wave View のコンテナ幅に応じてレイアウトを適応させる。

```css
/* Wave View のルートコンテナ */
.sin-wave-view {
  container-type: inline-size;
  container-name: sin-root;
}

/* コンテナ幅に応じたブレークポイント */
@container sin-root (min-width: 640px) {
  /* Wide: 習慣と予定を横並び */
  .sin-today-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
}

@container sin-root (max-width: 639px) {
  /* Narrow: 縦積みレイアウト */
  .sin-today-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
}

@container sin-root (max-width: 400px) {
  /* Compact: ストリーク表示を省略、余白を圧縮 */
  .sin-streak { display: none; }
  .sin-section { padding: 8px; }
}
```

#### ブレークポイント定義

| 名称 | コンテナ幅 | レイアウト |
|------|-----------|-----------|
| **Wide** | 640px 以上 | 習慣と予定を2カラムグリッド表示。今後の予定も横配置。 |
| **Medium** | 400px〜639px | 全セクション縦積み。ストリーク表示は維持。 |
| **Compact** | 400px 未満 | 縦積み + 余白圧縮。ストリーク非表示。フォント縮小。 |

#### レスポンシブレイアウト: Wide (640px〜)

```
┌──────────────────────────────────────────────┐
│ 今日 (2026/04/04 金)                          │
│ ┌─── 習慣 ───────────┬─── 予定 ────────────┐ │
│ │ [✅] 🏃 ランニング  │ 14:30 🦷 歯医者     │ │
│ │ [  ] 📖 読書       │ 19:00 🍽️ 夕食会     │ │
│ │ [✅] 🌱 水やり      │                     │ │
│ └────────────────────┴─────────────────────┘ │
│ ┌─── 今後の予定 ─────────────────────────────┐ │
│ │ 04/10 🦷 歯医者  │ 04/12 🎂 パーティー   │ │
│ └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

#### レスポンシブレイアウト: Compact (〜400px)

```
┌──────────────────────┐
│ 今日 (04/04 金)       │
│ ── 習慣 ──────────── │
│ [✅] 🏃 ランニング    │
│ [  ] 📖 読書         │
│ [✅] 🌱 水やり        │
│ ── 予定 ──────────── │
│ 14:30 🦷 歯医者      │
│ 19:00 🍽️ 夕食会      │
│ ── 今後 ──────────── │
│ 04/10 🦷 歯医者      │
│ 04/12 🎂 パーティー   │
│ [+ 習慣] [+ 予定]    │
└──────────────────────┘
```

#### タッチ操作への対応

- **タップターゲット**: 全インタラクティブ要素のタップ領域を最低 44x44px 確保 (Apple HIG / WCAG 準拠)
- **ホバー → アクティブ**: `@media (hover: hover)` でホバーエフェクトを PC のみに限定。タッチ端末では `:active` 状態のフィードバックを使用
- **スワイプ**: モバイルでは習慣アイテムの左スワイプで編集/アーカイブアクション表示（将来の Phase 3 で検討）
- **長押し**: 習慣・予定の長押しで編集モーダルを表示

```css
/* ホバーエフェクトは pointer デバイスのみ */
@media (hover: hover) and (pointer: fine) {
  .sin-habit-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

/* タッチ端末向けフィードバック */
@media (hover: none) {
  .sin-habit-item:active {
    background: var(--sin-bg-secondary);
    transition: background 0.1s;
  }
}
```

#### 波形アニメーションの適応

- **PC / タブレット**: Canvas 描画で複数レイヤーの波形を描画
- **スマートフォン / 低幅ペイン**: 波のレイヤー数を削減（3層 → 1層）し、`requestAnimationFrame` のフレームレートを抑制してバッテリー消費を軽減
- **`prefers-reduced-motion`**: OS のアクセシビリティ設定を尊重し、アニメーションを無効化

```css
@media (prefers-reduced-motion: reduce) {
  .sin-wave-canvas { display: none; }
  .sin-wave-intro { animation: none; }
}
```

---

## 6. コマンド・ホットキー

| コマンド ID | 説明 | デフォルトホットキー |
|------------|------|---------------------|
| `sin:open-wave-view` | Wave View を開く | `Cmd/Ctrl + Shift + W` |
| `sin:add-habit` | 習慣追加モーダルを開く | - |
| `sin:add-schedule` | 予定追加モーダルを開く | - |
| `sin:toggle-today` | 今日の習慣トグル（クイックアクセス） | - |

リボンアイコン: 波形アイコン (〰️ または SVG カスタムアイコン)

---

## 7. 設定項目

| 設定 | 型 | デフォルト | 説明 |
|------|------|-----------|------|
| `sinFolder` | `string` | `"Sin"` | Sin データフォルダのパス |
| `weekStartDay` | `0-6` | `1` (月曜) | 週の開始曜日 |
| `showIntroAnimation` | `boolean` | `true` | 起動アニメーションの表示 |
| `showNotifications` | `boolean` | `true` | 通知の表示 |
| `showStreaks` | `boolean` | `true` | ストリーク表示 |
| `upcomingDays` | `number` | `14` | 今後の予定の表示日数 |
| `waveAnimationEnabled` | `boolean` | `true` | 背景波アニメーションの表示 |

---

## 8. 実装フェーズ

### Phase 1: 基盤 (MVP)

- プラグイン骨格 (main.ts, types.ts, constants.ts, settings-tab.ts)
- データモデル (Habit, Schedule)
- ファイルマネージャ (CRUD 操作)
- メインビュー (Wave View) の基本レイアウト
- 習慣チェックリスト表示・トグル
- 今日の予定表示
- 習慣追加モーダル
- 予定追加モーダル

### Phase 2: 体験強化

- 起動アニメーション (Wave Intro)
- 背景波アニメーション (Canvas)
- ストリーク計算・表示
- 未来の予定ビュー (Upcoming)
- インタラクションアニメーション (リップル、トグル)
- 達成ログの自動生成

### Phase 3: 洗練

- 習慣の達成率統計
- 習慣の編集・アーカイブ
- 予定の編集・完了
- ウィークリー/マンスリーの達成サマリー
- URI プロトコルハンドラ (`obsidian://sin-open-wave-view`)
- パフォーマンス最適化

---

## 9. Abyss との共存

- フォルダ: `Abyss/` と `Sin/` で完全分離
- コマンド: `abyss:*` と `sin:*` で名前空間を分離
- CSS: `.sin-*` プレフィックスで Abyss のスタイルと衝突しない
- ビュータイプ: `sin-wave-view` で Abyss のビュータイプと衝突しない
- 両プラグインを同時に有効化しても干渉しない設計
