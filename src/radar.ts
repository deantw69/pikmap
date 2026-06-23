/**
 * 地圖疊加：右上角的「10km 雷達圓」切換按鈕（在 100m 範圍圓鈕下方）。
 * 開啟後在地圖中心放一個半徑 10km 的大圓，中心有可拖曳的把手，
 * 拖曳把手即可移動整個圓；再按一次按鈕關閉。
 *
 * 與 circle.ts（100m 範圍圓）的關鍵差異：
 * - 不夾限在視野內，圓可自由超出畫面（不監聽 map move）。
 * - 圓開啟時，main.ts 的 Run 會改用此圓範圍（Overpass around）查詢。
 */
import L from "leaflet";

/** 圓的半徑（公尺） */
const RADIUS_M = 10000;

let circle: L.Circle | null = null;
let handle: L.Marker | null = null;

/**
 * 雷達圓目前的查詢範圍；圓未開啟時回 null。
 * main.ts 的 onRun 用這個決定要用圓範圍（around）還是畫面視野查詢。
 */
export function getRadarScope(): { lat: number; lng: number; radiusM: number } | null {
  if (!circle) return null;
  const c = circle.getLatLng();
  return { lat: c.lat, lng: c.lng, radiusM: RADIUS_M };
}

/** 在右上角加入 10km 雷達圓的切換按鈕。 */
export function initRadar(map: L.Map): void {
  const enable = () => {
    const center = map.getCenter();

    circle = L.circle(center, {
      radius: RADIUS_M,
      color: "#3b82f6", // 藍色，與 100m 綠圓區隔
      weight: 2,
      fillColor: "#3b82f6",
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(map);

    // 用 divIcon 當把手，免去 Leaflet 預設圖示在打包環境下的圖片路徑問題。
    const icon = L.divIcon({
      className: "radar-handle",
      html: `<span class="radar-dot"></span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    handle = L.marker(center, { icon, draggable: true, autoPan: true, zIndexOffset: 1000 }).addTo(map);
    handle.on("drag", () => circle?.setLatLng(handle!.getLatLng()));
    // 不夾限視野：刻意不監聽 map move，讓圓可自由超出畫面
  };

  const disable = () => {
    handle?.remove();
    handle = null;
    circle?.remove();
    circle = null;
  };

  const ctrl = new L.Control({ position: "topright" });
  ctrl.onAdd = () => {
    const btn = L.DomUtil.create("button", "radar-toggle") as HTMLButtonElement;
    btn.type = "button";
    btn.title = `顯示可拖曳的 10km 範圍圓，並在此範圍內搜尋`;
    btn.setAttribute("aria-pressed", "false");
    // 大範圍定位圖示：同心圓 + 中心定位點（與 100m 圓的掃描線圖示區隔）
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.4">
        <circle cx="12" cy="12" r="9.5" stroke-dasharray="2.5 2.5"/>
        <circle cx="12" cy="12" r="5.5"/>
        <line x1="12" y1="1" x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="23"/>
        <line x1="1" y1="12" x2="4" y2="12"/>
        <line x1="20" y1="12" x2="23" y2="12"/>
      </g>
      <circle cx="12" cy="12" r="2.3" fill="currentColor"/>
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
