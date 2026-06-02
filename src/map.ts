/**
 * 地圖（地圖功能客製點）
 * 底圖、結果圖層樣式、視野相關工具都放這裡。
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection, Feature } from "geojson";
import { MAP_DEFAULT, MARKER_COLOR, type QueryCategory } from "./config";
import { initZoomDisplay, initS2Grid } from "./grid";
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

/** 一個被選取、且已配好顏色的分類 */
export interface StyledCategory {
  category: QueryCategory;
  color: string;
}

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
export function showResult(geojson: FeatureCollection, styled: StyledCategory[] = []): number {
  if (resultLayer) {
    resultLayer.remove();
    resultLayer = null;
  }

  const useColors = styled.length >= 2;
  const parsed: ParsedCategory[] = styled.map((s) => ({
    color: s.color,
    filters: s.category.filters.map(parseFilter),
  }));

  const colorFor = (feature?: Feature): string => {
    if (!useColors || !feature) return MARKER_COLOR;
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    for (const cat of parsed) {
      if (featureMatches(props, cat)) return cat.color;
    }
    return MARKER_COLOR;
  };

  resultLayer = L.geoJSON(geojson, {
    style: (feature) => ({ color: colorFor(feature), weight: 2, fillOpacity: 0.2 }),
    pointToLayer: (feature, latlng) => {
      const c = colorFor(feature);
      return L.circleMarker(latlng, {
        radius: 10,
        color: c,
        fillColor: c,
        fillOpacity: 0.5,
        weight: 3,
      });
    },
    onEachFeature: (feature, layer) => {
      const tags = feature.properties ?? {};
      const rows = Object.entries(tags)
        .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
        .join("");
      if (rows) layer.bindPopup(`<table class="tags">${rows}</table>`);
    },
  }).addTo(map);

  updateLegend(useColors ? styled : []);

  const count = geojson.features?.length ?? 0;
  if (count > 0) {
    const bounds = resultLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  }
  return count;
}

let legend: L.Control | null = null;

/** 顯示／更新顏色圖例；傳空陣列則移除。 */
function updateLegend(styled: StyledCategory[]): void {
  if (legend) {
    legend.remove();
    legend = null;
  }
  if (styled.length === 0) return;

  legend = new L.Control({ position: "bottomright" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = styled
      .map(
        (s) =>
          `<div class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>${escapeHtml(
            `${s.category.emoji} ${s.category.label}`,
          )}</div>`,
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
