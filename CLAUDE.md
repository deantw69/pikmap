# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

pikmap 是一個精簡的 OpenStreetMap 資料查詢工具。使用者勾選地點類型（對應 Pikmin Bloom 的 Decor Pikmin 分類），按 Run 後透過 Overpass API 查詢目前地圖視野內的地點並畫在 Leaflet 地圖上。純前端、無後端，部署在 GitHub Pages。

## 常用指令

```bash
pnpm install
pnpm dev        # 開發伺服器 http://localhost:5173（server.host: true，同區網手機可連入）
pnpm build      # tsc --noEmit 型別檢查 + vite build，產出 dist/
pnpm preview    # 預覽正式版
```

- 沒有測試框架；`pnpm build` 內含的 `tsc --noEmit` 是唯一的自動檢查（tsconfig 啟用 strict、noUnusedLocals、noUnusedParameters）。
- 套件管理一律用 pnpm（CI 用 `--frozen-lockfile`）。
- push 到 `main` 由 `.github/workflows/deploy.yml` 自動 build 並部署到 https://deantw69.github.io/pikmap/。

## 架構

進入點 `src/main.ts` 串接三個模組並綁定 Run 流程：

1. `menu.ts` — 依 `config.CATEGORIES` 的 `group` 渲染複選清單，回報勾選的分類。
2. `overpass.ts` `buildQuery()` — 把勾選分類組成 Overpass 查詢（union），執行時 `expandTemplate()` 把 `{{bbox}}` 換成目前地圖視野，`runQuery()` 送出並用 osmtogeojson 轉成 GeoJSON。
3. `map.ts` `showResult()` — 把 GeoJSON 畫到地圖、依分類上色、縮放到結果範圍。

### 關鍵設計

- **`src/config.ts` 是主要客製點**：API endpoint、預設視野、顏色盤、S2 設定，以及最重要的 `CATEGORIES` 陣列。新增/修改地點類型只需改這個陣列，menu 與查詢會自動跟著更新。

- **`CATEGORIES` 的 `filters` 是查詢與上色的共用單一真相來源**。每個 filter 字串是 Overpass 過濾條件（如 `["amenity"="cafe"]`），可串多個方括號做 AND；同一分類的多個 filter 之間是 OR。
  - 查詢端（`buildQuery`）：每個 filter 各成一行 `nwr<filter>({{bbox}})`。
  - 上色端（`map.ts` 的 `parseFilter` / `featureMatches`）：用 regex 反解析同一批 filter 字串，比對 feature 的 tags 決定顏色。**改動 filter 字串格式時這兩端都要顧到。** `featureMatches` 會處理 OSM 以分號分隔的多值（如 `cuisine=japanese;sushi`）。

- **`areaScope`（選用，ISO 3166-1 代碼如 `"JP"`）**：限制某分類結果落在特定國家／地區內。`buildQuery` 會在查詢開頭宣告 `area["ISO3166-1"="JP"]->.area_jp`，並在該分類的 filter 加上 `(area.area_jp)` 與 bbox 取交集。

- **上色規則**：選 <2 個分類用統一色 `MARKER_COLOR`；≥2 個才依 `MARKER_PALETTE` 上色並顯示右下角圖例。顏色在 `main.ts` 依勾選順序配給。

- **狀態持久化**：`storage.ts` 以 `pikmap.` 前綴存 localStorage，全包 try/catch（無痕模式安全）。記住地圖視野（`view`）與選單勾選（`selected`），下次開啟還原。

- **地圖疊加層**（皆在 `map.ts` initMap 時掛載）：
  - `search.ts` — 左上角地址搜尋，用 Nominatim 地理編碼，含 debounce + 序號（`seq`）丟棄過期結果的自動完成下拉。
  - `grid.ts` — 右上角即時 zoom level；zoom ≥ 17 時用 BFS 從中心 cell 擴張畫出 S2 level-17 網格（Pokémon GO / Pikmin Bloom 慣用），上限 `MAX_CELLS` 避免暴衝。

### 外部服務

- Overpass API：`overpass-api.de`（`config.OVERPASS_ENDPOINT`），查詢逾時 30 秒。
- Nominatim：地址搜尋地理編碼。
- OpenStreetMap tiles：底圖。

`CATEGORIES` 的 tag 完全對應 [Decor Pikmin](https://www.pikminwiki.com/Decor_Pikmin) 頁面實際列出的 OSM 標籤，不自行推導增刪。
