// 一次性：把 public/icon-src.svg 轉成 PWA 需要的 PNG 圖示。
// 用法：node scripts/gen-icons.mjs（需要 devDependency sharp）
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/icon-src.svg", import.meta.url));
const out = (name, size) =>
  sharp(svg, { density: 384 }).resize(size, size).png().toFile(new URL(`../public/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

await Promise.all([
  out("pwa-192x192.png", 192),
  out("pwa-512x512.png", 512),
  out("apple-touch-icon.png", 180),
]);
console.log("icons generated");
