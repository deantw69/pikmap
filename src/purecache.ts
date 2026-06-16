/**
 * 純點模式的本機快取（provider 抽象的第一層）。
 * 以 S2 L14 塊為單位存掃描結果到 IndexedDB，含 TTL。
 * 未來要接「內建預掃 DB」或「遠端/眾包 DB」時，從這層之上再加來源即可，不必動掃描與渲染。
 * IndexedDB 不可用時（無痕等）自動退回記憶體快取，功能不變、只是不持久。
 */
import { PURE_CACHE_TTL_MS } from "./config";

/** 單一 POI 的精簡紀錄（只存渲染所需，盡量小） */
export interface PoiRec {
  lat: number;
  lng: number;
  /** 已解析的分類 id */
  c: string;
  /** 名稱（可空字串） */
  nm: string;
  /** OSM 識別："node/123" 之類，用於跨塊去重 */
  id: string;
}

/** 一個 L14 塊的掃描結果 */
export interface TileRec {
  /** L14 cell 的 hilbert quadkey */
  id: string;
  /** 掃描時間（epoch ms），用於 TTL 判斷 */
  scannedAt: number;
  pois: PoiRec[];
}

const DB_NAME = "pikmap";
const STORE = "puretiles";
const DB_VERSION = 1;

const mem = new Map<string, TileRec>(); // IndexedDB 不可用時的退路
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function fresh(rec: TileRec | undefined | null): TileRec | null {
  if (!rec) return null;
  return Date.now() - rec.scannedAt <= PURE_CACHE_TTL_MS ? rec : null;
}

/** 取多個 L14 塊（只回傳未過期者）。 */
export async function getTiles(ids: string[]): Promise<Map<string, TileRec>> {
  const out = new Map<string, TileRec>();
  const db = await openDb();
  if (!db) {
    for (const id of ids) {
      const r = fresh(mem.get(id));
      if (r) out.set(id, r);
    }
    return out;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const r = fresh(req.result as TileRec | undefined);
        if (r) out.set(id, r);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  return out;
}

/** 寫入一個 L14 塊。 */
export async function putTile(rec: TileRec): Promise<void> {
  const db = await openDb();
  if (!db) {
    mem.set(rec.id, rec);
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** 清空所有快取。 */
export async function clearTiles(): Promise<void> {
  mem.clear();
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
