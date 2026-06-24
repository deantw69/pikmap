/**
 * 地圖疊加：右上角「已存結果」書籤鈕（排在量距鈕下方）。
 * 把一次查詢的結果（GeoJSON + 分類/顏色）存進 localStorage，可存多組、各自命名，
 * 之後點選即用 showResult 重畫，完全不再呼叫 Overpass API。
 */
import L from "leaflet";
import type { FeatureCollection } from "geojson";
import { CATEGORIES } from "./config";
import type { StyledCategory } from "./map";
import { load, save } from "./storage";

/** 一次查詢結果的快照（geojson + 分類顏色），給存／套用共用 */
export interface ResultSnapshot {
  geojson: FeatureCollection;
  styled: StyledCategory[];
}

/** localStorage 中一筆已存結果（styled 只存分類 id + 顏色，套用時依 id 還原） */
interface SavedSearch {
  id: string;
  name: string;
  createdAt: number;
  count: number;
  styled: { id: string; color: string }[];
  geojson: FeatureCollection;
}

const KEY = "savedSearches";

interface SavedHooks {
  /** 取得目前可儲存的結果；尚未成功查詢時回 null */
  getCurrent: () => ResultSnapshot | null;
  /** 套用一組已存結果（主線負責 showResult + renderResults） */
  apply: (snap: ResultSnapshot) => void;
  /** 顯示提示訊息 */
  toast: (msg: string, isError?: boolean) => void;
}

/** 把 StyledCategory[] 壓成可存的 {id,color}[] */
function toStored(styled: StyledCategory[]): { id: string; color: string }[] {
  return styled.map((s) => ({ id: s.category.id, color: s.color }));
}

/** 依 id 從 CATEGORIES 還原 StyledCategory[]，分類已不存在者略過 */
function fromStored(stored: { id: string; color: string }[]): StyledCategory[] {
  const out: StyledCategory[] = [];
  for (const { id, color } of stored) {
    const category = CATEGORIES.find((c) => c.id === id);
    if (category) out.push({ category, color });
  }
  return out;
}

