/**
 * 純點模式（獨立模式）。
 * 找出每個 S2 L17 格內只含「單一分類」的純點格：
 *  - 掃描以 S2 L14 塊為單位（全分類 + out center），逐塊查詢並快取（見 purecache）。
 *  - 判純在 L17：某格不重複分類數 == 1 即為純點格。
 *  - LOD：zoom < PURE_MIN_ZOOM 提示放大；PURE_MIN_ZOOM~ 畫色塊+emoji；>= PURE_ICON_ZOOM 改畫各點小 icon。
 * 移動/縮放只重畫（讀快取），不重查；掃描一律由「掃描此區」手動觸發。
 */
import L from "leaflet";
import { S2, type S2Cell } from "s2-geometry";
import type { FeatureCollection } from "geojson";
import {
  CATEGORIES,
  MARKER_PALETTE,
  PURE_SCAN_LEVEL,
  PURE_CELL_LEVEL,
  PURE_MIN_ZOOM,
  PURE_ICON_ZOOM,
  PURE_SCAN_CONFIRM,
  type QueryCategory,
} from "./config";
import { resolveCategory } from "./classify";
import { buildScanQuery, runQuery } from "./overpass";
import { getMap, emojiIcon, featureName } from "./map";
import { getTiles, putTile, clearTiles, type PoiRec } from "./purecache";

/** 一次掃描的硬上限，避免極低 zoom 時 BFS 暴衝 */
const MAX_TILES = 600;
/** 對 Overpass 友善：每塊查詢之間的間隔（毫秒），避免短時間請求過多被封 */
const SCAN_DELAY_MS = 1000;
/** 連續失敗達此次數就中止整個掃描（多半是被限流／忙碌，繼續送只會更糟） */
const SCAN_ABORT_FAILS = 3;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const CAT_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

// 色塊顏色依「群組」分配（同群同色；色塊看群、emoji 看細類）
const GROUP_COLOR = (() => {
  const groups: string[] = [];
  for (const c of CATEGORIES) if (!groups.includes(c.group)) groups.push(c.group);
  const m = new Map<string, string>();
  groups.forEach((g, i) => m.set(g, MARKER_PALETTE[i % MARKER_PALETTE.length]));
  return m;
})();
function colorFor(cat: QueryCategory): string {
  return GROUP_COLOR.get(cat.group) ?? MARKER_PALETTE[0];
}

let active = false;
let scanning = false;
let renderSeq = 0;
let cellLayer: L.LayerGroup | null = null; // 色塊 + 中心 emoji（13–16）
let iconLayer: L.LayerGroup | null = null; // 各點小 icon（>= 17）
let hintControl: L.Control | null = null;
let progressEl: HTMLElement | null = null;
let setStatus: (msg: string, isError?: boolean) => void = () => {};

/** 建立純點控制項（側欄）並掛上地圖圖層與監聽。 */
export function initPure(container: HTMLElement, onStatus: (msg: string, isError?: boolean) => void): void {
  setStatus = onStatus;

  container.innerHTML = "";
  const desc = document.createElement("p");
  desc.className = "panel-hint";
  desc.textContent =
    "找出每個 S2 格內只含單一類型的「純點格」。移到想看的區域按「掃描此區」；放大到 17 以上會顯示各點實際位置。";

  const toolbar = document.createElement("div");
  toolbar.className = "pure-toolbar";
  toolbar.append(
    button("掃描此區", "pure-primary", () => void scan(false)),
    button("重新整理此區", "", () => void scan(true)),
  );

  const clearBtn = button("清除快取", "link-btn", async () => {
    await clearTiles();
    render();
    setStatus("已清除純點快取");
  });

  progressEl = document.createElement("p");
  progressEl.className = "pure-progress";

  container.append(desc, toolbar, clearBtn, progressEl);

  const map = getMap();
  cellLayer = L.layerGroup();
  iconLayer = L.layerGroup();
  map.on("moveend", () => {
    if (active) render();
  });
}

/** 切換純點模式的啟用狀態。 */
export function setPureActive(on: boolean): void {
  active = on;
  const map = getMap();
  if (on) {
    cellLayer?.addTo(map);
    iconLayer?.addTo(map);
    render();
  } else {
    cellLayer?.remove();
    iconLayer?.remove();
    clearHint();
  }
}

