/**
 * 進入點：串接 menu / map / overpass，綁定 Run 按鈕。
 */
import "./style.css";
import { initMap, showResult, refreshSize } from "./map";
import { initMenu, getSelectedCategories } from "./menu";
import { runQuery, buildQuery } from "./overpass";
import { MARKER_PALETTE } from "./config";

const mapPane = document.getElementById("map-pane")!;
const categoryContainer = document.getElementById("category-container")!;
const previewEl = document.getElementById("query-preview")!;
const runBtn = document.getElementById("run-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status")!;
const menuToggle = document.getElementById("menu-toggle") as HTMLButtonElement;

initMap(mapPane);

// 收合 / 展開左側查詢選單；收合後讓地圖重算尺寸補上圖磚
menuToggle.addEventListener("click", () => {
  const collapsed = document.body.classList.toggle("menu-collapsed");
  menuToggle.setAttribute("aria-expanded", String(!collapsed));
  requestAnimationFrame(() => refreshSize());
});

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

async function onRun() {
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
    const count = showResult(geojson, styled);
    setStatus(count > 0 ? `完成：${count} 筆結果` : "完成：沒有符合的結果");
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
