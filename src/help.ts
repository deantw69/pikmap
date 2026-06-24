/**
 * 說明畫面：右上角「？」鈕，點開後浮出一個 modal，
 * 逐項說明地圖右側（及相關）的功能按鈕。
 *
 * 新增功能時：在下方 FEATURES 陣列加一筆即可（icon 直接複製對應按鈕的 SVG）。
 */
import L from "leaflet";

interface Feature {
  /** 對應按鈕的 SVG（複製自該按鈕的 innerHTML）或 emoji 字串 */
  icon: string;
  /** 功能名稱 */
  name: string;
  /** 一句話說明做什麼、怎麼用 */
  desc: string;
}

// ── 功能清單（依右側按鈕由上而下排列）──────────────────────────
// 之後有新功能，新增一筆到這裡就會自動出現在說明畫面。
const FEATURES: Feature[] = [
  {
    icon: "📍",
    name: "定位",
    desc: "定位並把地圖移到你目前的位置；定位後查詢結果會依與你的距離重新排序。",
  },
  {
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.4">
        <circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="2.5" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="21.5" y2="12"/>
      </g></svg>`,
    name: "100m 範圍圓",
    desc: "顯示一個可拖曳的 100m 半徑圓，用來顯示玩家在此位置時探測器掃描的到的範圍。",
  },
  {
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.4">
        <circle cx="12" cy="12" r="9.5" stroke-dasharray="2.5 2.5"/><circle cx="12" cy="12" r="5.5"/>
        <line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/>
        <line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/>
      </g><circle cx="12" cy="12" r="2.3" fill="currentColor"/></svg>`,
    name: "10km 雷達圓",
    desc: "顯示可拖曳的 10km 大圓（可超出畫面）。開啟時按「開始查詢」會改成在這個圓的範圍內搜尋，不再只看畫面視野。(可拿來當作每天上傳照片定位的範圍參考)",
  },
  {
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="10" r="4.2"/><circle cx="15.5" cy="9" r="3.4"/><circle cx="12.5" cy="15.5" r="3.8"/>
    </svg>`,
    name: "群聚顯示",
    desc: "切換標記是否聚合。開啟後密集的標記會合併成一個數字，地圖比較清爽；放大或點開即可展開。",
  },
  {
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
        <rect x="2.5" y="7.5" width="19" height="9" rx="1.2" transform="rotate(-20 12 12)"/>
        <path d="M6.2 9.1l1.3 1.9M9.6 7.9l2 2.9M13 6.7l1.3 1.9M16.4 5.5l2 2.9"/>
      </g></svg>`,
    name: "量距離",
    desc: "在地圖上逐點點按連成折線，各頂點顯示累計距離。雙擊或按 Esc 結束該段；再按一次鈕清除並關閉。",
  },
  {
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1z"
        fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
    name: "已存結果",
    desc: "把一次查詢結果命名存起來（可存多組）。之後點清單某筆即可離線重套，不需再次查詢；可改名、刪除。",
  },
  {
    icon: "Lv",
    name: "縮放等級 / S2 網格",
    desc: "右上角顯示目前地圖縮放等級。放大到 Lv.17 以上時，會疊上 S2 level-17 網格。",
  },
];

export function initHelp(map: L.Map): void {
  let overlay: HTMLElement | null = null;

  const close = () => {
    overlay?.classList.remove("open");
  };

  const open = () => {
    if (!overlay) overlay = buildOverlay(close);
    overlay.classList.add("open");
  };

  const ctrl = new L.Control({ position: "topright" });
  ctrl.onAdd = () => {
    const btn = L.DomUtil.create("button", "help-toggle") as HTMLButtonElement;
    btn.type = "button";
    btn.title = "功能說明";
    btn.setAttribute("aria-label", "功能說明");
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <path d="M9.3 9.2a2.8 2.8 0 1 1 3.6 2.9c-.8.3-1.1.8-1.1 1.6v.5"
        fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      <circle cx="11.8" cy="17" r="1.05" fill="currentColor"/>
    </svg>`;

    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener("click", open);
    return btn;
  };
  ctrl.addTo(map);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

function buildOverlay(close: () => void): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "help-overlay";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const dialog = document.createElement("div");
  dialog.className = "help-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "功能說明");

  const head = document.createElement("div");
  head.className = "help-head";
  const title = document.createElement("h2");
  title.textContent = "功能說明";
  const x = document.createElement("button");
  x.type = "button";
  x.className = "help-close";
  x.textContent = "✕";
  x.title = "關閉";
  x.addEventListener("click", close);
  head.append(title, x);

  const list = document.createElement("div");
  list.className = "help-list";
  for (const f of FEATURES) {
    const row = document.createElement("div");
    row.className = "help-row";
    const ic = document.createElement("div");
    ic.className = "help-icon";
    ic.innerHTML = f.icon;
    const body = document.createElement("div");
    body.className = "help-body";
    const name = document.createElement("div");
    name.className = "help-name";
    name.textContent = f.name;
    const desc = document.createElement("div");
    desc.className = "help-desc";
    desc.textContent = f.desc;
    body.append(name, desc);
    row.append(ic, body);
    list.append(row);
  }

  dialog.append(head, list);
  overlay.append(dialog);
  document.getElementById("app")!.append(overlay);
  return overlay;
}
