/**
 * 趣味小功能：從 Pikmin Bloom 目前的 8 種皮克敏抽一個。
 * 純前端、不碰任何 API；點頂部「抽皮克敏」彈出小視窗，
 * 播放「從花苗盆裡拔出來」的動畫後定格。
 *
 * 像素圖放在 src/assets/pikmin/<key>.png（含花苗盆 seedling.png），會被 Vite 打包並依 base 改寫路徑。
 * 缺圖時自動退回 emoji，不會壞 build。
 */

// 自動收集 src/assets/pikmin 下的圖（有就用、沒有就退回 emoji）
const SPRITES = import.meta.glob("./assets/pikmin/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function spriteUrl(key: string): string | undefined {
  const hit = Object.entries(SPRITES).find(([path]) => path.endsWith(`/${key}.png`));
  return hit?.[1];
}

interface Pikmin {
  name: string;
  /** 對應 src/assets/pikmin/<key>.png 的檔名 */
  key: string;
  /** 缺圖時的退回 emoji */
  emoji: string;
}

const PIKMIN: Pikmin[] = [
  { name: "紅皮克敏", key: "red", emoji: "🔴" },
  { name: "黃皮克敏", key: "yellow", emoji: "🟡" },
  { name: "藍皮克敏", key: "blue", emoji: "🔵" },
  { name: "白皮克敏", key: "white", emoji: "⚪" },
  { name: "紫皮克敏", key: "purple", emoji: "🟣" },
  { name: "岩石皮克敏", key: "rock", emoji: "🪨" },
  { name: "羽毛皮克敏", key: "winged", emoji: "🌸" },
  { name: "冰皮克敏", key: "ice", emoji: "🧊" },
];

/** 拔出動畫長度（毫秒），需與 style.css 的 @keyframes pluck-rise 對齊 */
const PLUCK_MS = 900;

let backdrop: HTMLElement | null = null;
let stageEl: HTMLElement | null = null;
let pikminEl: HTMLElement | null = null;
let nameEl: HTMLElement | null = null;
let drawBtnEl: HTMLButtonElement | null = null;
let rolling = false;

/** 綁定頂部「抽皮克敏」按鈕。 */
export function initPikminDraw(btn: HTMLButtonElement): void {
  btn.addEventListener("click", open);
}

function build(): void {
  backdrop = document.createElement("div");
  backdrop.className = "pikmin-backdrop";
  backdrop.innerHTML = `
    <div class="pikmin-card" role="dialog" aria-modal="true" aria-label="抽皮克敏">
      <button type="button" class="pikmin-close" aria-label="關閉">×</button>
      <div class="pikmin-stage" aria-live="polite">
        <div class="pluck-pikmin"></div>
        <img class="pluck-pot" alt="花苗盆" />
      </div>
      <div class="pikmin-name">準備拔皮克敏…</div>
      <button type="button" class="pikmin-draw">拔一個！</button>
    </div>`;

  stageEl = backdrop.querySelector(".pikmin-stage");
  pikminEl = backdrop.querySelector(".pluck-pikmin");
  nameEl = backdrop.querySelector(".pikmin-name");
  drawBtnEl = backdrop.querySelector(".pikmin-draw");

  // 花苗盆圖（缺圖就不顯示盆子，仍可拔）
  const pot = spriteUrl("seedling");
  const potEl = backdrop.querySelector(".pluck-pot") as HTMLImageElement;
  if (pot) potEl.src = pot;
  else potEl.style.display = "none";
  potEl.addEventListener("click", pluck); // 點花苗 → 拔出

  drawBtnEl!.addEventListener("click", setReady); // 「再拔一個」→ 回到準備狀態（不立即拔）
  backdrop.querySelector(".pikmin-close")!.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);

  document.body.append(backdrop);
}

function open(): void {
  if (!backdrop) build();
  backdrop!.classList.add("show");
  setReady();
}

/** 準備狀態：盆子反覆搖晃、隱藏按鈕，等使用者點花苗。 */
function setReady(): void {
  rolling = false;
  stageEl?.classList.remove("plucking");
  stageEl?.classList.add("ready");
  if (pikminEl) pikminEl.innerHTML = "";
  if (nameEl) nameEl.textContent = "點花苗拔出皮克敏！";
  if (drawBtnEl) {
    // 用 visibility 隱藏（保留空間），整個區域高度才不會忽高忽低
    drawBtnEl.style.visibility = "hidden";
    drawBtnEl.textContent = "再拔一個";
  }
}

function close(): void {
  backdrop?.classList.remove("show");
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") close();
}

/** 點花苗觸發：隨機選一隻，播放從花苗盆拔出的動畫，結束後定格、顯示名稱與「再拔一個」。 */
function pluck(): void {
  // 只有準備狀態（盆子在搖）能拔；動畫中或已拔出都忽略
  if (rolling || !stageEl || !stageEl.classList.contains("ready") || !pikminEl || !nameEl || !drawBtnEl)
    return;
  rolling = true;

  const p = pick();
  const url = spriteUrl(p.key);
  pikminEl.innerHTML = url
    ? `<img src="${url}" alt="${p.name}" />`
    : `<span class="pikmin-emoji-fallback">${p.emoji}</span>`;
  nameEl.textContent = "用力拔…";

  // 離開準備狀態 → reflow → 加 plucking：皮克敏冒出與盆子往左滾「同時」開始
  stageEl.classList.remove("ready", "plucking");
  void stageEl.offsetWidth;
  stageEl.classList.add("plucking");

  window.setTimeout(() => {
    nameEl!.textContent = `得到了：${p.name}！`;
    rolling = false;
    drawBtnEl!.style.visibility = "visible"; // 顯示「再拔一個」→ 回到準備狀態
    drawBtnEl!.textContent = "再拔一個";
  }, PLUCK_MS);
}

function pick(): Pikmin {
  return PIKMIN[Math.floor(Math.random() * PIKMIN.length)];
}
