# 內容表格式

內容表是一個 JSON 檔，副檔名建議用 `.deck.json`。所有文字欄位都是純文字，不接受 HTML；要換行用 `\n`。
欄位打錯字時 `build` 會提醒「不認得欄位」，值不合法時會報錯並且不產檔。

## 最外層

```json
{
  "title": "簡報名稱（顯示在瀏覽器分頁）",
  "theme": { "palette": "bronze", "font": "sans", "radius": 20, "icon": "duo", "surface": "auto" },
  "background": { "style": "contour", "seed": 20261112 },
  "footer": "每頁左下角的小字，可省略",
  "slides": []
}
```

### theme

| 欄位 | 可用值 | 預設 |
|---|---|---|
| `palette` | `bronze` 事務所銅、`ink` 墨底銅金、`blue` 信任藍、`olive` 成長綠、`mist` 晨霧、`dusk` 暮色；或自訂 `{"bg":"#RRGGBB","c":["#深","#中","#淺"]}` | `bronze` |
| `font` | `sans` 黑體、`serif` 明體 | `sans` |
| `radius` | 卡片圓角，px | `20` |
| `icon` | `duo` 線條加淡色填充、`line` 純線條、`offset` 線條加錯位色塊 | `duo` |
| `surface` | 卡片底的預設樣式：`auto`、`tint` 淡色、`solid` 實心、`outline` 線框、`none` 無底 | `auto` |

### background

整份簡報的預設；每一頁也可以放自己的 `background` 覆寫其中幾個欄位。

| 欄位 | 說明 | 預設 |
|---|---|---|
| `style` | `aurora`、`waves`、`contour`、`network`、`steps`，或 `none`（純底色） | `contour` |
| `seed` | 整數。同一個數字永遠得到同一組圖 | `20261112` |
| `vary` | 每一頁自動換種子，紋理才不會每頁一樣。該頁自己寫了 `seed` 就照它的 | `true` |
| `density` | 0 到 1，圖案多寡 | `0.5` |
| `strength` | 0 到 1，圖案濃淡 | `0.6` |
| `scrim` | 文字留白的方式：`content`（依內容位置，紋理留在空的地方）、`left`、`right`、`top`、`bottom`、`center`、`veil`（整面變淡）、`none` | 封面與過場依對齊方向，其他頁面是 `content` |
| `rest` | `scrim` 是 `content` 時，空白處的紋理要淡化多少，0 到 1。越小紋理越明顯 | `0.6` |
| `cover` | `scrim` 是 `content` 時，文字與卡片底下要蓋掉多少紋理，0 到 1。`1` 是完全蓋掉；預設留一點，字的後面還看得到淡淡的紋理 | `0.8` |
| `veil` | `scrim` 是 `veil` 時蓋掉多少，0 到 1 | `0.8` |
| `limit` | 紋理平均可以偏離底色多少（0 到 255）。超過就整張壓淡；數字越小越低調 | 內容頁 `30`，封面與過場 `50` |
| `grain` | 顆粒質感 | `true` |
| `animate` | 背景是否緩慢流動 | `false` |
| `loop` | 流動一圈的秒數 | `20` |

## 各種頁面

每一頁都有 `type`，也都可以加 `background`。

使用者在編輯器裡的調整是存在成品 HTML 的物件上，不會回到內容表；內容表裡沒有記錄位置的欄位。

### cover 封面

```json
{ "type": "cover", "eyebrow": "小標", "title": "主標題", "subtitle": "副標題", "meta": ["講者", "日期"], "align": "left" }
```

`title` 必填。`align` 可用 `left`（預設）或 `center`。

### statement 過場、金句、結尾

```json
{ "type": "statement", "kind": "section", "number": "01", "text": "章節名稱", "sub": "補充說明" }
{ "type": "statement", "kind": "quote", "text": "要讓觀眾記住的那句話", "by": "出處" }
{ "type": "statement", "kind": "closing", "text": "謝謝聆聽", "sub": "補充說明", "meta": ["聯絡方式"] }
```

`text` 必填。`kind` 預設 `section`。`number` 只在 `section` 顯示成大號外框數字。`align` 預設靠左，`closing` 預設置中。

### points 一主題 N 重點

```json
{
  "type": "points",
  "eyebrow": "小標，可省略",
  "title": "這一頁的結論",
  "lead": "引言，可省略",
  "item": "icon",
  "arrange": "auto",
  "surface": "auto",
  "highlight": 2,
  "items": [
    { "title": "重點標題", "body": "說明，可省略", "icon": "target" }
  ],
  "takeaway": "結論列，可省略"
}
```

| 欄位 | 說明 |
|---|---|
| `items` | 必填，2 到 6 項。每項的 `title` 必填 |
| `item` | `icon`（預設）、`number`、`bullet`、`image`、`block`、`metric` |
| `arrange` | `auto`（預設）、`columns`、`rows`、`split` |
| `surface` | 這一頁的卡片底，覆寫主題預設。`bullet` 與 `block` 有自己固定的樣式，不受影響 |
| `highlight` | 強調第幾項，從 1 開始。被強調的那一項變成實心強調色 |
| `align` | `center` 可讓標題區置中 |

各內容型態額外用到的項目欄位：

| `item` | 項目欄位 |
|---|---|
| `icon` | `icon`：圖庫代號，必填。清單在 `runtime/catalog.json` 的 `icons`，有中文名稱與關鍵字可以搜尋 |
| `metric` | `value`：要放大的數字，必填，例如 `"72%"`。`title` 是指標名稱，`body` 是補充 |
| `image` | `image`：圖片路徑（相對於輸出的 HTML），`alt`：替代文字。沒有 `image` 就顯示圖片框 |
| `number`、`bullet`、`block` | 不需要額外欄位，編號自動產生 |

### compare 左右對比

```json
{
  "type": "compare",
  "title": "這一頁的結論",
  "left": { "head": "改造前", "rows": ["第一點", "第二點"] },
  "right": { "head": "改造後", "rows": ["第一點", "第二點"] },
  "highlight": "right",
  "marks": "cross-check",
  "takeaway": "結論列，可省略"
}
```

兩邊各 1 到 6 列，列數可以不同。`highlight`：`right`（預設）、`left`、`none`。`marks`：`cross-check`（左叉右勾，預設）、`dot`、`none`。

## 播放

用瀏覽器直接開啟 HTML，打開時是編輯模式。按右上角「投影」或 `E` 切到播放，Esc 回到編輯。
播放時方向鍵、空白鍵、PageUp、PageDown 換頁；Home、End 跳到頭尾；F 全螢幕；點畫面右側下一頁、左側上一頁。
網址後面加 `?slide=5` 直接到第 5 頁。

只看自動排版的中間檔（`build --light`）網址參數不同：`#5` 到第 5 頁、`?debug` 在放不下的頁面顯示紅色標記。
