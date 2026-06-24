# 變更紀錄 Changelog

本專案的所有重要變更都會記錄在此檔案。
版本格式採用 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### 新增 Added

- **功能說明畫面**：右上角最上方新增「？」說明鈕，點開浮出 modal，逐項說明右側各功能按鈕（定位、100m 圓、10km 雷達圓、群聚、量距離、已存結果、縮放等級 / S2 網格）。內容由 `help.ts` 的 `FEATURES` 陣列驅動，日後新增功能只需在陣列加一筆。
- **已存結果**：右上角新增「已存結果」書籤鈕（量距鈕下方），點開浮出面板可把目前查詢結果整組存起來、可存多組並各自命名（支援改名、刪除）。之後點選某一組即直接重畫顯示，**完全不再呼叫 Overpass API**。資料以 localStorage 持久化（key `savedSearches`），重整頁面後仍在。
- **10km 雷達圓**：右上角新增可拖曳的 10km 範圍圓切換鈕（藍色，100m 圓鈕下方），中心有可拖曳的對位點，且不限制在當前畫面內、可超出視野。開啟後 Run 改成在此圓範圍內搜尋（Overpass `around`）；關閉則恢復用畫面視野查詢。
- 頂部列加入選單收合 / 展開鈕（☰），收起後地圖佔滿畫面，手機小螢幕更好用。

## [1.1.0] - 2026-06-02

### 新增 Added

- **GitHub Pages 自動部署**：push 到 `main` 由 GitHub Actions 自動 build 並部署到
  https://deantw69.github.io/pikmap/ 。
- **MIT LICENSE**。

### 變更 Changed

- dev server 開放區網存取（`server.host: true`），同 Wi-Fi 的手機可用本機 IP 連入測試。
- build 時 base 改為 `/pikmap/`（GitHub Pages 子路徑）；dev / preview 仍用根路徑。

## [1.0.0] - 2026-06-02

第一版。一個精簡的 OpenStreetMap 資料查詢工具，靈感來自 overpass-turbo，
查詢以可勾選的選單呈現（地點類型對應 Pikmin Bloom 的 Decor Pikmin 分類）。

### 新增 Added

- **專案骨架**：Vite + TypeScript + Leaflet，pnpm 管理，可 `pnpm dev / build / preview`。
- **地點類型選單**：取代自由文字編輯器，以可複選的勾選清單呈現，分為
  美食 / 購物 / 自然 / 休閒文化 / 生活機能 / 交通 六個區塊，共 39 個分類。
  各分類的 OSM 標籤完全對應 [Decor Pikmin](https://www.pikminwiki.com/Decor_Pikmin)
  頁面所列的 tag。
- **查詢產生與執行**：勾選後以 union 組出 Overpass 查詢（`out geom;`），
  支援 `{{bbox}}` 樣板（自動帶入目前地圖視野），送至 Overpass API 並以
  osmtogeojson 轉成 GeoJSON 顯示。含查詢預覽、`Ctrl/Cmd + Enter` 快捷執行。
- **結果分類上色**：選 2 種以上類型時，依 OSM 標籤比對為各分類的結果圈圈上不同顏色，
  並在右下角顯示顏色圖例。
- **Zoom level 顯示**：地圖右上角即時顯示目前縮放等級（白底深字）。
- **S2 網格**：縮放至 level 17 以上時，疊上 OpenStreetMap S2 cell（level 17）網格。
- **狀態記憶**：以 localStorage 記住地圖視野（中心 + 縮放）與選單勾選，下次開啟還原。

### 備註 Notes

- 底圖使用 OpenStreetMap 圖磚，預設 Overpass endpoint 為 `overpass-api.de`。
- 可調整項集中於 [src/config.ts](src/config.ts)（分類清單、顏色盤、S2 設定、預設視野等）。
