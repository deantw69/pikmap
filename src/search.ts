/**
 * 地圖上的地址搜尋框：用 OpenStreetMap Nominatim 做地理編碼，
 * 輸入時跑出建議選單，點選後把地圖移動過去。
 */
import L from "leaflet";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox?: [string, string, string, string];
}

/** 在地圖左上角加入搜尋框。 */
export function initSearch(map: L.Map): void {
  const ctrl = new L.Control({ position: "topleft" });

  ctrl.onAdd = () => {
    const div = L.DomUtil.create("div", "map-search");
    div.innerHTML =
      '<div class="map-search-row">' +
      '<input type="text" class="map-search-input" placeholder="搜尋地址 / 地點…" autocomplete="off" />' +
      '<button type="button" class="map-search-btn" aria-label="搜尋">🔍</button>' +
      "</div>" +
      '<ul class="map-search-list" role="listbox" hidden></ul>';

    const input = div.querySelector("input") as HTMLInputElement;
    const btn = div.querySelector("button") as HTMLButtonElement;
    const list = div.querySelector(".map-search-list") as HTMLUListElement;

    // 在控制項上的點擊／滾動不要傳到地圖（避免誤觸拖曳、縮放）
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    let results: NominatimResult[] = [];
    let active = -1;
    let debounce = 0;
    let seq = 0;

    const closeList = () => {
      list.hidden = true;
      list.innerHTML = "";
      results = [];
      active = -1;
    };

    const renderList = () => {
      list.innerHTML = "";
      results.forEach((r, i) => {
        const li = L.DomUtil.create("li", "map-search-item", list);
        li.setAttribute("role", "option");
        if (i === active) li.classList.add("active");
        const [head, ...rest] = r.display_name.split(", ");
        li.innerHTML =
          `<span class="map-search-item-head">${escapeHtml(head)}</span>` +
          (rest.length
            ? `<span class="map-search-item-sub">${escapeHtml(rest.join(", "))}</span>`
            : "");
        li.addEventListener("click", () => choose(i));
      });
      list.hidden = results.length === 0;
    };

    const choose = (i: number) => {
      const r = results[i];
      if (!r) return;
      input.value = r.display_name.split(", ")[0];
      goToResult(map, r);
      closeList();
    };

    const fetchSuggestions = async (q: string) => {
      const mine = ++seq;
      try {
        const url = `${NOMINATIM}?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { "Accept-Language": navigator.language } });
        const data = (await res.json()) as NominatimResult[];
        if (mine !== seq) return; // 已有更新的查詢，丟棄舊結果
        input.classList.remove("error");
        results = Array.isArray(data) ? data : [];
        active = -1;
        renderList();
      } catch {
        if (mine === seq) closeList();
      }
    };

    input.addEventListener("input", () => {
      const q = input.value.trim();
      window.clearTimeout(debounce);
      if (q.length < 2) {
        closeList();
        return;
      }
      debounce = window.setTimeout(() => fetchSuggestions(q), 300);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" && !list.hidden) {
        e.preventDefault();
        active = (active + 1) % results.length;
        renderList();
      } else if (e.key === "ArrowUp" && !list.hidden) {
        e.preventDefault();
        active = (active - 1 + results.length) % results.length;
        renderList();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (active >= 0) choose(active);
        else go();
      } else if (e.key === "Escape") {
        closeList();
      }
    });

    const go = () => {
      window.clearTimeout(debounce);
      if (results.length) {
        choose(active >= 0 ? active : 0);
      } else {
        geocode(map, input);
      }
    };
    btn.addEventListener("click", go);
    input.addEventListener("blur", () => window.setTimeout(closeList, 150));

    return div;
  };

  ctrl.addTo(map);
}

/** 沒有建議清單時的直接查詢（按按鈕／Enter）。 */
async function geocode(map: L.Map, input: HTMLInputElement): Promise<void> {
  const q = input.value.trim();
  if (!q) return;

  input.classList.remove("error");
  try {
    const url = `${NOMINATIM}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "Accept-Language": navigator.language } });
    const data = (await res.json()) as NominatimResult[];
    if (!Array.isArray(data) || data.length === 0) {
      input.classList.add("error");
      return;
    }
    goToResult(map, data[0]);
  } catch {
    input.classList.add("error");
  }
}

function goToResult(map: L.Map, r: NominatimResult): void {
  if (r.boundingbox) {
    // Nominatim boundingbox 順序為 [south, north, west, east]
    const [s, n, w, e] = r.boundingbox.map(Number);
    map.fitBounds([
      [s, w],
      [n, e],
    ]);
  } else {
    map.setView([Number(r.lat), Number(r.lon)], 16);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
