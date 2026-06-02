# pikmap

[![Deploy to GitHub Pages](https://github.com/deantw69/pikmap/actions/workflows/deploy.yml/badge.svg)](https://github.com/deantw69/pikmap/actions/workflows/deploy.yml)

🔗 **線上版：https://deantw69.github.io/pikmap/**

一個精簡的 OpenStreetMap 資料查詢工具：勾選想找的地點類型，按 **Run** 後在地圖上看到結果。地點類型對應 Pikmin Bloom 的 [Decor Pikmin](https://www.pikminwiki.com/Decor_Pikmin) 分類；查詢經 [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) 取得。

靈感來自 [overpass-turbo](https://github.com/tyrasd/overpass-turbo)（MIT 授權），但以更小的相依重新實作為基礎骨架，方便客製。

## 技術棧

- [Vite](https://vitejs.dev/) + TypeScript
- [Leaflet](https://leafletjs.com/)（地圖）
- [CodeMirror 6](https://codemirror.net/)（查詢編輯器）
- [osmtogeojson](https://github.com/tyrasd/osmtogeojson)（Overpass JSON → GeoJSON）

## 開發

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # 產出 dist/
pnpm preview    # 預覽正式版
```

## 用法

1. 左側編輯器已帶一個範例查詢（抓目前視野內的咖啡廳）。
2. 把地圖移到想查的區域。
3. 按 **Run ▶**（或 `Ctrl/Cmd + Enter`）執行。
4. 結果會畫在地圖上，點選圖徵可看到 OSM 標籤。

查詢支援 `{{bbox}}` 樣板，執行時會自動換成目前地圖視野。

## 客製方向（檔案對應）

| 想改的東西 | 檔案 |
| --- | --- |
| API endpoint、預設查詢、預設地圖位置、品牌名稱 | `src/config.ts` |
| 查詢送出、樣板展開（`{{bbox}}` 等） | `src/overpass.ts` |
| 底圖、結果圖層樣式、視野工具 | `src/map.ts` |
| 版面、配色、header | `src/style.css`、`index.html` |

## 後續可加

Overpass QL 語法高亮、`{{geocodeArea}}` 等更多樣板、匯出（GeoJSON/GPX/KML）、分享連結、底圖切換。

## 授權

本專案靈感來自 overpass-turbo（Copyright © Martin Raifer，MIT License）。
