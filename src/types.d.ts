/// <reference types="vite/client" />

// CSS 副作用匯入（由 Vite 處理；這行只是讓 TS 編輯器不報錯）
declare module "*.css";

declare module "osmtogeojson" {
  import type { FeatureCollection } from "geojson";
  /** 將 Overpass/OSM JSON（或 XML Document）轉成 GeoJSON。 */
  export default function osmtogeojson(data: unknown, options?: unknown): FeatureCollection;
}

declare module "s2-geometry" {
  export interface S2LatLng {
    lat: number;
    lng: number;
  }
  export class S2Cell {
    static FromLatLng(latlng: S2LatLng, level: number): S2Cell;
    /** 回傳該 cell 的四個角（依序，可直接畫多邊形） */
    getCornerLatLngs(): S2LatLng[];
    /** 回傳 cell 中心點 */
    getLatLng(): S2LatLng;
    /** 回傳四個相鄰 cell */
    getNeighbors(): S2Cell[];
    /** 唯一字串 id，可用來去重 */
    toHilbertQuadkey(): string;
  }
  export const S2: {
    S2Cell: typeof S2Cell;
    MAX_LEVEL: number;
  };
}
