/**
 * 地圖疊加：右上角的「範圍圓」切換按鈕（在 zoom level 顯示下方）。
 * 開啟後在地圖中心放一個半徑 100m 的圓，中心有可拖曳的把手，
 * 拖曳把手即可移動整個圓；再按一次按鈕關閉。
 */
import L from "leaflet";

/** 圓的半徑（公尺） */
const RADIUS_M = 100;

/** 在右上角加入範圍圓的切換按鈕。 */
export function initRangeCircle(map: L.Map): void {
  let circle: L.Circle | null = null;
  let handle: L.Marker | null = null;

  // 拖曳地圖時，把圓夾限在視野內（碰到邊緣就跟著地圖一起移動，不會跑出畫面）
  const clampIntoView = () => {
    if (!circle || !handle) return;
    const size = map.getSize();
    const b = circle.getBounds();
    const nw = map.latLngToContainerPoint(b.getNorthWest());
    const se = map.latLngToContainerPoint(b.getSouthEast());
    const rx = (se.x - nw.x) / 2; // 圓在畫面上的像素半徑
    const ry = (se.y - nw.y) / 2;
    const p = map.latLngToContainerPoint(circle.getLatLng());

    // 視野若比圓還小就置中，避免 min > max
    const cx = rx * 2 > size.x ? size.x / 2 : Math.min(Math.max(p.x, rx), size.x - rx);
    const cy = ry * 2 > size.y ? size.y / 2 : Math.min(Math.max(p.y, ry), size.y - ry);
    if (cx === p.x && cy === p.y) return;

    const ll = map.containerPointToLatLng([cx, cy]);
    circle.setLatLng(ll);
    handle.setLatLng(ll);
  };

  const enable = () => {
    const center = map.getCenter();

    circle = L.circle(center, {
      radius: RADIUS_M,
      color: "#2b7a4b",
      weight: 2,
      fillColor: "#2b7a4b",
      fillOpacity: 0.15,
      interactive: false,
    }).addTo(map);

    // 用 divIcon 當把手，免去 Leaflet 預設圖示在打包環境下的圖片路徑問題。
    // 外框 30px 當觸控範圍（透明），內含 18px 的可見圓點，較好拖曳。
    const icon = L.divIcon({
      className: "range-handle",
      html: `<span class="range-dot"></span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    // zIndexOffset 拉高，確保把手在結果標記之上、不會被蓋住
    handle = L.marker(center, { icon, draggable: true, autoPan: true, zIndexOffset: 1000 }).addTo(map);
    handle.on("drag", () => circle?.setLatLng(handle!.getLatLng()));

    map.on("move", clampIntoView); // 拖曳地圖時持續夾限在視野內
  };

  const disable = () => {
    map.off("move", clampIntoView);
    handle?.remove();
    handle = null;
    circle?.remove();
    circle = null;
  };

  const ctrl = new L.Control({ position: "topright" });
  ctrl.onAdd = () => {
    const btn = L.DomUtil.create("button", "circle-toggle") as HTMLButtonElement;
    btn.type = "button";
    btn.title = `顯示可拖曳的 ${RADIUS_M}m 範圍圓`;
    btn.setAttribute("aria-pressed", "false");
    // 雷達／掃描器圖示：同心圓 + 十字準星 + 旋轉掃描線（開啟時動畫）
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g class="radar-grid" fill="none" stroke="currentColor" stroke-width="1.4">
        <circle cx="12" cy="12" r="9.5"/>
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="2.5" x2="12" y2="21.5"/>
        <line x1="2.5" y1="12" x2="21.5" y2="12"/>
      </g>
      <g class="radar-sweep">
        <path d="M12 12 L12 2.5 A9.5 9.5 0 0 1 18.7 5.3 Z" fill="currentColor" fill-opacity="0.35"/>
        <line x1="12" y1="12" x2="12" y2="2.5" stroke="currentColor" stroke-width="1.6"/>
      </g>
    </svg>`;

    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener("click", () => {
      const on = btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", String(on));
      if (on) enable();
      else disable();
    });

    return btn;
  };
  ctrl.addTo(map);
}
