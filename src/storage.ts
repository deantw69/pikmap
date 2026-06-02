/**
 * 用 localStorage 記住使用者狀態（地圖視野、選單勾選）。
 * 全部包在 try/catch，避免無痕模式或停用 storage 時出錯。
 */
const PREFIX = "pikmap.";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 忽略（例如儲存空間已滿或被停用） */
  }
}
