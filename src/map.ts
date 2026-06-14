/**
 * 地圖（地圖功能客製點）
 * 底圖、結果圖層樣式、視野相關工具都放這裡。
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection } from "geojson";
import { MAP_DEFAULT, MARKER_COLOR, type QueryCategory } from "./config";
import { initZoomDisplay, initS2Grid } from "./grid";
import { initRangeCircle } from "./circle";
import { initSearch } from "./search";
import { load, save } from "./storage";

interface SavedView {
  center: [number, number];
  zoom: number;
}

let map: L.Map;
let resultLayer: L.GeoJSON | null = null;

/** 初始化 Leaflet 地圖並加上 OSM 底圖。 */
export function initMap(el: HTMLElement): L.Map {
  // 還原上次的視野；沒有紀錄就用預設
  const view = load<SavedView | null>("view", null);
  const center = view?.center ?? MAP_DEFAULT.center;
  const zoom = view?.zoom ?? MAP_DEFAULT.zoom;

  map = L.map(el).setView(center, zoom);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  initSearch(map); // 左上角地址搜尋框
  initZoomDisplay(map); // 右上角 zoom level
  initRangeCircle(map); // zoom 顯示下方：可拖曳的 100m 範圍圓切換鈕
  initS2Grid(map); // zoom ≥ 17 顯示 S2 網格

  // 每次平移／縮放後記住目前視野
  map.on("moveend", () => {
    const c = map.getCenter();
    save("view", { center: [c.lat, c.lng], zoom: map.getZoom() } satisfies SavedView);
  });

  return map;
}

/** 版面改變後（例如收合選單）讓 Leaflet 重新計算尺寸並補上圖磚。 */
export function refreshSize(): void {
  map.invalidateSize();
}

/** 回傳目前視野的 Overpass bbox 字串：south,west,north,east。 */
export function getBboxString(): string {
  const b = map.getBounds();
  return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
    .map((n) => n.toFixed(6))
    .join(",");
}

/** 目前地圖中心（沒有定位時當作距離原點）。 */
export function getMapCenter(): L.LatLng {
  return map.getCenter();
}

/** 兩點間距離（公尺）。 */
export function distanceMeters(a: L.LatLngExpression, b: L.LatLngExpression): number {
  return map.distance(a, b);
}

/** 移動到某筆結果並打開它的彈窗（給結果清單點擊用）。 */
export function focusResult(index: number): void {
  const layer = resultLayersByIndex[index];
  if (!layer) return;
  const ll =
    "getLatLng" in layer && typeof (layer as L.Marker).getLatLng === "function"
      ? (layer as L.Marker).getLatLng()
      : (layer as L.Polygon).getBounds().getCenter();
  map.setView(ll, Math.max(map.getZoom(), 17));
  (layer as L.Layer & { openPopup?: () => void }).openPopup?.();
}

/** 一個被選取、且已配好顏色的分類 */
export interface StyledCategory {
  category: QueryCategory;
  color: string;
}

/** 單筆結果（給結果清單顯示／排序用） */
export interface ResultItem {
  /** 對應 resultLayersByIndex 的索引，點擊清單時用來聚焦 */
  index: number;
  name: string;
  emoji: string;
  label: string;
  color: string;
  latlng: [number, number];
}

/** 一次查詢的結果摘要 */
export interface ShowResultData {
  count: number;
  /** 各選取分類在結果中的數量 */
  perCategory: { label: string; emoji: string; color: string; count: number }[];
  items: ResultItem[];
}

/** 結果圖層依索引存放，供 focusResult 點擊聚焦 */
let resultLayersByIndex: L.Layer[] = [];

/** 已解析條件的分類（內部用） */
interface ParsedCategory {
  color: string;
  /** filters 解析後：每個 filter 是一組必須全部相符的 [key, value] 條件（AND）；多個 filter 之間為 OR */
  filters: [string, string][][];
}

