/**
 * 地點類型勾選選單（取代原本的自由文字編輯器）。
 * 依 config.CATEGORIES 的 group 分區塊渲染勾選框，並回報目前勾選的過濾條件。
 */
import { CATEGORIES, DEFAULT_SELECTED, type QueryCategory } from "./config";
import { load, save } from "./storage";

// 還原上次勾選；沒有紀錄就用預設
const selected = new Set<string>(load<string[]>("selected", DEFAULT_SELECTED));
const checkboxes: HTMLInputElement[] = [];

/** 把目前勾選存進 localStorage。 */
function persist(): void {
  save("selected", [...selected]);
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
  // 工具列：清除全部
  const toolbar = document.createElement("div");
  toolbar.className = "menu-toolbar";
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

      item.append(cb, text);
      list.append(item);
    }

    parent.append(list);
  }
}

/** 回傳目前勾選的分類（保持 CATEGORIES 的順序）。 */
export function getSelectedCategories(): QueryCategory[] {
  return CATEGORIES.filter((c) => selected.has(c.id));
}

/** 回傳目前勾選類型對應的過濾條件（保持 CATEGORIES 的順序；多標籤類型會展開成多筆）。 */
export function getSelectedFilters(): string[] {
  return getSelectedCategories().flatMap((c) => c.filters);
}
