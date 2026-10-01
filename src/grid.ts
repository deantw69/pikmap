/**
 * 地圖疊加：右側的 zoom level 顯示，以及 S2 level-17 網格。
 * 網格規則同 Pokémon GO / Pikmin Bloom 使用的 OpenStreetMap S2 cell。
 */
import L from "leaflet";
import { S2, type S2Cell } from "s2-geometry";
import { S2_GRID_LEVEL, GRID_MIN_ZOOM } from "./config";
import { load, save } from "./storage";

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

/**
 * zoom ≥ GRID_MIN_ZOOM 時，在視野範圍內畫出 S2 level-17 網格。
 * 長按（桌機右鍵）格子可切換「已拿過」標記（灰色填滿），存 localStorage 的 `collectedCells`。
 */
export function initS2Grid(map: L.Map): void {
  const layer = L.layerGroup().addTo(map);
  const collected = new Set<string>(load<string[]>("collectedCells", []));
  let clearBtn: HTMLButtonElement | undefined;

  const persist = () => save("collectedCells", [...collected]);

  // 「全部清除」鈕只在網格可見且有標記時顯示
  const updateClearBtn = () => {
    if (!clearBtn) return;
    clearBtn.hidden = collected.size === 0 || map.getZoom() < GRID_MIN_ZOOM;
  };

  const redraw = () => {
    layer.clearLayers();
    updateClearBtn();
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
      drawCell(layer, cell, collected.has(cell.toHilbertQuadkey()));
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

  // 長按（觸控，由 Leaflet tapHold／原生 contextmenu 觸發）或右鍵：切換該格「已拿過」
  map.on("contextmenu", (e: L.LeafletMouseEvent) => {
    if (map.getZoom() < GRID_MIN_ZOOM) return;
    e.originalEvent.preventDefault();
    const key = S2.S2Cell.FromLatLng({ lat: e.latlng.lat, lng: e.latlng.lng }, S2_GRID_LEVEL).toHilbertQuadkey();
    if (collected.has(key)) collected.delete(key);
    else collected.add(key);
    persist();
    redraw();
  });

  const ctrl = new L.Control({ position: "topright" });
  ctrl.onAdd = () => {
    clearBtn = L.DomUtil.create("button", "collected-clear") as HTMLButtonElement;
    clearBtn.type = "button";
    clearBtn.title = "清除所有「已拿過」格子標記";
    // 格子 + 叉叉圖示
    clearBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
        <path d="M3 3h11v11H3z" fill="currentColor" fill-opacity="0.35"/>
        <path d="M14.5 14.5l6 6M20.5 14.5l-6 6" stroke-linecap="round"/>
      </g>
    </svg>`;
    L.DomEvent.disableClickPropagation(clearBtn);
    clearBtn.addEventListener("click", () => {
      if (!confirm(`確定清除全部 ${collected.size} 格「已拿過」標記？`)) return;
      collected.clear();
      persist();
      redraw();
    });
    updateClearBtn();
    return clearBtn;
  };
  ctrl.addTo(map);

  map.on("moveend", redraw); // moveend 在平移與縮放後都會觸發
  redraw();
}

function drawCell(layer: L.LayerGroup, cell: S2Cell, collected: boolean): void {
  const corners = cell
    .getCornerLatLngs()
    .map((c) => [c.lat, c.lng] as [number, number]);
  L.polygon(corners, {
    color: "#777",
    weight: 1,
    opacity: 0.6,
    fill: collected,
    fillColor: "#555",
    fillOpacity: 0.35,
    interactive: false,
  }).addTo(layer);
}
