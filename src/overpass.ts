/**
 * Overpass 查詢執行（查詢/資料來源客製點）
 * - 樣板展開（{{bbox}} 等）
 * - 送出查詢、轉成 GeoJSON
 */
import osmtogeojson from "osmtogeojson";
import type { FeatureCollection } from "geojson";
import { OVERPASS_ENDPOINT, QUERY_TIMEOUT_MS } from "./config";
import { getBboxString } from "./map";

/**
 * 由勾選的過濾條件組出 Overpass 查詢（union 多個類型）。
 * 例如 filters = ['["leisure"="park"]', '["tourism"="zoo"]'] 會產生：
 *   [out:json][timeout:25];
 *   // gather results
 *   (
 *     nwr["leisure"="park"]({{bbox}});
 *     nwr["tourism"="zoo"]({{bbox}});
 *   );
 *   // print results
 *   out geom;
 */
export function buildQuery(filters: string[]): string {
  const body = filters.map((f) => `  nwr${f}({{bbox}});`).join("\n");
  return `[out:json][timeout:25];
// gather results
(
${body}
);
// print results
out geom;`;
}

/**
 * 展開 overpass-turbo 風格的樣板。
 * 目前支援 {{bbox}}（換成目前地圖視野）。之後可在這裡加 {{geocodeArea:...}} 等。
 */
export function expandTemplate(query: string): string {
  return query.replace(/\{\{\s*bbox\s*\}\}/g, getBboxString());
}

/** 送查詢到 Overpass API，回傳轉好的 GeoJSON。 */
export async function runQuery(rawQuery: string): Promise<FeatureCollection> {
  const query = expandTemplate(rawQuery);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`查詢逾時（超過 ${QUERY_TIMEOUT_MS / 1000} 秒）`);
    }
    throw new Error("無法連線到 Overpass API：" + (err as Error).message);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Overpass 回應 ${res.status}${text ? "：" + stripHtml(text).slice(0, 200) : ""}`);
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
