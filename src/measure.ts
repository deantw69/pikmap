/**
 * 地圖疊加：右上角的「量距離」切換按鈕（排在群聚鈕下方）。
 * 開啟後在地圖上逐點點按，連成折線並顯示各段與累計距離；
 * 雙擊或按 Esc 結束本段測量，再按一次按鈕清除並關閉。
 */
import L from "leaflet";

/** 量距線的顏色 */
const LINE_COLOR = "#e6194b";

/** 把公尺距離格式化成易讀字串（>=1km 用公里）。 */
function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

/** 在右上角加入量距離的切換按鈕。 */
export function initMeasure(map: L.Map): void {
  let active = false;
  let finished = false; // 已雙擊／Esc 結束，下一次點按重新開始
  const points: L.LatLng[] = [];
  const layer = L.layerGroup();

  // 重畫整條折線、頂點圓點與累計距離標籤。
  const redraw = () => {
    layer.clearLayers();
    if (points.length === 0) return;

    L.polyline(points, { color: LINE_COLOR, weight: 3, opacity: 0.9, interactive: false }).addTo(layer);

    let total = 0;
    points.forEach((p, i) => {
      if (i > 0) total += map.distance(points[i - 1], p);
      L.circleMarker(p, {
        radius: 4,
        color: LINE_COLOR,
        weight: 2,
        fillColor: "#fff",
        fillOpacity: 1,
        interactive: false,
      }).addTo(layer);
      // 累計距離標籤掛在每個頂點（第一點為起點 0，不顯示）
      if (i > 0) {
        L.marker(p, {
          interactive: false,
          icon: L.divIcon({
            className: "measure-label",
            html: formatDistance(total),
            iconSize: [0, 0],
            iconAnchor: [-8, 8],
          }),
        }).addTo(layer);
      }
    });
  };

  const onClick = (e: L.LeafletMouseEvent) => {
    if (finished) {
      points.length = 0; // 上一段已結束，重新開始一條新線
      finished = false;
    }
    points.push(e.latlng);
    redraw();
  };

  const finish = () => {
    finished = true;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") finish();
  };

  const enable = () => {
    active = true;
    layer.addTo(map);
    map.on("click", onClick);
    map.on("dblclick", finish);
    map.doubleClickZoom.disable(); // 雙擊用來結束測量，停用雙擊縮放
    document.addEventListener("keydown", onKey);
    L.DomUtil.addClass(map.getContainer(), "measuring");
  };

  const disable = () => {
    active = false;
    finished = false;
    points.length = 0;
    map.off("click", onClick);
    map.off("dblclick", finish);
    map.doubleClickZoom.enable();
    document.removeEventListener("keydown", onKey);
    L.DomUtil.removeClass(map.getContainer(), "measuring");
    layer.clearLayers();
    layer.remove();
  };

  const ctrl = new L.Control({ position: "topright" });
  ctrl.onAdd = () => {
    const btn = L.DomUtil.create("button", "measure-toggle") as HTMLButtonElement;
    btn.type = "button";
    btn.title = "量距離：點按地圖逐點連線，雙擊或 Esc 結束";
    btn.setAttribute("aria-pressed", "false");
    // 直尺圖示
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
        <rect x="2.5" y="7.5" width="19" height="9" rx="1.2" transform="rotate(-20 12 12)"/>
        <path d="M6.2 9.1l1.3 1.9M9.6 7.9l2 2.9M13 6.7l1.3 1.9M16.4 5.5l2 2.9"/>
      </g>
    </svg>`;

    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener("click", () => {
      const on = btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", String(on));
      if (on && !active) enable();
      else if (!on && active) disable();
    });

    return btn;
  };
  ctrl.addTo(map);
}
