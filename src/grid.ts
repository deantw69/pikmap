/**
 * 地圖疊加：右側的 zoom level 顯示，以及 S2 level-17 網格。
 * 網格規則同 Pokémon GO / Pikmin Bloom 使用的 OpenStreetMap S2 cell。
 */
import L from "leaflet";
import { S2, type S2Cell } from "s2-geometry";
import { S2_GRID_LEVEL, GRID_MIN_ZOOM } from "./config";

/** 一次最多畫的 cell 數，避免縮太遠時暴衝 */
const MAX_CELLS = 4000;

/** 右上角顯示目前 zoom level（例如 Lv.17）。 */
export function initZoomDisplay(map: L.Map): void {
  const ctrl = new L.Control({ position: "topright" });
  let el: HTMLElement;
  const render = () => {
    if (el) el.textContent = `Lv.${map.getZoom()}`;
  };
  ctrl.onAdd = () => {
    el = L.DomUtil.create("div", "zoom-display");
    render();
    return el;
  };
  ctrl.addTo(map);
  map.on("zoomend", render);
}

/** zoom ≥ GRID_MIN_ZOOM 時，在視野範圍內畫出 S2 level-17 網格。 */
export function initS2Grid(map: L.Map): void {
  const layer = L.layerGroup().addTo(map);

  const redraw = () => {
    layer.clearLayers();
    if (map.getZoom() < GRID_MIN_ZOOM) return;

    // 視野往外擴一些，確保邊緣的 cell 也完整畫出
    const bounds = map.getBounds().pad(0.3);
    const center = map.getCenter();
    const start = S2.S2Cell.FromLatLng({ lat: center.lat, lng: center.lng }, S2_GRID_LEVEL);

    // 從中心 cell 用鄰居 BFS 擴張，覆蓋整個視野
    const visited = new Set<string>([start.toHilbertQuadkey()]);
    const queue: S2Cell[] = [start];
    let count = 0;

    while (queue.length > 0 && count < MAX_CELLS) {
      const cell = queue.shift()!;
      drawCell(layer, cell);
      count++;

      for (const n of cell.getNeighbors()) {
        const key = n.toHilbertQuadkey();
        if (visited.has(key)) continue;
        const c = n.getLatLng();
        if (!bounds.contains([c.lat, c.lng])) continue;
        visited.add(key);
        queue.push(n);
      }
    }
  };

  map.on("moveend", redraw); // moveend 在平移與縮放後都會觸發
  redraw();
}

function drawCell(layer: L.LayerGroup, cell: S2Cell): void {
  const corners = cell
    .getCornerLatLngs()
    .map((c) => [c.lat, c.lng] as [number, number]);
  L.polygon(corners, {
    color: "#777",
    weight: 1,
    opacity: 0.6,
    fill: false,
    interactive: false,
  }).addTo(layer);
}
