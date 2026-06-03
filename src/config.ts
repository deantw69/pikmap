/**
 * pikmap 設定（查詢/資料來源客製點）
 * 想換 API endpoint、預設查詢、預設地圖位置，都改這裡。
 */

/** Overpass API 端點。可換成自架 instance 或其他公開鏡像。 */
export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/** 品牌名稱 */
export const BRAND = "pikmap";

/** 地圖初始視野 */
export const MAP_DEFAULT = {
  /** [lat, lng] — 預設台北市中心 */
  center: [25.0375, 121.5637] as [number, number],
  zoom: 14,
};

/** 查詢逾時（毫秒） */
export const QUERY_TIMEOUT_MS = 30_000;

/** 只選一種類型時，結果統一用這個顏色 */
export const MARKER_COLOR = "#2b7a4b";

/** 選兩種以上時，依序給每個類型不同顏色（不夠用會循環） */
export const MARKER_PALETTE = [
  "#e6194b",
  "#3cb44b",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#42d4f4",
  "#f032e6",
  "#bfef45",
  "#469990",
  "#9a6324",
  "#800000",
  "#000075",
];

/** S2 網格的 cell level（Pokémon GO / Pikmin Bloom 慣用 level 17） */
export const S2_GRID_LEVEL = 17;

/** 縮放到此 zoom（含）以上才顯示 S2 網格 */
export const GRID_MIN_ZOOM = 17;

/**
 * 可勾選的地點類型（靈感來自 Decor Pikmin 的裝飾分類）。
 * 每個分類對應一個 Overpass 過濾條件，勾選後會以 nwr<filter>({{bbox}}) 加入查詢。
 * 想新增/修改類型，改這個陣列即可。
 */
export interface QueryCategory {
  /** 唯一 id */
  id: string;
  /** 顯示名稱 */
  label: string;
  /** 裝飾用 emoji */
  emoji: string;
  /** 分組（決定在選單裡的區塊） */
  group: string;
  /**
   * Overpass 過濾條件清單。同一種地點若有多種 OSM 標籤慣例就全部列出，
   * 勾選後每個條件各成一行 nwr<filter>({{bbox}})，等同 OR。
   * 每個字串內可串多個方括號做 AND，例如 ["amenity"="restaurant"]["cuisine"="sushi"]。
   */
  filters: string[];
  /**
   * 可選：把此分類的結果限制在某個國家／地區內（ISO 3166-1 代碼，例如 "JP"）。
   * 設定後查詢會加上 (area.<iso>) 與 bbox 取交集，落在該地區之外的結果不會回傳。
   */
  areaScope?: string;
}

