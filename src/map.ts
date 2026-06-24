/**
 * 地圖（地圖功能客製點）
 * 底圖、結果圖層樣式、視野相關工具都放這裡。
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { FeatureCollection, Geometry } from "geojson";
import { S2 } from "s2-geometry";
import { MAP_DEFAULT, MARKER_COLOR, S2_GRID_LEVEL, type QueryCategory } from "./config";
import { parseFilter, matchesFilterSet, type FilterConds } from "./classify";
import { initZoomDisplay, initS2Grid } from "./grid";
import { initRangeCircle } from "./circle";
import { initRadar } from "./radar";
import { initMeasure } from "./measure";
import { initSearch } from "./search";
import { initHelp } from "./help";
import { load, save } from "./storage";

interface SavedView {
  center: [number, number];
  zoom: number;
}

let map: L.Map;
let clusterGroup: L.MarkerClusterGroup | null = null; // 群聚開啟時的點狀結果容器
let plainGroup: L.LayerGroup | null = null; // 群聚關閉時的點狀結果容器
let areaLayer: L.FeatureGroup | null = null; // 面／線狀結果的外框
let markers: L.Marker[] = []; // 目前結果的 emoji 標記（依索引對應結果清單）
let clusterEnabled = load<boolean>("cluster", true); // 是否群聚顯示（使用者可切換、會記住）

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
  initHelp(map); // 右上角「？」功能說明
  initZoomDisplay(map); // 右上角 zoom level
  initRangeCircle(map); // zoom 顯示下方：可拖曳的 100m 範圍圓切換鈕
  initRadar(map); // 100m 圓下方：可拖曳的 10km 雷達圓切換鈕（開啟後 Run 改查此範圍）
  initClusterToggle(); // 群聚顯示開關
  initMeasure(map); // 量距離工具
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

/** 取得 Leaflet map 實例（給純點模式等其他模組掛圖層用）。 */
export function getMap(): L.Map {
  return map;
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

/** 移動到某筆結果並打開它的彈窗（給結果清單點擊用）。群聚開啟且被收起時會先展開。 */
export function focusResult(index: number): void {
  const marker = markers[index];
  if (!marker) return;
  if (clusterEnabled && clusterGroup) {
    clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
  } else {
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 17));
    marker.openPopup();
  }
}

