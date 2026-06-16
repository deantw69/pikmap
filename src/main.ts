/**
 * 進入點：串接 menu / map / overpass，綁定 Run 按鈕。
 */
import "./style.css";
import { initMap, showResult, refreshSize } from "./map";
import { initMenu, getSelectedCategories } from "./menu";
import { initLocate } from "./location";
import { initResults, renderResults, refreshResults } from "./results";
import { initPure, setPureActive } from "./pure";
import { initPikminDraw } from "./pikmin";
import { runQuery, buildQuery } from "./overpass";
import { MARKER_PALETTE } from "./config";
import { load, save } from "./storage";

const mapPane = document.getElementById("map-pane")!;
const categoryContainer = document.getElementById("category-container")!;
const previewEl = document.getElementById("query-preview")!;
const runBtn = document.getElementById("run-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status")!;
const menuToggle = document.getElementById("menu-toggle") as HTMLButtonElement;
const paneArrow = document.getElementById("pane-arrow") as HTMLButtonElement;
const paneResizer = document.getElementById("pane-resizer")!;
const queryPane = document.getElementById("query-pane")!;
const resultsList = document.getElementById("results-list")!;
const pureControls = document.getElementById("pure-controls")!;
const modeNormalBtn = document.getElementById("mode-normal") as HTMLButtonElement;
const modePureBtn = document.getElementById("mode-pure") as HTMLButtonElement;

const map = initMap(mapPane);
initLocate(map, refreshResults); // 左上角定位鈕；定位更新後重排結果距離
initResults(resultsList);
// 趣味：抽皮克敏 — 仍在開發中，只在 dev 顯示，正式版隱藏按鈕
const drawBtn = document.getElementById("draw-btn") as HTMLButtonElement;
if (import.meta.env.DEV) {
  initPikminDraw(drawBtn);
} else {
  drawBtn.style.display = "none";
}

// 還原上次調好的選單寬度（桌機）；手機為懸浮固定寬度，不受此影響
const savedWidth = load<number | null>("menuWidth", null);
if (typeof savedWidth === "number") {
  document.body.style.setProperty("--menu-width", savedWidth + "px");
}

// 收合 / 展開查詢選單（☰ 與手機側邊箭頭共用）；收合後讓地圖重算尺寸補上圖磚
function setMenuCollapsed(collapsed: boolean) {
  document.body.classList.toggle("menu-collapsed", collapsed);
  menuToggle.setAttribute("aria-expanded", String(!collapsed));
  paneArrow.setAttribute("aria-expanded", String(!collapsed));
  paneArrow.textContent = collapsed ? "▶" : "◀";
  requestAnimationFrame(() => refreshSize());
}
const toggleMenu = () =>
  setMenuCollapsed(!document.body.classList.contains("menu-collapsed"));
menuToggle.addEventListener("click", toggleMenu);
paneArrow.addEventListener("click", toggleMenu);

// 桌機：拖曳分隔線調整選單寬度，放開後記住到 localStorage
initPaneResize();

function initPaneResize() {
  const MIN = 280;
  let dragging = false;

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const ws = queryPane.parentElement!.getBoundingClientRect();
    const w = Math.max(MIN, Math.min(e.clientX - ws.left, ws.width * 0.8));
    document.body.style.setProperty("--menu-width", w + "px");
    refreshSize();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    paneResizer.classList.remove("dragging");
    document.body.classList.remove("resizing");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    save("menuWidth", Math.round(queryPane.getBoundingClientRect().width));
    refreshSize();
  };
  paneResizer.addEventListener("pointerdown", (e) => {
    dragging = true;
    paneResizer.classList.add("dragging");
    document.body.classList.add("resizing");
    e.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

function setStatus(msg: string, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

/** 依目前勾選更新查詢預覽。 */
function refreshPreview() {
  const categories = getSelectedCategories();
  previewEl.textContent = categories.length
    ? buildQuery(categories)
    : "（尚未選擇任何類型）";
}

initMenu(categoryContainer, refreshPreview);
refreshPreview();

// 純點模式（獨立模式）：仍在開發中、且掃描會大量打 Overpass，
// 因此只在 dev（pnpm dev）顯示，正式版（build 後）隱藏整個模式切換器。
const modeSwitch = document.getElementById("mode-switch")!;

function setMode(pure: boolean) {
  document.body.classList.toggle("pure-mode", pure);
  modeNormalBtn.classList.toggle("active", !pure);
  modePureBtn.classList.toggle("active", pure);
  modeNormalBtn.setAttribute("aria-selected", String(!pure));
  modePureBtn.setAttribute("aria-selected", String(pure));
  setStatus("");
  setPureActive(pure);
  requestAnimationFrame(() => refreshSize());
}

if (import.meta.env.DEV) {
  initPure(pureControls, setStatus);
  modeNormalBtn.addEventListener("click", () => setMode(false));
  modePureBtn.addEventListener("click", () => setMode(true));
} else {
  modeSwitch.style.display = "none"; // 正式版隱藏純點模式
}

async function onRun() {
  if (document.body.classList.contains("pure-mode")) return; // 純點模式不跑一般查詢
  const categories = getSelectedCategories();
  if (!categories.length) {
    setStatus("請至少勾選一個類型", true);
    return;
  }
  // 依勾選順序給每個分類配一個顏色（選 2 種以上時 showResult 會據此上色）
  const styled = categories.map((category, i) => ({
    category,
    color: MARKER_PALETTE[i % MARKER_PALETTE.length],
  }));

  runBtn.disabled = true;
  setStatus("查詢中…");
  try {
    const geojson = await runQuery(buildQuery(categories));
    const data = showResult(geojson, styled);
    renderResults(data);
    setStatus(data.count > 0 ? `完成：${data.count} 筆結果` : "完成：沒有符合的結果");
  } catch (err) {
    setStatus((err as Error).message, true);
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener("click", onRun);

// Ctrl/Cmd + Enter 也可執行查詢
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    onRun();
  }
});
