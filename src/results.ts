/**
 * 查詢結果清單：顯示各分類數量摘要，以及依距離排序的結果列表。
 * 距離以目前定位為原點（沒有定位時用地圖中心）。點清單項目會聚焦到地圖上。
 */
import { focusResult, getMapCenter, distanceMeters, type ShowResultData } from "./map";
import { getUserLatLng } from "./location";

let container: HTMLElement;
let latest: ShowResultData | null = null;

export function initResults(el: HTMLElement): void {
  container = el;
}

/** 畫出一次查詢的結果。 */
export function renderResults(data: ShowResultData): void {
  latest = data;
  draw();
}

/** 重畫（例如定位更新後重新依距離排序）。 */
export function refreshResults(): void {
  if (latest) draw();
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

function draw(): void {
  if (!container || !latest) return;
  container.innerHTML = "";

  if (latest.count === 0) {
    container.innerHTML = `<p class="results-empty">沒有符合的結果</p>`;
    return;
  }

  const user = getUserLatLng();
  const origin = user ?? getMapCenter();
  const originLL: [number, number] = [origin.lat, origin.lng];

  // 各分類數量摘要（數量 0 的不顯示）
  const summary = document.createElement("div");
  summary.className = "results-summary";
  summary.innerHTML = latest.perCategory
    .filter((c) => c.count > 0)
    .map(
      (c) =>
        `<span class="results-chip"><span class="legend-swatch" style="background:${c.color}"></span>${escapeHtml(
          `${c.emoji} ${c.label}`,
        )} <b>${c.count}</b></span>`,
    )
    .join("");
  container.append(summary);

  // 依距離排序的清單
  const note = document.createElement("p");
  note.className = "results-note";
  note.textContent = user ? "依離你的距離排序" : "依離地圖中心的距離排序（按 📍 定位更準）";
  container.append(note);

  const items = latest.items
    .map((it) => ({ it, dist: distanceMeters(originLL, it.latlng) }))
    .sort((a, b) => a.dist - b.dist);

  const list = document.createElement("ul");
  list.className = "results-list";
  for (const { it, dist } of items) {
    const li = document.createElement("li");
    li.className = "results-item";
    li.innerHTML =
      `<span class="results-swatch" style="background:${it.color}"></span>` +
      `<span class="results-name">${escapeHtml(it.emoji + " " + it.name)}</span>` +
      `<span class="results-dist">${fmtDist(dist)}</span>`;
    li.addEventListener("click", () => focusResult(it.index));
    list.append(li);
  }
  container.append(list);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