/** 切換群聚顯示的右上角按鈕（排在範圍圓鈕下方）。 */
function initClusterToggle(): void {
  const ctrl = new L.Control({ position: "topright" });
  ctrl.onAdd = () => {
    const btn = L.DomUtil.create("button", "cluster-toggle") as HTMLButtonElement;
    btn.type = "button";
    btn.title = "群聚顯示：密集時把標記聚合成數字";
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="10" r="4.2"/><circle cx="15.5" cy="9" r="3.4"/><circle cx="12.5" cy="15.5" r="3.8"/>
    </svg>`;
    const sync = () => {
      btn.classList.toggle("active", clusterEnabled);
      btn.setAttribute("aria-pressed", String(clusterEnabled));
    };
    sync();

    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener("click", () => {
      clusterEnabled = !clusterEnabled;
      save("cluster", clusterEnabled);
      sync();
      if (markers.length) renderMarkers();
    });
    return btn;
  };
  ctrl.addTo(map);
}

/** 依目前群聚設定，把結果標記放進對應容器並掛上地圖。 */
function renderMarkers(): void {
  clusterGroup?.remove();
  clusterGroup = null;
  plainGroup?.remove();
  plainGroup = null;

  if (clusterEnabled) {
    clusterGroup = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
    clusterGroup.addLayers(markers);
    clusterGroup.addTo(map);
  } else {
    plainGroup = L.layerGroup(markers);
    plainGroup.addTo(map);
  }
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

/** 已解析條件的分類（內部用） */
interface ParsedCategory {
  color: string;
  /** filters 解析後：每個 filter 是一組必須全部相符的 [key, value] 條件（AND）；多個 filter 之間為 OR */
  filters: FilterConds[];
}

/**
 * 清掉舊的結果，畫上新的 GeoJSON 並縮放到結果範圍。
 * 點狀結果用 emoji 標記並群聚；面／線狀結果額外畫外框，中心也放一個 emoji 標記。
 * 傳入 styled 時：≥2 個分類會依 tags 比對上色並顯示圖例；<2 個則統一用預設色。
 */
export function showResult(geojson: FeatureCollection, styled: StyledCategory[] = []): ShowResultData {
  clusterGroup?.remove();
  clusterGroup = null;
  plainGroup?.remove();
  plainGroup = null;
  areaLayer?.remove();
  markers = [];

  const useColors = styled.length >= 2;
  const parsed: ParsedCategory[] = styled.map((s) => ({
    color: s.color,
    filters: s.category.filters.map(parseFilter),
  }));

  // 找出某 feature 屬於哪個選取分類（回傳 styled 索引，找不到回 -1）。
  // 只選一種分類時，回傳的結果視為全屬於該分類。
  const categoryIndex = (props: Record<string, unknown>): number => {
    for (let i = 0; i < parsed.length; i++) {
      if (matchesFilterSet(props, parsed[i].filters)) return i;
    }
    return styled.length === 1 ? 0 : -1;
  };

  areaLayer = L.featureGroup();
  const bounds = L.latLngBounds([]);

  const counts = styled.map(() => 0);
  const items: ResultItem[] = [];
  const features = geojson.features ?? [];

  // 所有多邊形外環，用來判斷某點是否落在水面內（剔除大河中央的接縫點）。
  const polyRings = collectPolygonRings(features);

  for (const feature of features) {
    const tags = (feature.properties ?? {}) as Record<string, unknown>;
    const idx = categoryIndex(tags);
    if (idx >= 0) counts[idx]++;
    const cat = idx >= 0 ? styled[idx].category : null;
    const color = useColors && idx >= 0 ? styled[idx].color : MARKER_COLOR;

    // 標記位置：點→自身；面→範圍中心；線→經過的每個 S2 網格各放一個（細長河流沿線分佈）
    let pts: L.LatLng[];
    const geom = feature.geometry;
    if (geom && geom.type === "Point") {
      const [lng, lat] = geom.coordinates;
      pts = [L.latLng(lat, lng)];
    } else {
      // 大河（waterway=river）以中心線表示，落在寬水面正中央 → 中心線本身與 icon 都不畫。
      // 細河道（waterway=stream）才沿線放整排水邊 icon；湖沼面沿岸邊放。
      const isLine = geom?.type === "LineString" || geom?.type === "MultiLineString";
      if (isLine && tags["waterway"] === "river") continue;
      const shape = L.geoJSON(feature, { style: { color, weight: 2, fillOpacity: 0.2 } });
      shape.addTo(areaLayer);
      // 面（河面／湖沼）沿「岸邊」放 icon、線（河道）沿線放 icon。
      const cellPts = edgeCellPoints(geom, S2_GRID_LEVEL, polyRings);
      pts = cellPts.length ? cellPts : [shape.getBounds().getCenter()];
    }

    const popup = tagsPopup(tags);
    const base = markers.length;
    for (const p of pts) {
      const m = L.marker(p, { icon: emojiIcon(cat?.emoji ?? "📍", color) });
      if (popup) m.bindPopup(popup);
      bounds.extend(p);
      markers.push(m);
    }

    // 清單只放一筆，代表座標取中間那個標記（點擊聚焦用）
    const repIdx = Math.floor(pts.length / 2);
    const center = pts[repIdx];
    items.push({
      index: base + repIdx,
      name: featureName(tags) || cat?.label || "(未命名)",
      emoji: cat?.emoji ?? "📍",
      label: cat?.label ?? "其他",
      color,
      latlng: [center.lat, center.lng],
    });
  }

  areaLayer.addTo(map);
  renderMarkers(); // 依目前群聚設定把標記放上地圖

  updateLegend(useColors ? styled : [], counts);

  const count = features.length;
  if (count > 0 && bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });

  const perCategory = styled.map((s, i) => ({
    label: s.category.label,
    emoji: s.category.emoji,
    color: s.color,
    count: counts[i],
  }));
  return { count, perCategory, items };
}

/** 把 tags 組成彈窗表格 HTML（無 tags 回空字串）。 */
function tagsPopup(tags: Record<string, unknown>): string {
  const rows = Object.entries(tags)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");
  return rows ? `<table class="tags">${rows}</table>` : "";
}

/** 產生顯示 emoji 的地圖標記圖示（圓底、分類色外框）。 */
export function emojiIcon(emoji: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "emoji-marker",
    html: `<span class="emoji-pin" style="--pin:${color}">${emoji}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

/**
 * 沿幾何邊緣每個 S2 cell 各取一個點：
 * - 線（LineString）→ 沿線；面（Polygon）→ 沿外環＋內環（岸邊）。
 * 大河面只在兩岸放、中間淨空；細河道兩岸貼近，看起來就是一排水邊 icon。非線非面回 []。
 */
function edgeCellPoints(
  geom: Geometry | null | undefined,
  level: number,
  polyRings?: number[][][],
): L.LatLng[] {
  const isPoly = geom?.type === "Polygon" || geom?.type === "MultiPolygon";
  const lines: number[][][] =
    geom?.type === "LineString"
      ? [geom.coordinates]
      : geom?.type === "MultiLineString"
        ? geom.coordinates
        : geom?.type === "Polygon"
          ? geom.coordinates
          : geom?.type === "MultiPolygon"
            ? geom.coordinates.flat()
            : [];

  const out: L.LatLng[] = [];
  const seen = new Set<string>();
  const STEP_M = 30; // 取樣間距，小於一格(~80m)以免漏格
  const CAP = 500; // 安全上限，避免極長線爆量
  const OFFSET = 12 / 111320; // 兩側測試偏移量（約 12m，換算成緯度度數）

  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      // 面：算此邊的單位法向量，用來把取樣點往兩側偏移，判斷是否為水中接縫。
      const lat0 = (a[1] + b[1]) / 2;
      const cos = Math.cos((lat0 * Math.PI) / 180) || 1;
      let ex = (b[0] - a[0]) * cos;
      let ey = b[1] - a[1];
      const len = Math.hypot(ex, ey) || 1;
      ex /= len;
      ey /= len;
      const offLng = (-ey * OFFSET) / cos; // 法向量 (-ey, ex) 換回經緯度偏移
      const offLat = ex * OFFSET;

      const n = Math.max(1, Math.ceil(L.latLng(a[1], a[0]).distanceTo(L.latLng(b[1], b[0])) / STEP_M));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const lat = a[1] + (b[1] - a[1]) * t;
        const lng = a[0] + (b[0] - a[0]) * t;
        // 面狀：兩側都還在水面內 → 河中央接縫，丟棄；只要一側是陸地才是真正岸邊。
        if (isPoly && polyRings) {
          const s1 = pointInRings(lng + offLng, lat + offLat, polyRings);
          const s2 = pointInRings(lng - offLng, lat - offLat, polyRings);
          if (s1 && s2) continue;
        }
        const key = S2.S2Cell.FromLatLng({ lat, lng }, level).toHilbertQuadkey();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(L.latLng(lat, lng));
          if (out.length >= CAP) return out;
        }
      }
    }
  }
  return out;
}

