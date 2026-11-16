# html-deck

自動排版的 HTML 簡報 Skill。只寫一份內容表（JSON），版面依文字量與項目數自動排好，
產出的單檔 HTML 打開就能拖拉、群組、改字改色，並匯出可編輯的 PPTX。

完整說明在 [SKILL.md](SKILL.md)，內容表格式在 [reference/deck-format.md](reference/deck-format.md)。

## 案例：台灣能源轉型現況

[線上觀看](https://slidefirm.github.io/html-deck-examples/taiwan-energy-2025/)｜[內容表](https://github.com/slidefirm/html-deck-examples/blob/main/taiwan-energy-2025/taiwan-energy.deck.json)｜[更多案例](https://github.com/slidefirm/html-deck-examples)

[![台灣能源轉型現況：自動排版的前 8 頁](https://raw.githubusercontent.com/slidefirm/html-deck-examples/main/taiwan-energy-2025/preview.jpg)](https://slidefirm.github.io/html-deck-examples/taiwan-energy-2025/)

13 頁，從一份約 120 行的內容表自動排版產生，沒有手動調整；數字來自經濟部能源署等公開資料，每頁標出處。
打開網頁就能拖拉編輯、匯出 PPTX。

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
