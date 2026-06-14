/**
 * 地圖疊加：右上角「定位我」按鈕（排在雷達範圍鈕下方）。
 * 用瀏覽器 Geolocation 取得目前位置，標在地圖上並移動過去；
 * 其他模組可用 getUserLatLng() 取得目前位置來算距離（步行遊戲常用）。
 */
import L from "leaflet";

let userLatLng: L.LatLng | null = null;

/** 目前定位（尚未定位則為 null）。 */
export function getUserLatLng(): L.LatLng | null {
  return userLatLng;
}

/**
 * 在地圖左上角加入定位按鈕。
 * onLocate 會在每次成功定位後被呼叫（例如用來重排結果距離）。
 */
export function initLocate(map: L.Map, onLocate?: () => void): void {
  let marker: L.Marker | null = null;
  let accuracy: L.Circle | null = null;

  const ctrl = new L.Control({ position: "topright" });
  ctrl.onAdd = () => {
    const btn = L.DomUtil.create("button", "locate-btn") as HTMLButtonElement;
    btn.type = "button";
    btn.textContent = "📍";
    btn.title = "定位我目前的位置";

    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener("click", () => {
      if (!("geolocation" in navigator)) {
        btn.classList.add("error");
        return;
      }
      btn.classList.remove("error");
      btn.classList.add("loading");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          btn.classList.remove("loading");
          const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
          userLatLng = ll;

          const icon = L.divIcon({ className: "user-dot", iconSize: [16, 16], iconAnchor: [8, 8] });
          if (marker) marker.setLatLng(ll);
          else marker = L.marker(ll, { icon, interactive: false, keyboard: false }).addTo(map);

          // 精度圈
          if (accuracy) accuracy.setLatLng(ll).setRadius(pos.coords.accuracy);
          else
            accuracy = L.circle(ll, {
              radius: pos.coords.accuracy,
              color: "#1a73e8",
              weight: 1,
              fillColor: "#1a73e8",
              fillOpacity: 0.12,
              interactive: false,
            }).addTo(map);

          map.setView(ll, Math.max(map.getZoom(), 16));
          onLocate?.();
        },
        () => {
          btn.classList.remove("loading");
          btn.classList.add("error");
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    });

    return btn;
  };
  ctrl.addTo(map);
}