// ── 掃描 ──

async function scan(force: boolean): Promise<void> {
  if (scanning) return;
  const map = getMap();
  if (map.getZoom() < PURE_MIN_ZOOM) {
    setStatus(`請放大到 zoom ${PURE_MIN_ZOOM} 以上再掃描`, true);
    return;
  }

  const tiles = viewTiles();
  let todo = tiles;
  if (!force) {
    const cached = await getTiles(tiles.map((t) => t.id));
    todo = tiles.filter((t) => !cached.has(t.id));
  }
  if (todo.length === 0) {
    setStatus("此區已是最新（皆有快取）");
    render();
    return;
  }
  if (todo.length > PURE_SCAN_CONFIRM && !confirm(`此範圍需掃描 ${todo.length} 塊，可能需要一些時間，是否繼續？`)) {
    return;
  }

  scanning = true;
  setStatus("掃描中…");
  let done = 0;
  let failed = 0;
  let consecutiveFails = 0;
  let aborted = false;

  // 循序逐塊查詢（並發 1）、每筆之間間隔，對 Overpass 友善
  for (const t of todo) {
    try {
      const fc = await runQuery(buildScanQuery(CATEGORIES, t.bbox));
      await putTile({ id: t.id, scannedAt: Date.now(), pois: toPois(fc) });
      consecutiveFails = 0;
    } catch {
      failed++;
      consecutiveFails++;
    }
    done++;
    progress(`掃描中… ${done}/${todo.length}${failed ? `（失敗 ${failed}）` : ""}`);
    render(); // 邊掃邊畫
    if (consecutiveFails >= SCAN_ABORT_FAILS) {
      aborted = true;
      break;
    }
    if (done < todo.length) await sleep(SCAN_DELAY_MS);
  }

  scanning = false;
  progress("");
  render();
  if (aborted) {
    setStatus("連續多次失敗，已中止掃描（Overpass 可能忙碌或暫時限流，稍後再試）", true);
  } else {
    setStatus(`掃描完成${failed ? `，${failed} 塊失敗` : ""}`);
  }
}

/** 把 out center 的結果轉成精簡 POI 紀錄（只留有命中分類者）。 */
function toPois(fc: FeatureCollection): PoiRec[] {
  const out: PoiRec[] = [];
  for (const f of fc.features ?? []) {
    const g = f.geometry;
    if (!g || g.type !== "Point") continue;
    const [lng, lat] = g.coordinates as [number, number];
    const tags = (f.properties ?? {}) as Record<string, unknown>;
    const cat = resolveCategory(tags);
    if (!cat) continue;
    out.push({ lat, lng, c: cat.id, nm: featureName(tags), id: String(f.id ?? `${lat},${lng}`) });
  }
  return out;
}

// ── 判純 + 渲染 ──