/** 在右上角加入「已存結果」書籤鈕與浮出面板。 */
export function initSaved(map: L.Map, hooks: SavedHooks): void {
  let searches = load<SavedSearch[]>(KEY, []);
  let open = false;
  // 編輯狀態：新增命名（new）或某筆改名（rename + id）；null 為一般清單
  let editing: { mode: "new" | "rename"; id?: string } | null = null;

  let panel: HTMLElement;
  let btn: HTMLButtonElement;

  const persist = () => save(KEY, searches);

  /** 寫入後讀回確認是否真的存進去（localStorage 可能因配額/無痕靜默失敗）。 */
  const persistChecked = (): boolean => {
    persist();
    const back = load<SavedSearch[]>(KEY, []);
    return back.length === searches.length;
  };

  const startSave = () => {
    if (!hooks.getCurrent()) {
      hooks.toast("目前沒有可儲存的結果，請先按 Run 查詢", true);
      return;
    }
    editing = { mode: "new" };
    render();
  };

  const commitNew = (name: string) => {
    const snap = hooks.getCurrent();
    if (!snap) {
      editing = null;
      render();
      return;
    }
    const count = snap.geojson.features?.length ?? 0;
    const entry: SavedSearch = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: name.trim() || `未命名（${count} 筆）`,
      createdAt: Date.now(),
      count,
      styled: toStored(snap.styled),
      geojson: snap.geojson,
    };
    searches = [entry, ...searches];
    editing = null;
    if (!persistChecked()) {
      searches = searches.filter((s) => s.id !== entry.id);
      hooks.toast("儲存失敗：空間不足或結果太大", true);
    } else {
      hooks.toast(`已儲存「${entry.name}」`);
    }
    render();
  };

  const commitRename = (id: string, name: string) => {
    const entry = searches.find((s) => s.id === id);
    if (entry && name.trim()) entry.name = name.trim();
    editing = null;
    persist();
    render();
  };

  const remove = (id: string) => {
    searches = searches.filter((s) => s.id !== id);
    if (editing?.id === id) editing = null;
    persist();
    render();
  };

  const applyEntry = (entry: SavedSearch) => {
    const styled = fromStored(entry.styled);
    hooks.apply({ geojson: entry.geojson, styled });
    setOpen(false);
  };

  // 產生一列就地編輯輸入框（新增命名 / 改名共用）
  const editorRow = (initial: string, onOk: (v: string) => void): HTMLElement => {
    const row = L.DomUtil.create("div", "saved-editor");
    const input = L.DomUtil.create("input", "saved-input", row) as HTMLInputElement;
    input.type = "text";
    input.placeholder = "輸入名稱";
    input.value = initial;
    const ok = L.DomUtil.create("button", "saved-ok", row) as HTMLButtonElement;
    ok.type = "button";
    ok.textContent = "✓";
    ok.title = "確定";
    const cancel = L.DomUtil.create("button", "saved-cancel", row) as HTMLButtonElement;
    cancel.type = "button";
    cancel.textContent = "✕";
    cancel.title = "取消";

    ok.addEventListener("click", () => onOk(input.value));
    cancel.addEventListener("click", () => {
      editing = null;
      render();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onOk(input.value);
      else if (e.key === "Escape") {
        editing = null;
        render();
      }
    });
    // 面板顯示後聚焦
    setTimeout(() => input.focus(), 0);
    return row;
  };

  const render = () => {
    panel.innerHTML = "";

    // 頂部：儲存目前結果（或新增命名輸入框）
    if (editing?.mode === "new") {
      panel.append(editorRow("", commitNew));
    } else {
      const saveBtn = L.DomUtil.create("button", "saved-save", panel) as HTMLButtonElement;
      saveBtn.type = "button";
      saveBtn.textContent = "＋ 儲存目前結果";
      saveBtn.addEventListener("click", startSave);
    }

    // 清單
    const list = L.DomUtil.create("div", "saved-list", panel);
    if (searches.length === 0) {
      const empty = L.DomUtil.create("p", "saved-empty", list);
      empty.textContent = "尚無已存結果";
      return;
    }
    for (const entry of searches) {
      if (editing?.mode === "rename" && editing.id === entry.id) {
        list.append(editorRow(entry.name, (v) => commitRename(entry.id, v)));
        continue;
      }
      const item = L.DomUtil.create("div", "saved-item", list);

      const main = L.DomUtil.create("button", "saved-name", item) as HTMLButtonElement;
      main.type = "button";
      main.title = "套用這組結果";
      main.innerHTML =
        `<span class="saved-label"></span><span class="saved-count">${entry.count}</span>`;
      (main.querySelector(".saved-label") as HTMLElement).textContent = entry.name;
      main.addEventListener("click", () => applyEntry(entry));

      const ren = L.DomUtil.create("button", "saved-rename", item) as HTMLButtonElement;
      ren.type = "button";
      ren.textContent = "✎";
      ren.title = "改名";
      ren.addEventListener("click", () => {
        editing = { mode: "rename", id: entry.id };
        render();
      });

      const del = L.DomUtil.create("button", "saved-del", item) as HTMLButtonElement;
      del.type = "button";
      del.textContent = "✕";
      del.title = "刪除";
      del.addEventListener("click", () => remove(entry.id));
    }
  };

  const setOpen = (v: boolean) => {
    open = v;
    if (!open) editing = null;
    btn.classList.toggle("active", open);
    btn.setAttribute("aria-pressed", String(open));
    panel.classList.toggle("open", open);
    if (open) render();
  };

  const ctrl = new L.Control({ position: "topright" });
  ctrl.onAdd = () => {
    const wrap = L.DomUtil.create("div", "saved-wrap");

    btn = L.DomUtil.create("button", "saved-toggle", wrap) as HTMLButtonElement;
    btn.type = "button";
    btn.title = "已存結果：儲存／套用查詢結果（不需重新查詢）";
    btn.setAttribute("aria-pressed", "false");
    // 書籤圖示
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1z"
        fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`;

    panel = L.DomUtil.create("div", "saved-panel", wrap);

    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.disableScrollPropagation(wrap);
    btn.addEventListener("click", () => setOpen(!open));

    return wrap;
  };
  ctrl.addTo(map);
}
