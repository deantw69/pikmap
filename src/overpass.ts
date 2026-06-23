/**
 * Overpass 查詢執行（查詢/資料來源客製點）
 * - 樣板展開（{{bbox}} 等）
 * - 送出查詢、轉成 GeoJSON
 */
import osmtogeojson from "osmtogeojson";
import type { FeatureCollection } from "geojson";
import { OVERPASS_ENDPOINTS, QUERY_TIMEOUT_MS, type QueryCategory } from "./config";
import { getBboxString } from "./map";

/**
 * 由勾選的分類組出 Overpass 查詢（union 多個類型）。
 * 一般分類只受 {{bbox}} 限制；若分類設了 areaScope（ISO 3166-1 代碼），
 * 會額外與該國家／地區的範圍取交集，落在範圍外的結果不會回傳。
 *
 * 例如 park + worship(areaScope:"JP") 會產生：
 *   [out:json][timeout:25];
 *   area["ISO3166-1"="JP"]->.area_jp;
 *   // gather results
 *   (
 *     nwr["leisure"="park"]({{bbox}});
 *     nwr["amenity"="place_of_worship"](area.area_jp)({{bbox}});
 *   );
 *   // print results
 *   out geom;
 */
/**
 * 組出 union 的本體與所需的 area 宣告。
 * bboxToken 是要塞進每行 nwr 的範圍：一般查詢用樣板 "{{bbox}}"，純點掃描用實際的 "s,w,n,e"。
 */
function buildUnion(categories: QueryCategory[], bboxToken: string): { areaDecls: string; body: string } {
  const scopes = new Map<string, string>(); // ISO 代碼 -> set 名稱
  const lines: string[] = [];

  for (const cat of categories) {
    let scopeSuffix = "";
    if (cat.areaScope) {
      const setName = `area_${cat.areaScope.toLowerCase()}`;
      scopes.set(cat.areaScope, setName);
      scopeSuffix = `(area.${setName})`;
    }
    for (const f of cat.filters) {
      lines.push(`  nwr${f}${scopeSuffix}(${bboxToken});`);
    }
  }

  const areaDecls = [...scopes.entries()]
    .map(([iso, set]) => `area["ISO3166-1"="${iso}"]->.${set};`)
    .join("\n");

  return { areaDecls, body: lines.join("\n") };
}

/** 雷達圓查詢範圍：圓心經緯度與半徑（公尺）。 */
export type Scope = { lat: number; lng: number; radiusM: number };

export function buildQuery(categories: QueryCategory[], scope?: Scope | null): string {
  if (scope) {
    // 雷達圓模式：用 around 限定在圓範圍內，不受目前視野限制。
    // 幾何不以 {{bbox}} 裁切（圓可超出畫面），故用 out geom（無範圍）。
    const token = `around:${scope.radiusM},${scope.lat.toFixed(6)},${scope.lng.toFixed(6)}`;
    const { areaDecls, body } = buildUnion(categories, token);
    return `[out:json][timeout:25];
${areaDecls ? areaDecls + "\n" : ""}// gather results
(
${body}
);
// print results
out geom;`;
  }

  const { areaDecls, body } = buildUnion(categories, "{{bbox}}");
  // out geom({{bbox}}) 會把幾何裁切到目前視野：長河流等線狀資料只會畫出視野內那一段，
  // 不會把整條 way（源頭到出海口）都回傳，資料量與沿線標記都因此大減。
  return `[out:json][timeout:25];
${areaDecls ? areaDecls + "\n" : ""}// gather results
(
${body}
);
// print results
out geom({{bbox}});`;
}

/**
 * 純點模式用：全分類 union、限定在指定 bbox（"south,west,north,east"）、用 out center 輕量輸出。
 * 一個 S2 L14 塊一次查詢，範圍小、不會 timeout。
 */
export function buildScanQuery(categories: QueryCategory[], bbox: string): string {
  const { areaDecls, body } = buildUnion(categories, bbox);
  return `[out:json][timeout:60];
${areaDecls ? areaDecls + "\n" : ""}(
${body}
);
out center;`;
}