// 完全對應 https://www.pikminwiki.com/Decor_Pikmin 頁面上「直接寫出的 OSM 標籤」。
// 只採用頁面實際列出的 tag，不自行推導或增刪。一個裝飾若列了多個 tag 就全放（OR）。
// （頁面未對應地點的 Roadside / Rainy / Snowy 不列入。）
export const CATEGORIES: QueryCategory[] = [
  // ── 美食 ──
  { id: "restaurant", label: "餐廳", emoji: "🍴", group: "美食", filters: ['["amenity"="restaurant"]'] }, // Restaurant
  { id: "cafe", label: "咖啡廳", emoji: "☕", group: "美食", filters: ['["amenity"="cafe"]'] }, // Café
  { id: "fast_food", label: "漢堡店", emoji: "🍔", group: "美食", filters: ['["amenity"="fast_food"]'] }, // Burger Place
  { id: "sushi", label: "壽司店", emoji: "🍣", group: "美食", filters: ['["cuisine"="sushi"]'] }, // Sushi Restaurant
  { id: "ramen", label: "拉麵店", emoji: "🍜", group: "美食", filters: ['["cuisine"="chinese"]', '["cuisine"="noodle"]', '["cuisine"="ramen"]', '["cuisine"="udon"]', '["cuisine"="soba"]'] }, // Ramen Restaurant
  { id: "italian", label: "義式餐廳", emoji: "🍕", group: "美食", filters: ['["cuisine"="pizza"]', '["cuisine"="mediterranean"]'] }, // Italian Restaurant
  { id: "curry", label: "咖哩店", emoji: "🍛", group: "美食", filters: ['["cuisine"="curry"]', '["cuisine"="indian"]', '["cuisine"="sri_lankan"]'] }, // Curry Restaurant
  { id: "mexican", label: "墨西哥餐廳", emoji: "🌮", group: "美食", filters: ['["cuisine"="mexican"]'] }, // Mexican Restaurant
  { id: "korean", label: "韓式餐廳", emoji: "🥬", group: "美食", filters: ['["cuisine"="korean"]'] }, // Korean Restaurant
  { id: "sweets", label: "甜點店", emoji: "🍰", group: "美食", filters: ['["shop"="pastry"]'] }, // Sweetshop
  { id: "bakery", label: "麵包店", emoji: "🥖", group: "美食", filters: ['["shop"="bakery"]'] }, // Bakery

  // ── 購物 ──
  { id: "convenience", label: "超商", emoji: "🏪", group: "購物", filters: ['["shop"="convenience"]'] }, // Corner Store
  { id: "supermarket", label: "超市", emoji: "🛒", group: "購物", filters: ['["shop"="supermarket"]'] }, // Supermarket
  { id: "makeup", label: "美妝 / 百貨", emoji: "💄", group: "購物", filters: ['["shop"="department_store"]'] }, // Makeup Store
  { id: "clothes", label: "服飾店", emoji: "👕", group: "購物", filters: ['["shop"="clothes"]', '["shop"="shoes"]'] }, // Clothes Store
  { id: "hairdresser", label: "美髮沙龍", emoji: "💇", group: "購物", filters: ['["shop"="hairdresser"]'] }, // Hair Salon
  { id: "appliance", label: "電器行", emoji: "🔌", group: "購物", filters: ['["shop"="appliance"]', '["shop"="computer"]', '["shop"="electronics"]'] }, // Appliances Store
  { id: "diy", label: "DIY / 五金", emoji: "🔧", group: "購物", filters: ['["shop"="doityourself"]', '["shop"="hardware"]'] }, // DIY Store
  { id: "laundry", label: "洗衣 / 乾洗店", emoji: "🧺", group: "購物", filters: ['["shop"="laundry"]', '["shop"="dry_cleaning"]'] }, // Laundromats & Dry Cleaners

  // ── 自然 ──
  { id: "park", label: "公園", emoji: "🌳", group: "自然", filters: ['["leisure"="park"]'] }, // Park
  { id: "forest", label: "森林", emoji: "🌲", group: "自然", filters: ['["natural"="wood"]', '["landuse"="forest"]'] }, // Forest
  { id: "water", label: "水域", emoji: "💧", group: "自然", filters: ['["natural"="water"]'] }, // Waterside
  { id: "beach", label: "海灘", emoji: "🏖️", group: "自然", filters: ['["natural"="beach"]'] }, // Beach
  { id: "peak", label: "山峰", emoji: "⛰️", group: "自然", filters: ['["natural"="peak"]'] }, // Mountain
  { id: "zoo", label: "動物園", emoji: "🦁", group: "自然", filters: ['["tourism"="zoo"]'] }, // Zoo

  // ── 休閒文化 ──
  { id: "cinema", label: "電影院", emoji: "🎬", group: "休閒文化", filters: ['["amenity"="cinema"]'] }, // Movie Theater
  { id: "art_gallery", label: "美術館", emoji: "🎨", group: "休閒文化", filters: ['["shop"="art"]'] }, // Art Gallery
  { id: "theme_park", label: "遊樂園", emoji: "🎡", group: "休閒文化", filters: ['["tourism"="theme_park"]'] }, // Theme Park
  { id: "stadium", label: "體育場", emoji: "🏟️", group: "休閒文化", filters: ['["leisure"="stadium"]'] }, // Stadium
  { id: "library", label: "圖書館 / 書店", emoji: "📚", group: "休閒文化", filters: ['["amenity"="library"]', '["shop"="books"]'] }, // Library & Bookstore
  { id: "university", label: "大學 / 學院", emoji: "🎓", group: "休閒文化", filters: ['["amenity"="university"]', '["amenity"="college"]'] }, // University & College
  { id: "worship", label: "寺廟 / 神社", emoji: "⛩️", group: "休閒文化", filters: ['["amenity"="place_of_worship"]'], areaScope: "JP" }, // Shrines and Temples（僅限日本境內）

  // ── 生活機能 ──
  { id: "pharmacy", label: "藥局", emoji: "💊", group: "生活機能", filters: ['["amenity"="pharmacy"]'] }, // Pharmacy
  { id: "post_office", label: "郵局", emoji: "✉️", group: "生活機能", filters: ['["amenity"="post_office"]'] }, // Post Office
  { id: "hotel", label: "飯店", emoji: "🏨", group: "生活機能", filters: ['["tourism"="hotel"]'] }, // Hotel

  // ── 交通 ──
  { id: "airport", label: "機場", emoji: "✈️", group: "交通", filters: ['["aeroway"="aerodrome"]'] }, // Airport
  { id: "station", label: "車站", emoji: "🚉", group: "交通", filters: ['["railway"="station"]', '["building"="train_station"]'] }, // Station
  { id: "bus_stop", label: "公車站", emoji: "🚏", group: "交通", filters: ['["highway"="bus_stop"]'] }, // Bus Stop
  { id: "bridge", label: "橋樑", emoji: "🌉", group: "交通", filters: ['["bridge"="yes"]'] }, // Bridge
];

/** 預設勾選的分類 id */
export const DEFAULT_SELECTED = [];
