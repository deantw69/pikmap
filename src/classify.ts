/**
 * 分類比對（查詢與上色／純點判定的共用單一真相來源）。
 * filter 字串 → 條件、判斷 feature 是否符合、以及「最精確一類」的解析都集中在這裡。
 */
import { CATEGORIES, CATEGORY_PRIORITY, type QueryCategory } from "./config";

/** 一組 [key, value] 條件（同一個 filter 內為 AND） */
export type FilterConds = [string, string][];

/** 把 ["amenity"="restaurant"]["cuisine"="sushi"] 解析成 [[amenity,restaurant],[cuisine,sushi]]。 */
export function parseFilter(filter: string): FilterConds {
  const pairs: FilterConds = [];
  const re = /\["([^"]+)"="([^"]+)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter)) !== null) pairs.push([m[1], m[2]]);
  return pairs;
}

/**
 * 判斷 tags 是否符合一組 filter（任一 filter 的所有條件都相符即符合；filter 之間為 OR）。
 * 會處理 OSM 以分號分隔的多值（例如 cuisine=japanese;sushi）。
 */
export function matchesFilterSet(props: Record<string, unknown>, filterSet: FilterConds[]): boolean {
  return filterSet.some((conds) =>
    conds.every(([k, v]) => {
      const tag = props[k];
      if (tag === undefined || tag === null) return false;
      const s = String(tag);
      return s === v || s.split(";").includes(v);
    }),
  );
}

// 預先解析每個分類的 filters，純點掃描時對每點比對全部分類用得到。
const PARSED: { cat: QueryCategory; filters: FilterConds[] }[] = CATEGORIES.map((c) => ({
  cat: c,
  filters: c.filters.map(parseFilter),
}));

/** 優先序索引：越小越優先；未列入 CATEGORY_PRIORITY 者以 CATEGORIES 順序墊底。 */
function priorityIndex(id: string): number {
  const i = CATEGORY_PRIORITY.indexOf(id);
  if (i >= 0) return i;
  return CATEGORY_PRIORITY.length + CATEGORIES.findIndex((c) => c.id === id);
}

/**
 * 把一個 feature 的 tags 解析成「最精確的單一分類」（純點模式用）。
 * 命中多個分類時依 CATEGORY_PRIORITY 取最優先者；都不符合回 null。
 */
export function resolveCategory(props: Record<string, unknown>): QueryCategory | null {
  let best: QueryCategory | null = null;
  let bestRank = Infinity;
  for (const { cat, filters } of PARSED) {
    if (!matchesFilterSet(props, filters)) continue;
    const rank = priorityIndex(cat.id);
    if (rank < bestRank) {
      bestRank = rank;
      best = cat;
    }
  }
  return best;
}
