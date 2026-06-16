/**
 * 趣味小功能：從 Pikmin Bloom 目前的 8 種皮克敏抽一個。
 * 純前端、不碰任何 API；點頂部「抽皮克敏」彈出小視窗，跑一段滾動動畫後定格。
 *
 * 像素圖放在 src/assets/pikmin/<key>.png（透明或白底皆可），會被 Vite 打包並依 base 改寫路徑。
 * 對應檔名見每個皮克敏的 key；缺圖時自動退回 emoji，不會壞 build。
 */

// 自動收集 src/assets/pikmin 下的像素圖（有就用、沒有就退回 emoji）
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

let backdrop: HTMLElement | null = null;
let displayEl: HTMLElement | null = null;
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
      <div class="pikmin-display" aria-live="polite"></div>
      <div class="pikmin-name">準備抽籤…</div>
      <button type="button" class="pikmin-draw">抽一個！</button>
    </div>`;

  displayEl = backdrop.querySelector(".pikmin-display");
  nameEl = backdrop.querySelector(".pikmin-name");
  drawBtnEl = backdrop.querySelector(".pikmin-draw");

  drawBtnEl!.addEventListener("click", roll);
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
  roll();
}

function close(): void {
  backdrop?.classList.remove("show");
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") close();
}

/** 跑一段滾動動畫，最後定格在隨機一個。 */
function roll(): void {
  if (rolling || !displayEl || !nameEl || !drawBtnEl) return;
  rolling = true;
  drawBtnEl.disabled = true;

  const card = backdrop!.querySelector(".pikmin-card")!;
  card.classList.remove("settled");

  let ticks = 0;
  const total = 16;
  const timer = setInterval(() => {
    show(pick(), false);
    ticks++;
    if (ticks >= total) {
      clearInterval(timer);
      show(pick(), true);
      card.classList.add("settled");
      rolling = false;
      drawBtnEl!.disabled = false;
      drawBtnEl!.textContent = "再抽一個";
    }
  }, 70);
}

function pick(): Pikmin {
  return PIKMIN[Math.floor(Math.random() * PIKMIN.length)];
}

function show(p: Pikmin, final: boolean): void {
  if (!displayEl || !nameEl) return;
  const url = spriteUrl(p.key);
  displayEl.innerHTML = url
    ? `<img class="pikmin-sprite" src="${url}" alt="${p.name}" />`
    : `<span class="pikmin-emoji-fallback">${p.emoji}</span>`;
  nameEl.textContent = final ? `抽到了：${p.name}！` : p.name;
}
