import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // 監聽所有網路介面，讓同區網的手機可用本機 IP 連入
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
