import { defineConfig } from "vite";

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
}));
