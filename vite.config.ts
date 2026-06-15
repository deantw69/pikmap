import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages 部署在 https://deantw69.github.io/pikmap/，build 時要用此子路徑為 base；
// dev / preview 仍用根路徑，方便本機與區網測試。
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/pikmap/" : "/",
  server: {
    // 監聽所有網路介面，讓同區網的手機可用本機 IP 連入
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-src.svg", "apple-touch-icon.png"],
      // 讓開發模式也能測安裝（正式版本來就會啟用）
      devOptions: { enabled: true },
      workbox: {
        // 快取 app 殼；OSM 圖磚與 Overpass 結果仍需連網
        globPatterns: ["**/*.{js,css,html,svg,png}"],
      },
      manifest: {
        name: "pikmap — Pikmin Bloom 地點查詢",
        short_name: "pikmap",
        description:
          "查詢地圖視野內的地點類型（對應 Pikmin Bloom 的 Decor Pikmin），規劃要去哪走、收哪些裝飾。",
        lang: "zh-Hant",
        theme_color: "#2b7a4b",
        background_color: "#1d2b24",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
}));