/**
 * 展開 overpass-turbo 風格的樣板。
 * 目前支援 {{bbox}}（換成目前地圖視野）。之後可在這裡加 {{geocodeArea:...}} 等。
 */
export function expandTemplate(query: string): string {
  return query.replace(/\{\{\s*bbox\s*\}\}/g, getBboxString());
}

/** 可重試（換鏡像）的錯誤：伺服器忙碌、逾時、連線問題。語法等錯誤不換鏡像。 */
class RetryableError extends Error {}

/** 取得選取分類中最深的降級層數（沒有任何 fallbackFilters 則為 0）。 */
function maxFallbackLevel(categories: QueryCategory[]): number {
  return Math.max(0, ...categories.map((c) => c.fallbackFilters?.length ?? 0));
}

/** 把分類調整到指定降級層級：level 0 用原始 filters；之後改用 fallbackFilters（不足則取最輕一階）。 */
function categoriesAtLevel(categories: QueryCategory[], level: number): QueryCategory[] {
  if (level === 0) return categories;
  return categories.map((c) => {
    const tiers = c.fallbackFilters;
    if (!tiers || tiers.length === 0) return c; // 無降級設定者維持原樣
    const idx = Math.min(level, tiers.length) - 1;
    return { ...c, filters: tiers[idx] };
  });
}

/**
 * 一般查詢（含漸進降級）：先用完整 filters；若逾時／伺服器忙碌而失敗，
 * 對有設 fallbackFilters 的分類逐步改用更輕量的條件再重試（每一階都會輪流試各鏡像）。
 */
export async function runQueryForCategories(
  categories: QueryCategory[],
  scope?: Scope | null,
): Promise<FeatureCollection> {
  const maxLevel = maxFallbackLevel(categories);
  let lastErr: Error = new Error("查詢失敗");
  for (let level = 0; level <= maxLevel; level++) {
    try {
      return await runQuery(buildQuery(categoriesAtLevel(categories, level), scope));
    } catch (err) {
      lastErr = err as Error; // 還有更輕的層級就繼續降級重試，否則拋出
    }
  }
  throw lastErr;
}

/**
 * 送查詢到 Overpass API，回傳轉好的 GeoJSON。
 * 依序嘗試 OVERPASS_ENDPOINTS：某鏡像忙碌（504/429/5xx）或逾時時自動換下一個。
 */
export async function runQuery(rawQuery: string): Promise<FeatureCollection> {
  const query = expandTemplate(rawQuery);

  let lastErr: Error = new Error("查詢失敗");
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await postQuery(endpoint, query);
    } catch (err) {
      lastErr = err as Error;
      if (!(err instanceof RetryableError)) throw err; // 語法錯誤等：換鏡像也沒用，直接拋出
      // 否則試下一個鏡像
    }
  }
  throw lastErr; // 全部鏡像都忙碌／逾時
}

/** 對單一端點送出一次查詢。可重試的失敗丟 RetryableError。 */
async function postQuery(endpoint: string, query: string): Promise<FeatureCollection> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new RetryableError(`查詢逾時（超過 ${QUERY_TIMEOUT_MS / 1000} 秒）`);
    }
    throw new RetryableError("無法連線到 Overpass API：" + (err as Error).message);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = `Overpass 回應 ${res.status}${text ? "：" + stripHtml(text).slice(0, 200) : ""}`;
    // 5xx（如 504）與 429（限流）多為暫時忙碌 → 換鏡像；4xx（語法等）直接拋出
    if (res.status >= 500 || res.status === 429) throw new RetryableError(msg);
    throw new Error(msg);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Overpass 回應不是有效的 JSON（請檢查查詢語法是否含 [out:json]）");
  }

  // osmtogeojson 接受 Overpass JSON，回傳 GeoJSON FeatureCollection
  return osmtogeojson(data) as FeatureCollection;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
