import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
await build({
  entryPoints: { content: "src/content.ts", background: "src/background.ts", popup: "src/popup.ts" },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: true,
  logLevel: "info",
});
cpSync("manifest.json", "dist/manifest.json");
cpSync("popup.html", "dist/popup.html");
