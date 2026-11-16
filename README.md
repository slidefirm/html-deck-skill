# html-deck

自動排版的 HTML 簡報 Skill。只寫一份內容表（JSON），版面依文字量與項目數自動排好，
產出的單檔 HTML 打開就能拖拉、群組、改字改色，並匯出可編輯的 PPTX。

完整說明在 [SKILL.md](SKILL.md)，內容表格式在 [reference/deck-format.md](reference/deck-format.md)。

## 需要的東西

- Node 22 以上
- Chrome 或 Edge（產檔與檢查時用無頭模式開啟）
- 產檔與觀看時要有網路（字型用 Google Fonts 的思源黑體）

不需要安裝任何 npm 套件，也不依賴其他專案。

## 安裝

把這個儲存庫放到 Skill 資料夾，資料夾名稱用 `html-deck`。

給 Claude Code 用（所有專案都能用）：

```bash
git clone https://github.com/slidefirm/html-deck-skill.git ~/.claude/skills/html-deck
```

只給某個專案用，就放在那個專案的 `.claude/skills/html-deck`（Claude）或 `.agents/skills/html-deck`（Codex）。

## 試跑

在 Skill 資料夾裡：

```bash
node scripts/build.mjs examples/demo.deck.json -o demo/index.html
```

```bash
node scripts/check.mjs demo/index.html --shots demo/qa
```

用 Chrome 或 Edge 打開 `demo/index.html`。

## 資料夾

| 資料夾 | 內容 |
|---|---|
| `runtime/` | 自動排版、背景、烘焙 |
| `editor/` | 播放器外殼、編輯器、PPTX 匯出（內含 PptxGenJS，授權見 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)） |
| `scripts/` | `build` 產檔、`check` 檢查、`selftest` 自我測試 |
| `reference/`、`examples/` | 內容表格式與 22 頁示範 |

改過 `runtime/`、`editor/` 或 `scripts/` 之後，跑一次 `node scripts/selftest.mjs`。