/** 把 ["amenity"="restaurant"]["cuisine"="sushi"] 這種字串解析成 [[amenity,restaurant],[cuisine,sushi]]。 */
function parseFilter(filter: string): [string, string][] {
  const pairs: [string, string][] = [];
  const re = /\["([^"]+)"="([^"]+)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter)) !== null) pairs.push([m[1], m[2]]);
  return pairs;
}

/** 判斷某 feature 的 tags 是否符合某分類（任一 filter 的所有條件都相符）。 */
function featureMatches(props: Record<string, unknown>, parsed: ParsedCategory): boolean {
  return parsed.filters.some((conds) =>
    conds.every(([k, v]) => {
      const tag = props[k];
      if (tag === undefined || tag === null) return false;
      const s = String(tag);
      // 處理 OSM 以分號分隔的多值（例如 cuisine=japanese;sushi）
      return s === v || s.split(";").includes(v);
    }),
  );
}

/**
 * 清掉舊的結果，畫上新的 GeoJSON 並縮放到結果範圍。回傳 feature 數量。
 * 傳入 styled 時：≥2 個分類會依 tags 比對上色並顯示圖例；<2 個則統一用預設色。
 */
export function showResult(geojson: FeatureCollection, styled: StyledCategory[] = []): ShowResultData {
  if (resultLayer) {
    resultLayer.remove();
    resultLayer = null;
  }
  resultLayersByIndex = [];

  const useColors = styled.length >= 2;
  const parsed: ParsedCategory[] = styled.map((s) => ({
    color: s.color,
    filters: s.category.filters.map(parseFilter),
  }));

  // 找出某 feature 屬於哪個選取分類（回傳 styled 索引，找不到回 -1）。
  // 只選一種分類時，回傳的結果視為全屬於該分類。
  const categoryIndex = (props: Record<string, unknown>): number => {
    for (let i = 0; i < parsed.length; i++) {
      if (featureMatches(props, parsed[i])) return i;
    }
    return styled.length === 1 ? 0 : -1;
  };

  const counts = styled.map(() => 0);
  const items: ResultItem[] = [];

  resultLayer = L.geoJSON(geojson, {
    style: (feature) => {
      const idx = feature ? categoryIndex((feature.properties ?? {}) as Record<string, unknown>) : -1;
      const c = useColors && idx >= 0 ? styled[idx].color : MARKER_COLOR;
      return { color: c, weight: 2, fillOpacity: 0.2 };
    },
    pointToLayer: (feature, latlng) => {
      const idx = categoryIndex((feature.properties ?? {}) as Record<string, unknown>);
      const c = useColors && idx >= 0 ? styled[idx].color : MARKER_COLOR;
      return L.circleMarker(latlng, {
        radius: 10,
        color: c,
        fillColor: c,
        fillOpacity: 0.5,
        weight: 3,
      });
    },
    onEachFeature: (feature, layer) => {
      const tags = (feature.properties ?? {}) as Record<string, unknown>;
      const rows = Object.entries(tags)
        .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
        .join("");
      if (rows) layer.bindPopup(`<table class="tags">${rows}</table>`);

      const idx = categoryIndex(tags);
      if (idx >= 0) counts[idx]++;

      const index = resultLayersByIndex.length;
      resultLayersByIndex.push(layer);

      // 結果代表座標：點用本身，面／線用範圍中心
      const center =
        "getLatLng" in layer && typeof (layer as L.Marker).getLatLng === "function"
          ? (layer as L.Marker).getLatLng()
          : (layer as L.Polygon).getBounds().getCenter();
      const cat = idx >= 0 ? styled[idx].category : null;
      const c = useColors && idx >= 0 ? styled[idx].color : MARKER_COLOR;
      items.push({
        index,
        name: featureName(tags) || cat?.label || "(未命名)",
        emoji: cat?.emoji ?? "📍",
        label: cat?.label ?? "其他",
        color: c,
        latlng: [center.lat, center.lng],
      });
    },
  }).addTo(map);

  updateLegend(useColors ? styled : [], counts);

  const count = geojson.features?.length ?? 0;
  if (count > 0) {
    const bounds = resultLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  }

  const perCategory = styled.map((s, i) => ({
    label: s.category.label,
    emoji: s.category.emoji,
    color: s.color,
    count: counts[i],
  }));
  return { count, perCategory, items };
}

/** 從 OSM tags 取一個可讀名稱。 */
function featureName(tags: Record<string, unknown>): string {
  for (const k of ["name:zh", "name:zh-Hant", "name", "name:en", "brand"]) {
    const v = tags[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

let legend: L.Control | null = null;

/** 顯示／更新顏色圖例（含各類數量）；只列出數量 > 0 的分類，沒有則移除。 */
function updateLegend(styled: StyledCategory[], counts: number[] = []): void {
  if (legend) {
    legend.remove();
    legend = null;
  }

  const rows = styled
    .map((s, i) => ({ s, n: counts[i] ?? 0 }))
    .filter((r) => r.n > 0);
  if (rows.length === 0) return;

  legend = new L.Control({ position: "bottomright" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = rows
      .map(
        ({ s, n }) =>
          `<div class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>${escapeHtml(
            `${s.category.emoji} ${s.category.label}`,
          )}<span class="legend-count">${n}</span></div>`,
      )
      .join("");
    return div;
  };
  legend.addTo(map);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