function render(): void {
  if (!active || !cellLayer || !iconLayer) return;
  const map = getMap();
  cellLayer.clearLayers();
  iconLayer.clearLayers();

  const zoom = map.getZoom();
  if (zoom < PURE_MIN_ZOOM) {
    showHint(`放大到 zoom ${PURE_MIN_ZOOM} 以上以顯示純點格`);
    return;
  }
  clearHint();

  const tiles = viewTiles();
  const seq = ++renderSeq;
  void getTiles(tiles.map((t) => t.id)).then((cache) => {
    if (!active || seq !== renderSeq || !cellLayer || !iconLayer) return;

    // 合併視野內各 L14 塊的 POI（依 OSM id 去重），分進 L17 格
    const seen = new Set<string>();
    const byCell = new Map<string, { cats: Set<string>; pois: PoiRec[] }>();
    for (const t of tiles) {
      const rec = cache.get(t.id);
      if (!rec) continue;
      for (const p of rec.pois) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        const key = S2.S2Cell.FromLatLng({ lat: p.lat, lng: p.lng }, PURE_CELL_LEVEL).toHilbertQuadkey();
        let e = byCell.get(key);
        if (!e) {
          e = { cats: new Set(), pois: [] };
          byCell.set(key, e);
        }
        e.cats.add(p.c);
        e.pois.push(p);
      }
    }

    const useIcons = zoom >= PURE_ICON_ZOOM;
    let pureCount = 0;
    for (const { cats, pois } of byCell.values()) {
      if (cats.size !== 1) continue; // 只畫純點格
      const cat = CAT_BY_ID.get([...cats][0]);
      if (!cat) continue;
      pureCount++;
      const color = colorFor(cat);

      if (useIcons) {
        for (const p of pois) {
          L.marker([p.lat, p.lng], { icon: emojiIcon(cat.emoji, color) })
            .bindPopup(`${cat.emoji} ${escapeHtml(p.nm || cat.label)}<br><small>${escapeHtml(cat.label)}</small>`)
            .addTo(iconLayer);
        }
      } else {
        // 用格內任一點重建該 L17 cell 並畫色塊（點必在 cell 內，FromLatLng 會得到同一格）
        const cell = S2.S2Cell.FromLatLng({ lat: pois[0].lat, lng: pois[0].lng }, PURE_CELL_LEVEL);
        const corners = cell.getCornerLatLngs().map((c) => [c.lat, c.lng] as [number, number]);
        const poly = L.polygon(corners, { color, weight: 1, fillColor: color, fillOpacity: 0.35 });
        poly.bindPopup(`${cat.emoji} ${escapeHtml(cat.label)}<br><small>純點格 · ${pois.length} 個地點</small>`);
        poly.addTo(cellLayer);
        // emoji 純標示、點擊穿透到底下色塊（見 .pure-cell-label 的 pointer-events）
        const ctr = cell.getLatLng();
        L.marker([ctr.lat, ctr.lng], { icon: cellLabelIcon(cat.emoji), interactive: false }).addTo(cellLayer);
      }
    }

    setStatus(
      pureCount > 0
        ? `純點格 ${pureCount} 格`
        : seen.size > 0
          ? "此區沒有純點格"
          : "此區尚未掃描，按「掃描此區」",
    );
  });
}

// ── S2 L14 塊 ──

/** 視野內（略外擴）的 L14 塊清單，每塊含 id 與查詢用 bbox。 */
function viewTiles(): { id: string; bbox: string }[] {
  const map = getMap();
  const bounds = map.getBounds().pad(0.2);
  const c = map.getCenter();
  const start = S2.S2Cell.FromLatLng({ lat: c.lat, lng: c.lng }, PURE_SCAN_LEVEL);

  const visited = new Set<string>([start.toHilbertQuadkey()]);
  const queue: S2Cell[] = [start];
  const out: { id: string; bbox: string }[] = [];

  while (queue.length > 0 && out.length < MAX_TILES) {
    const cell = queue.shift()!;
    out.push({ id: cell.toHilbertQuadkey(), bbox: cellBbox(cell) });
    for (const n of cell.getNeighbors()) {
      const key = n.toHilbertQuadkey();
      if (visited.has(key)) continue;
      const ll = n.getLatLng();
      if (!bounds.contains([ll.lat, ll.lng])) continue;
      visited.add(key);
      queue.push(n);
    }
  }
  return out;
}

/** 一個 cell 的 lat/lng 包圍盒 → "south,west,north,east"（給 Overpass）。 */
function cellBbox(cell: S2Cell): string {
  let s = Infinity;
  let w = Infinity;
  let n = -Infinity;
  let e = -Infinity;
  for (const p of cell.getCornerLatLngs()) {
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
  }
  return [s, w, n, e].map((x) => x.toFixed(6)).join(",");
}

// ── 小工具 ──

/** 純點格中心的分類 emoji（純文字、無白底圓框）。 */
function cellLabelIcon(emoji: string): L.DivIcon {
  return L.divIcon({
    className: "pure-cell-label",
    html: `<span>${emoji}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `pure-btn ${cls}`.trim();
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function progress(msg: string): void {
  if (progressEl) progressEl.textContent = msg;
}

function showHint(msg: string): void {
  const map = getMap();
  if (!hintControl) {
    hintControl = new L.Control({ position: "bottomleft" });
    hintControl.onAdd = () => {
      const d = L.DomUtil.create("div", "pure-hint");
      d.id = "pure-hint-el";
      return d;
    };
    hintControl.addTo(map);
  }
  const el = document.getElementById("pure-hint-el");
  if (el) el.textContent = msg;
}

function clearHint(): void {
  hintControl?.remove();
  hintControl = null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
