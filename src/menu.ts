/**
 * 地點類型勾選選單（取代原本的自由文字編輯器）。
 * 依 config.CATEGORIES 的 group 分區塊渲染勾選框，並回報目前勾選的過濾條件。
 */
import { CATEGORIES, DEFAULT_SELECTED, type QueryCategory } from "./config";
import { load, save } from "./storage";

// 還原上次勾選；沒有紀錄就用預設
const selected = new Set<string>(load<string[]>("selected", DEFAULT_SELECTED));
const checkboxes: HTMLInputElement[] = [];

// Decor 收集追蹤：記住「已擁有」的分類，以及是否只看未擁有
const owned = new Set<string>(load<string[]>("owned", []));
let hideOwned = load<boolean>("hideOwned", false);

/** 把目前勾選存進 localStorage。 */
function persist(): void {
  save("selected", [...selected]);
}

/** 把已擁有清單存進 localStorage。 */
function persistOwned(): void {
  save("owned", [...owned]);
}

/** 依出現順序把分類分組。 */
function groupCategories(): Map<string, QueryCategory[]> {
  const groups = new Map<string, QueryCategory[]>();
  for (const cat of CATEGORIES) {
    const list = groups.get(cat.group) ?? [];
    list.push(cat);
    groups.set(cat.group, list);
  }
  return groups;
}

/** 建立勾選選單；onChange 會在每次勾選變動時被呼叫（用來更新查詢預覽）。 */
export function initMenu(parent: HTMLElement, onChange: () => void): void {
  parent.classList.toggle("hide-owned", hideOwned);

  // 工具列：只看未擁有、清除全部
  const toolbar = document.createElement("div");
  toolbar.className = "menu-toolbar";

  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.className = "link-btn toggle-btn";
  hideBtn.textContent = "只看未擁有";
  hideBtn.setAttribute("aria-pressed", String(hideOwned));
  hideBtn.classList.toggle("active", hideOwned);
  hideBtn.title = "標★為已擁有的 Decor；開啟後隱藏已擁有的類型";
  hideBtn.addEventListener("click", () => {
    hideOwned = !hideOwned;
    save("hideOwned", hideOwned);
    hideBtn.setAttribute("aria-pressed", String(hideOwned));
    hideBtn.classList.toggle("active", hideOwned);
    parent.classList.toggle("hide-owned", hideOwned);
  });
  toolbar.append(hideBtn);

  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.className = "link-btn";
  selectAllBtn.textContent = "選擇全部";
  selectAllBtn.title = "選取目前可見的所有類型（只看未擁有時只會選未擁有的）";
  selectAllBtn.addEventListener("click", () => {
    for (const cb of checkboxes) {
      // 只看未擁有時，已擁有的被隱藏，不納入全選
      if (hideOwned && owned.has(cb.value)) continue;
      if (!cb.checked) {
        cb.checked = true;
        cb.closest(".category-item")?.classList.add("checked");
        selected.add(cb.value);
      }
    }
    persist();
    onChange();
  });
  toolbar.append(selectAllBtn);

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "link-btn";
  clearBtn.textContent = "清除全部";
  clearBtn.addEventListener("click", () => {
    selected.clear();
    for (const cb of checkboxes) {
      cb.checked = false;
      cb.closest(".category-item")?.classList.remove("checked");
    }
    persist();
    onChange();
  });
  toolbar.append(clearBtn);
  parent.append(toolbar);

  // 說明星號用途
  const hint = document.createElement("p");
  hint.className = "menu-hint";
  hint.textContent = "點右側 ★ 標記已全數收集到的 Decor 類型；開啟「只看未擁有」可把它們隱藏，專注在還沒收集的。";
  parent.append(hint);

  for (const [group, cats] of groupCategories()) {
    const title = document.createElement("h3");
    title.className = "group-title";
    title.textContent = group;
    parent.append(title);

    const list = document.createElement("div");
    list.className = "category-list";

    for (const cat of cats) {
      const item = document.createElement("label");
      item.className = "category-item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = cat.id;
      cb.checked = selected.has(cat.id);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(cat.id);
        else selected.delete(cat.id);
        item.classList.toggle("checked", cb.checked);
        persist();
        onChange();
      });
      item.classList.toggle("checked", cb.checked);
      checkboxes.push(cb);

      const text = document.createElement("span");
      text.className = "category-text";
      text.textContent = `${cat.emoji} ${cat.label}`;

      // 「已擁有」星號：標記這個 Decor 已收集到，可被「只看未擁有」隱藏
      const star = document.createElement("button");
      star.type = "button";
      star.className = "own-star";
      star.textContent = owned.has(cat.id) ? "★" : "☆";
      star.title = "標記為已擁有的 Decor";
      star.setAttribute("aria-pressed", String(owned.has(cat.id)));
      item.classList.toggle("owned", owned.has(cat.id));
      star.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = !owned.has(cat.id);
        if (now) owned.add(cat.id);
        else owned.delete(cat.id);
        star.textContent = now ? "★" : "☆";
        star.setAttribute("aria-pressed", String(now));
        item.classList.toggle("owned", now);
        persistOwned();
      });

      item.append(cb, text, star);
      list.append(item);
    }

    parent.append(list);
  }
}

/** 回傳目前勾選的分類（保持 CATEGORIES 的順序）。 */
export function getSelectedCategories(): QueryCategory[] {
  return CATEGORIES.filter((c) => selected.has(c.id));
}