/** 收集所有多邊形的外環座標（[lng,lat][]），供點是否落在面內的判斷使用。 */
function collectPolygonRings(features: FeatureCollection["features"]): number[][][] {
  const rings: number[][][] = [];
  for (const f of features) {
    const g = f.geometry;
    if (g?.type === "Polygon") rings.push(g.coordinates[0]);
    else if (g?.type === "MultiPolygon") for (const poly of g.coordinates) rings.push(poly[0]);
  }
  return rings;
}

/** 射線法：點 [lng,lat] 是否落在任一多邊形外環內。 */
function pointInRings(lng: number, lat: number, rings: number[][][]): boolean {
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

/** 從 OSM tags 取一個可讀名稱。 */
export function featureName(tags: Record<string, unknown>): string {
  for (const k of ["name:zh", "name:zh-Hant", "name", "name:en", "brand"]) {
    const v = tags[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

let legend: L.Control | null = null;
let legendCollapsed = load<boolean>("legendCollapsed", false); // 圖例是否收合（會記住）

/** 顯示／更新顏色圖例（含各類數量）；只列出數量 > 0 的分類，沒有則移除。可點標題收合。 */
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
    div.classList.toggle("collapsed", legendCollapsed);

    const items = rows
      .map(
        ({ s, n }) =>
          `<div class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>${escapeHtml(
            `${s.category.emoji} ${s.category.label}`,
          )}<span class="legend-count">${n}</span></div>`,
      )
      .join("");
    div.innerHTML =
      `<button type="button" class="legend-toggle" aria-label="收合 / 展開圖例">` +
      `<span class="legend-title">圖例</span>` +
      `<span class="legend-caret">${legendCollapsed ? "▸" : "▾"}</span></button>` +
      `<div class="legend-body">${items}</div>`;

    L.DomEvent.disableClickPropagation(div);
    const caret = div.querySelector(".legend-caret") as HTMLElement;
    div.querySelector(".legend-toggle")!.addEventListener("click", () => {
      legendCollapsed = !legendCollapsed;
      save("legendCollapsed", legendCollapsed);
      div.classList.toggle("collapsed", legendCollapsed);
      caret.textContent = legendCollapsed ? "▸" : "▾";
    });
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
